const { app, BrowserWindow } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

// ── Memory & Performance Optimization ──────────────────────────────────────
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');
app.commandLine.appendSwitch('disable-features', 'TranslateUI');

if (isDev) {
  app.commandLine.appendSwitch('no-proxy-server');
}

const DEV_URL = 'http://localhost:3000';
let mainWindow;

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
      sandbox: false,
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
