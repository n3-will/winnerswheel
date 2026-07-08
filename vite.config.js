import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2019',
    cssTarget: 'chrome87'
  },
  test: {
    environment: 'jsdom'
  }
});
