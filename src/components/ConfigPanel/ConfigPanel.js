/**
 * Settings popup for operators: per-slot image, label, and inventory count
 * (inventory drives the spin odds — 0 means that spot can't be landed on),
 * plus the losing-slot toggle. Saved config is handed back to the host via
 * onSave; the host owns persistence and rebuilding the wheel.
 */
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

    this._rows = prizes.map((prize) => {
      const row = prizeRow(prize);
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
        <input type="text" data-cfg="loserImage" placeholder="Loser image URL" />
        <label class="cfg__num">Odds weight
          <input type="number" data-cfg="loserWeight" min="0" step="0.5" />
        </label>
      </div>`;
    loserWrap.querySelector('[data-cfg="loserTitle"]').value = loser.title || '';
    loserWrap.querySelector('[data-cfg="loserImage"]').value = loser.image || '';
    loserWrap.querySelector('[data-cfg="loserWeight"]').value = settings.loserWeight ?? 1;
    panel.appendChild(loserWrap);

    const error = document.createElement('div');
    error.className = 'cfg__error';
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
        image: row.image.value.trim(),
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
        image: loserWrap.querySelector('[data-cfg="loserImage"]').value.trim()
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
  for (const text of ['Spot', 'Label', 'Image URL', 'Inventory', 'Grand ★']) {
    const cell = document.createElement('div');
    cell.textContent = text;
    el.appendChild(cell);
  }
  return el;
}

function prizeRow(prize) {
  const el = document.createElement('div');
  el.className = 'cfg__row';

  const tag = document.createElement('div');
  tag.className = 'cfg__tag';
  tag.textContent = prize.id.replace('prize-', '#');

  const title = input('text', prize.title, 'Label');
  const image = input('text', prize.image || '', 'Image URL');
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
  el.appendChild(image);
  el.appendChild(inventory);
  el.appendChild(grandWrap);
  return { el, title, image, inventory, grand };
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
