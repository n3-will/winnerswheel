/**
 * Settings popup for operators: per-slot image, label, and inventory count
 * (inventory drives the spin odds — 0 means that spot can't be landed on),
 * plus the losing-slot toggle. Saved config is handed back to the host via
 * onSave; the host owns persistence and rebuilding the wheel.
 *
 * Images come from a local FILE PICKER (stored as data URLs so they survive
 * reloads) — no URLs to type. Oversized files are refused outright with a
 * plain-language message; we never resize on the operator's behalf.
 */

const MAX_IMAGE_BYTES = 300 * 1024; // ~300 KB keeps 9 slots inside localStorage
const MAX_IMAGE_DIMENSION = 2048;

function prettyBytes(n) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}
export class ConfigPanel {
  /**
   * @param {object} hooks
   * @param {Function} hooks.getConfig () => ({ prizes, settings })
   * @param {Function} hooks.onSave    ({ prizes, settings }) => string|void
   *                                   return an error string to keep the
   *                                   popup open and show it
   */
  constructor({ getConfig, onSave }) {
    this.getConfig = getConfig;
    this.onSave = onSave;
    this.overlay = null;
  }

  open() {
    if (this.overlay) return;
    const { prizes, settings } = this.getConfig();

    const overlay = document.createElement('div');
    overlay.className = 'cfg';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Wheel settings');

    const panel = document.createElement('div');
    panel.className = 'cfg__panel';

    const title = document.createElement('h2');
    title.className = 'cfg__title';
    title.textContent = 'Wheel Settings';
    panel.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'cfg__grid';
    grid.appendChild(headerRow());

    const error = document.createElement('div');
    error.className = 'cfg__error';
    this._error = error;

    this._rows = prizes.map((prize) => {
      const row = prizeRow(prize, (msg) => { error.textContent = msg; });
      grid.appendChild(row.el);
      return row;
    });

    panel.appendChild(grid);

    // Grand Prize designation: exactly one spot, or none at all.
    const grandNone = document.createElement('label');
    grandNone.className = 'cfg__check cfg__grand-none';
    const noneRadio = document.createElement('input');
    noneRadio.type = 'radio';
    noneRadio.name = 'cfg-grand';
    noneRadio.checked = !prizes.some((p) => p.isGrandPrize);
    grandNone.appendChild(noneRadio);
    grandNone.appendChild(document.createTextNode(' No Grand Prize (all spots are regular prizes)'));
    panel.appendChild(grandNone);

    // losing slot controls
    const loserWrap = document.createElement('div');
    loserWrap.className = 'cfg__loser';
    const loser = { ...(settings.loserPrize || {}) };
    loserWrap.innerHTML = `
      <label class="cfg__check">
        <input type="checkbox" data-cfg="allowLosing" ${settings.allowLosingResult ? 'checked' : ''} />
        <span>Include a losing spot</span>
      </label>
      <div class="cfg__loser-fields">
        <input type="text" data-cfg="loserTitle" placeholder="Loser label" />
        <span data-cfg="loserImageSlot"></span>
        <label class="cfg__num">Odds weight
          <input type="number" data-cfg="loserWeight" min="0" step="0.5" />
        </label>
      </div>`;
    loserWrap.querySelector('[data-cfg="loserTitle"]').value = loser.title || '';
    loserWrap.querySelector('[data-cfg="loserWeight"]').value = settings.loserWeight ?? 1;
    this._loserImage = imagePicker(loser.image || '', (msg) => { error.textContent = msg; });
    loserWrap.querySelector('[data-cfg="loserImageSlot"]').replaceWith(this._loserImage.el);
    panel.appendChild(loserWrap);

    panel.appendChild(error);

    const actions = document.createElement('div');
    actions.className = 'cfg__actions';
    const cancel = button('Cancel', 'cfg__btn');
    const save = button('Save', 'cfg__btn cfg__btn--primary');
    actions.appendChild(cancel);
    actions.appendChild(save);
    panel.appendChild(actions);

    cancel.addEventListener('click', () => this.close());
    save.addEventListener('click', () => {
      const result = this._collect(prizes, settings, loserWrap);
      const problem = validateDraft(result) || this.onSave(result);
      if (problem) {
        error.textContent = problem;
        return;
      }
      this.close();
    });
    overlay.addEventListener('pointerdown', (e) => {
      if (e.target === overlay) this.close();
    });

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    this.overlay = overlay;
  }

  close() {
    this.overlay?.remove();
    this.overlay = null;
  }

