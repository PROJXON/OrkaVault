const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

// Required on Windows for `new Notification()` in the renderer to actually
// surface as a native toast — without a registered AppUserModelID, Windows
// silently drops notifications from unpackaged/dev Electron apps instead of
// erroring, which looks like "the popup code runs but nothing shows".
// No-op on macOS/Linux. Must run before app.whenReady().
if (process.platform === 'win32') {
  app.setAppUserModelId('com.projxon.orkavault');
}

// ── Memory & Performance Optimization ──────────────────────────────────────
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');
app.commandLine.appendSwitch('disable-features', 'TranslateUI');

if (isDev) {
  app.commandLine.appendSwitch('no-proxy-server');
}

const DEV_URL = 'http://localhost:3000';
let mainWindow;

// ── Navigation / window-open policy (NEW-FEAT §11.4) ───────────────────────
// The CSP for the desktop build is a <meta> tag injected by `vite build`
// (csp.config.js): file:// pages have no response headers for
// session.webRequest.onHeadersReceived to attach one to.

/** Is this URL part of the app itself (built files or the Vite dev server)? */
function isAppUrl(url) {
  try {
    const u = new URL(url);
    return isDev ? u.origin === new URL(DEV_URL).origin : u.protocol === 'file:';
  } catch {
    return false;
  }
}

// Google Identity Services opens its sign-in popup on accounts.google.com.
function isGoogleSignInUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'accounts.google.com';
  } catch {
    return false;
  }
}

// Anything else leaves the app: open https/mailto links in the system
// browser/mail client, drop every other scheme (file:, javascript:, custom
// protocol handlers, ...).
function openExternallyIfSafe(url) {
  try {
    const { protocol } = new URL(url);
    if (protocol === 'https:' || protocol === 'mailto:') shell.openExternal(url);
  } catch {
    // unparseable: ignore
  }
}

function hardenWindow(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isGoogleSignInUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
        },
      };
    }
    openExternallyIfSafe(url);
    return { action: 'deny' };
  });

  // The Google popup itself may not open further windows.
  win.webContents.on('did-create-window', (child) => {
    child.webContents.setWindowOpenHandler(({ url }) => {
      openExternallyIfSafe(url);
      return { action: 'deny' };
    });
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    openExternallyIfSafe(url);
  });
}

/**
 * Load the renderer — either the Vite dev server (development)
 * or the built dist/index.html (production).
 */
async function loadRenderer() {
  if (!mainWindow) return;

  if (!isDev) {
    // Production: load the built bundle
    const distPath = path.join(__dirname, 'dist/index.html');
    const fs = require('fs');
    if (fs.existsSync(distPath)) {
      await mainWindow.loadFile(distPath);
    } else {
      console.error('[Electron] dist/index.html not found. Run `npm run build` first.');
    }
    return;
  }

  // Development: load Vite dev server
  try {
    await mainWindow.loadURL(DEV_URL);
  } catch (error) {
    console.error(`[Electron] Failed to load ${DEV_URL}:`, error.message);
    // Retry after a short delay (Vite may still be starting)
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await mainWindow.loadURL(DEV_URL);
  }
}

/**
 * Create the main application window.
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, process.platform === 'win32' ? 'src/assets/OrkaVault.ico' : 'src/assets/OrkaVault.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: !isDev,
      backgroundThrottling: true,
      preload: path.resolve(__dirname, 'preload.cjs'),
    },
    titleBarStyle: 'hiddenInset',
    show: false,
    backgroundColor: '#0b0f19', // Match OrkaVault's dark navy background
    title: 'OrkaVault Desktop',
  });

  // Remove default menu (File, View, Window, Help)
  mainWindow.setMenu(null);
  hardenWindow(mainWindow);

  // Load the app
  loadRenderer().catch((error) => {
    console.error('[Electron] Renderer failed to load:', error);
    mainWindow.show();
    mainWindow.focus();
  });

  // Show window when ready to avoid white flash
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── App Lifecycle ──────────────────────────────────────────────────────────

if (isDev) {
  // Development: just create the window
  app.whenReady().then(createWindow);
} else {
  // Production: enforce single instance
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });

    app.whenReady().then(createWindow);
  }
}

// macOS: re-create window when dock icon is clicked
app.on('activate', () => { if (!mainWindow) createWindow(); });

// Quit when all windows are closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
