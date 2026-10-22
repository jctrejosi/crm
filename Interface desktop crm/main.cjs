'use strict';

const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  nativeImage,
  nativeTheme,
  screen,
  session,
  shell,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const APP_NAME = 'Ecommerce CRM';
const DEFAULT_ADMIN_URL = 'https://crm.example.com';
const SESSION_PARTITION = 'persist:ecommerce-crm';

// El nombre debe fijarse antes de calcular rutas de usuario (%APPDATA%).
app.setName(APP_NAME);
if (process.platform === 'win32') {
  app.setAppUserModelId('com.ecommerce.crm');
}

const exeDir = path.dirname(app.getPath('exe'));

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Configuración efectiva. Se busca primero junto al .exe (editable por el
 * administrador), luego en resources y por último en la carpeta de la app.
 */
function loadConfig() {
  const candidates = [
    path.join(exeDir, 'config.local.json'),
    path.join(exeDir, 'config.json'),
    process.resourcesPath ? path.join(process.resourcesPath, 'config.local.json') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'config.json') : null,
    path.join(__dirname, 'config.local.json'),
    path.join(__dirname, 'config.json'),
  ].filter(Boolean);

  for (const file of candidates) {
    const parsed = readJson(file);
    if (parsed && typeof parsed === 'object') return parsed;
  }
  return {};
}

const config = loadConfig();

function resolveAdminUrl(value) {
  try {
    const url = new URL(value || DEFAULT_ADMIN_URL);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error(`Protocolo no permitido: ${url.protocol}`);
    }
    return url;
  } catch (error) {
    console.warn(`[admin] URL no válida (${value}): ${error.message}. Se usará ${DEFAULT_ADMIN_URL}`);
    return new URL(DEFAULT_ADMIN_URL);
  }
}

const adminUrl = resolveAdminUrl(config.adminUrl);
const allowDevTools = config.allowDevTools === true || !app.isPackaged;

const stateFile = path.join(app.getPath('userData'), 'window-state.json');
const savedState = readJson(stateFile) || {};

function isOnScreen(bounds) {
  if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) return false;
  return screen.getAllDisplays().some(({ workArea }) => {
    return (
      bounds.x < workArea.x + workArea.width &&
      bounds.x + bounds.width > workArea.x &&
      bounds.y < workArea.y + workArea.height &&
      bounds.y + bounds.height > workArea.y
    );
  });
}

function isAdminUrl(value) {
  try {
    return new URL(value).origin === adminUrl.origin;
  } catch {
    return false;
  }
}

function openExternal(value) {
  try {
    const url = new URL(value);
    if (['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol)) {
      void shell.openExternal(value);
    }
  } catch {
    /* URL inválida: se ignora */
  }
}

/** @type {BrowserWindow | null} */
let mainWindow = null;
let shown = false;

function appIcon() {
  // En la app empaquetada el icono se copia a resources/build (fuera del asar).
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'build', 'icon.png') : null,
    path.join(__dirname, 'build', 'icon.png'),
  ].filter((file) => file && fs.existsSync(file));

  return candidates.length > 0 ? nativeImage.createFromPath(candidates[0]) : nativeImage.createEmpty();
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const bounds = mainWindow.isMaximized() || mainWindow.isFullScreen()
      ? mainWindow.getNormalBounds()
      : mainWindow.getBounds();
    const state = {
      ...bounds,
      maximized: mainWindow.isMaximized(),
      zoom: mainWindow.webContents.getZoomFactor(),
    };
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  } catch (error) {
    console.warn(`[admin] No se pudo guardar el estado de la ventana: ${error.message}`);
  }
}

function showOfflinePage(code, description) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  void mainWindow.loadFile(path.join(__dirname, 'offline.html'), {
    query: {
      url: adminUrl.href,
      code: String(code ?? ''),
      description: description ?? '',
    },
  });
}