  _collect(prizes, settings, loserWrap) {
    const nextPrizes = prizes.map((prize, i) => {
      const row = this._rows[i];
      return {
        ...prize,
        title: row.title.value.trim() || prize.title,
        image: row.image.value,
        inventory: Math.max(Math.floor(Number(row.inventory.value) || 0), 0),
        isGrandPrize: row.grand.checked
      };
    });
    const nextSettings = {
      ...settings,
      allowLosingResult: loserWrap.querySelector('[data-cfg="allowLosing"]').checked,
      loserWeight: Math.max(Number(loserWrap.querySelector('[data-cfg="loserWeight"]').value) || 0, 0),
      loserPrize: {
        ...(settings.loserPrize || { id: 'loser' }),
        title: loserWrap.querySelector('[data-cfg="loserTitle"]').value.trim() || 'Try Again',
        image: this._loserImage.value
      }
    };
    return { prizes: nextPrizes, settings: nextSettings };
  }
}

function validateDraft({ prizes }) {
  if (prizes.some((p) => !p.title)) return 'Every spot needs a label.';
  return '';
}

function headerRow() {
  const el = document.createElement('div');
  el.className = 'cfg__row cfg__row--head';
  for (const text of ['Spot', 'Label', 'Image', 'Inventory', 'Grand ★']) {
    const cell = document.createElement('div');
    cell.textContent = text;
    el.appendChild(cell);
  }
  return el;
}

function prizeRow(prize, onImageError) {
  const el = document.createElement('div');
  el.className = 'cfg__row';

  const tag = document.createElement('div');
  tag.className = 'cfg__tag';
  tag.textContent = prize.id.replace('prize-', '#');

  const title = input('text', prize.title, 'Label');
  const image = imagePicker(prize.image || '', onImageError);
  const inventory = input('number', String(prize.inventory ?? 0), '0');
  inventory.min = '0';
  inventory.step = '1';

  const grandWrap = document.createElement('div');
  grandWrap.className = 'cfg__grand-cell';
  const grand = document.createElement('input');
  grand.type = 'radio';
  grand.name = 'cfg-grand';
  grand.checked = Boolean(prize.isGrandPrize);
  grand.setAttribute('aria-label', `Mark ${prize.title} as the Grand Prize`);
  grandWrap.appendChild(grand);

  el.appendChild(tag);
  el.appendChild(title);
  el.appendChild(image.el);
  el.appendChild(inventory);
  el.appendChild(grandWrap);
  return { el, title, image, inventory, grand };
}

/**
 * Local-file image picker: thumbnail + Choose button + hidden file input.
 * Oversized files are REFUSED (we don't secretly resize anything) with a
 * message telling the operator to shrink the image themselves.
 */
function imagePicker(initialValue, onError) {
  const el = document.createElement('div');
  el.className = 'cfg__img';

  const thumb = document.createElement('img');
  thumb.className = 'cfg__img-thumb';
  thumb.alt = '';
  if (initialValue) thumb.src = initialValue;

  const choose = document.createElement('button');
  choose.type = 'button';
  choose.className = 'cfg__btn cfg__btn--small';
  choose.textContent = initialValue ? 'Change…' : 'Choose…';

  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/*';
  file.hidden = true;

  const picker = { el, value: initialValue };

  choose.addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    const chosen = file.files && file.files[0];
    file.value = '';
    if (!chosen) return;

    if (chosen.size > MAX_IMAGE_BYTES) {
      onError(
        `"${chosen.name}" is ${prettyBytes(chosen.size)} — that big of an image will bog the wheel down ` +
        `and it won't look any better for it. Not resizing it for you: shrink it yourself ` +
        `(WebP or SVG under ${prettyBytes(MAX_IMAGE_BYTES)} is perfect — feed it to an AI and tell it to resize it), then pick it again.`
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const probe = new Image();
      probe.onload = () => {
        if (probe.width > MAX_IMAGE_DIMENSION || probe.height > MAX_IMAGE_DIMENSION) {
          onError(
            `"${chosen.name}" is ${probe.width}×${probe.height}px — way more pixels than any panel will ever show. ` +
            `Export it at ${MAX_IMAGE_DIMENSION}px or less and pick it again.`
          );
          return;
        }
        picker.value = dataUrl;
        thumb.src = dataUrl;
        choose.textContent = 'Change…';
        onError('');
      };
      probe.onerror = () => onError(`Couldn't read "${chosen.name}" as an image.`);
      probe.src = dataUrl;
    };
    reader.readAsDataURL(chosen);
  });

  el.appendChild(thumb);
  el.appendChild(choose);
  el.appendChild(file);
  return picker;
}

function input(type, value, placeholder) {
  const el = document.createElement('input');
  el.type = type;
  el.value = value;
  el.placeholder = placeholder;
  return el;
}

function button(text, className) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = text;
  return el;
}
