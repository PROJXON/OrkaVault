// Runs sandboxed (sandbox: true in main.cjs), so only sandbox-safe modules
// (contextBridge, ipcRenderer, ...) are available here. External links are
// opened by main.cjs's window-open / will-navigate handlers, not exposed to
// the renderer.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // lib/consent.js: the desktop app skips the consent banner.
  isDesktop: true,
});