function createWindow() {
  const dark = nativeTheme.shouldUseDarkColors;
  const width = Math.max(Number(savedState.width) || 1440, 1100);
  const height = Math.max(Number(savedState.height) || 900, 680);

  const icon = appIcon();

  /** @type {Electron.BrowserWindowConstructorOptions} */
  const options = {
    width,
    height,
    minWidth: 1060,
    minHeight: 660,
    show: false,
    title: APP_NAME,
    backgroundColor: dark ? '#141519' : '#f7f7f5',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      spellcheck: false,
      partition: SESSION_PARTITION,
      backgroundThrottling: false,
    },
  };

  if (!icon.isEmpty()) options.icon = icon;

  if (isOnScreen({ x: savedState.x, y: savedState.y, width, height })) {
    options.x = savedState.x;
    options.y = savedState.y;
  }

  mainWindow = new BrowserWindow(options);

  // El título de la ventana es siempre el de la app, no el título del panel
  // remoto (que puede incluir la marca del cliente).
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
    mainWindow.setTitle(APP_NAME);
  });

  if (savedState.maximized) mainWindow.maximize();

  const webContents = mainWindow.webContents;

  webContents.setWindowOpenHandler(({ url }) => {
    if (isAdminUrl(url)) {
      void mainWindow.loadURL(url);
    } else {
      openExternal(url);
    }
    return { action: 'deny' };
  });

  webContents.on('will-navigate', (event, url) => {
    if (isAdminUrl(url) || url.startsWith('file:')) return;
    event.preventDefault();
    openExternal(url);
  });

  webContents.on('did-fail-load', (_event, code, description, validatedURL, isMainFrame) => {
    // -3 = ERR_ABORTED: navegación cancelada o redirección, no es un fallo real.
    if (!isMainFrame || code === -3) return;
    console.warn(`[admin] Fallo al cargar ${validatedURL}: ${code} ${description}`);
    showOfflinePage(code, description);
  });

  webContents.on('did-finish-load', () => {
    const current = webContents.getURL();
    if (current.startsWith(adminUrl.origin)) {
      const zoom = Number(savedState.zoom);
      if (zoom >= 0.5 && zoom <= 3) webContents.setZoomFactor(zoom);
    }
  });

  webContents.on('before-input-event', (event, input) => {
    if (allowDevTools) return;
    const key = String(input.key || '').toLowerCase();
    if ((input.control && input.shift && key === 'i') || key === 'f12') {
      event.preventDefault();
    }
  });

  // Autodiagnóstico para entornos sin interfaz (CI): arranca, comprueba que el
  // panel carga y termina. No tiene efecto en uso normal.
  if (process.env.ECOMMERCE_SMOKE_TEST === '1') {
    webContents.once('did-finish-load', () => {
      const current = webContents.getURL();
      if (!isAdminUrl(current)) {
        console.error(`[smoke] se cargó una página inesperada: ${current}`);
        app.exit(1);
        return;
      }
      console.log(`[smoke] ok ${current} · "${mainWindow.getTitle()}"`);
      setTimeout(() => app.quit(), 300);
    });
    webContents.once('did-fail-load', (_event, code, description, url, isMainFrame) => {
      if (!isMainFrame) return;
      console.error(`[smoke] fallo ${code} ${description} ${url}`);
      app.exit(1);
    });
  }

  webContents.on('render-process-gone', (_event, details) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'error',
      title: APP_NAME,
      message: 'La aplicación se detuvo inesperadamente',
      detail: `Motivo: ${details.reason}`,
      buttons: ['Recargar', 'Salir'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (choice === 0) {
      void mainWindow.loadURL(adminUrl.href);
    } else {
      app.quit();
    }
  });

  mainWindow.on('unresponsive', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      title: APP_NAME,
      message: 'La página no responde',
      detail: 'Puede esperar a que termine o recargar la aplicación.',
      buttons: ['Esperar', 'Recargar'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (choice === 1) mainWindow.webContents.reload();
  });

  const reveal = () => {
    if (shown || !mainWindow || mainWindow.isDestroyed()) return;
    shown = true;
    mainWindow.show();
  };

  mainWindow.once('ready-to-show', reveal);
  // Si la red tarda, no dejar la ventana invisible.
  setTimeout(reveal, 5000);

  mainWindow.on('close', saveWindowState);
  mainWindow.on('closed', () => {
    mainWindow = null;
    shown = false;
  });

  void mainWindow.loadURL(adminUrl.href);
}

function reloadAdmin() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    void mainWindow.loadURL(adminUrl.href);
  }
}

function showAbout() {
  const options = {
    type: 'info',
    title: `Acerca de ${APP_NAME}`,
    message: APP_NAME,
    detail: [
      `Versión ${app.getVersion()}`,
      `Panel: ${adminUrl.href}`,
      '',
      `Electron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
      'El contenido se actualiza automáticamente desde el servidor.',
    ].join('\n'),
    buttons: ['Aceptar'],
    icon: appIcon(),
    noLink: true,
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    void dialog.showMessageBox(mainWindow, options);
  } else {
    void dialog.showMessageBox(options);
  }
}

function buildMenu() {
  const viewSubmenu = [
    { label: 'Recargar', accelerator: 'CmdOrCtrl+R', click: reloadAdmin },
    {
      label: 'Forzar recarga',
      accelerator: 'CmdOrCtrl+Shift+R',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.reloadIgnoringCache();
        }
      },
    },
    { type: 'separator' },
    { role: 'resetZoom', label: 'Zoom normal' },
    { role: 'zoomIn', label: 'Acercar' },
    { role: 'zoomOut', label: 'Alejar' },
    { type: 'separator' },
    { role: 'togglefullscreen', label: 'Pantalla completa' },
  ];

  if (allowDevTools) {
    viewSubmenu.push(
      { type: 'separator' },
      { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
    );
  }

  const template = [
    {
      label: 'Archivo',
      submenu: [{ role: 'quit', label: 'Salir' }],
    },
    { label: 'Ver', submenu: viewSubmenu },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Abrir en el navegador',
          click: () => openExternal(adminUrl.href),
        },
        { type: 'separator' },
        { label: `Acerca de ${APP_NAME}`, click: showAbout },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setMenuBarVisibility(false);
  }
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    // Las cookies y el almacenamiento local del panel viven en esta partición
    // persistente, de modo que la sesión sobrevive a reinicios.
    const adminSession = session.fromPartition(SESSION_PARTITION);
    if (typeof adminSession.setSpellCheckerEnabled === 'function') {
      adminSession.setSpellCheckerEnabled(false);
    }

    createWindow();
    buildMenu();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
        buildMenu();
      }
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
