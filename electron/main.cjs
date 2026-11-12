// ShopPal desktop: a floating panel around the same Express server + frontend as the web app.
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, shell, screen, nativeImage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const SIZES = {
  compact: { width: 380, height: 560, min: [340, 420], max: [560, 1000] },
  expanded: { width: 1100, height: 750, min: [720, 500], max: [10000, 10000] },
  bubble: { width: 72, height: 72, min: [72, 72], max: [72, 72] }, // 64px bubble + 4px margin
};
const SHORTCUT = "CommandOrControl+Shift+Space";
const PAYPAL_HOSTS = /(^|\.)(paypal\.com|paypalobjects\.com|venmo\.com)$/i;

let win = null;
let tray = null;
let serverUrl = null;
let quitting = false;

// ── Persisted state (JSON in userData) ──
const statePath = () => path.join(app.getPath("userData"), "window-state.json");
let state = { mode: "compact", lastPanelMode: "compact", alwaysOnTop: true, opacity: 1, bounds: {} };
function loadState() {
  try { state = { ...state, ...JSON.parse(fs.readFileSync(statePath(), "utf8")) }; } catch {}
}
let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(statePath(), JSON.stringify(state, null, 2)); } catch {}
  }, 300);
}
function publicState() {
  return { mode: state.mode, alwaysOnTop: state.alwaysOnTop, opacity: state.opacity };
}
function broadcast() {
  if (win && !win.isDestroyed()) win.webContents.send("shoppal:state", publicState());
  refreshTrayMenu();
  saveState();
}

// Keep restored bounds on a visible display.
function onScreen(b) {
  const area = screen.getDisplayMatching(b).workArea;
  const width = Math.min(b.width, area.width);
  const height = Math.min(b.height, area.height);
  const x = Math.min(Math.max(b.x, area.x), area.x + area.width - width);
  const y = Math.min(Math.max(b.y, area.y), area.y + area.height - height);
  return { x, y, width, height };
}
function defaultBounds(mode, anchor) {
  const s = SIZES[mode];
  const area = (anchor ? screen.getDisplayMatching(anchor) : screen.getPrimaryDisplay()).workArea;
  if (mode === "expanded") return { x: Math.round(area.x + (area.width - s.width) / 2), y: Math.round(area.y + (area.height - s.height) / 2), width: s.width, height: s.height };
  if (anchor) return { x: anchor.x + anchor.width - s.width, y: anchor.y, width: s.width, height: s.height };
  return { x: area.x + area.width - s.width - 24, y: area.y + 24, width: s.width, height: s.height };
}

function rememberBounds() {
  if (win && !win.isDestroyed()) state.bounds[state.mode] = win.getBounds();
}

function applyMode(mode) {
  const prev = win.getBounds();
  rememberBounds();
  state.mode = mode;
  if (mode !== "bubble") state.lastPanelMode = mode;
  const s = SIZES[mode];
  const target = onScreen(state.bounds[mode] || defaultBounds(mode, prev));

  win.setResizable(mode !== "bubble");
  win.setMinimumSize(...s.min);
  win.setMaximumSize(...s.max);
  win.setBounds(target);
  win.setHasShadow(mode !== "bubble");
  // Bubble is always on top; panels follow the pin setting.
  applyOnTop(mode === "bubble" ? true : state.alwaysOnTop);
  win.setOpacity(mode === "bubble" ? 1 : state.opacity);
  broadcast();
}

function applyOnTop(on) {
  // "screen-saver" level is what lets the panel sit above full-screen apps on macOS.
  win.setAlwaysOnTop(on, on ? "screen-saver" : "normal");
  // Float across desktops/Spaces (and over full-screen apps) while pinned. On macOS the app runs
  // as an accessory (no Dock icon, see boot), which is what makes this work across Spaces.
  win.setVisibleOnAllWorkspaces(on, { visibleOnFullScreen: true, skipTransformProcessType: true });
}

// Show the panel on whichever desktop/Space you're on right now, even when it isn't pinned.
function showHere() {
  if (!win.isVisibleOnAllWorkspaces()) {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    win.show();
    win.focus();
    setTimeout(() => {
      const pinned = state.mode === "bubble" || state.alwaysOnTop;
      if (!pinned) win.setVisibleOnAllWorkspaces(false, { skipTransformProcessType: true });
    }, 250);
  } else {
    win.show();
    win.focus();
  }
}

function toggleVisible() {
  if (!win) return;
  if (win.isVisible() && win.isFocused()) win.hide();
  else showHere();
}

// ── Window ──
function createWindow() {
  const mode = state.mode || "compact";
  const s = SIZES[mode];
  const b = onScreen(state.bounds[mode] || defaultBounds(mode));
  win = new BrowserWindow({
    ...b,
    minWidth: s.min[0], minHeight: s.min[1], maxWidth: s.max[0], maxHeight: s.max[1],
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: mode !== "bubble",
    hasShadow: mode !== "bubble",
    fullscreenable: false,
    show: false,
    title: "ShopPal",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  applyOnTop(mode === "bubble" ? true : state.alwaysOnTop);
  win.setOpacity(mode === "bubble" ? 1 : state.opacity);

  // PayPal's JS SDK opens a popup (first about:blank, then paypal.com) for login/approval.
  // Allow those as child windows; send every other link to the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === "about:blank" || isPayPal(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 480, height: 720, alwaysOnTop: true, autoHideMenuBar: true, title: "PayPal",
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
        },
      };
    }
    openExternalSafe(url);
    return { action: "deny" };
  });
  win.webContents.on("did-create-window", (child) => {
    child.setAlwaysOnTop(true, "screen-saver", 1); // stay above the floating panel
    child.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    child.webContents.setWindowOpenHandler(({ url }) => (isPayPal(url) || url === "about:blank" ? { action: "allow" } : (openExternalSafe(url), { action: "deny" })));
  });
  // Never navigate the panel itself away from the app.
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(serverUrl)) { e.preventDefault(); openExternalSafe(url); }
  });

  win.on("moved", () => { rememberBounds(); saveState(); });
  win.on("resized", () => { rememberBounds(); saveState(); });
  win.on("close", (e) => {
    rememberBounds();
    saveState();
    if (!quitting && tray) { e.preventDefault(); win.hide(); } // close = hide to tray
  });
  win.once("ready-to-show", () => win.show());
  win.loadURL(serverUrl);
}

function isPayPal(url) {
  try { const u = new URL(url); return u.protocol === "https:" && PAYPAL_HOSTS.test(u.hostname); } catch { return false; }
}
function openExternalSafe(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "https:" || (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname))) shell.openExternal(url);
  } catch {}
}

// ── Tray / menu bar ──
function createTray() {
  const icon = process.platform === "darwin"
    ? nativeImage.createFromPath(path.join(__dirname, "trayTemplate.png"))
    : nativeImage.createFromPath(path.join(__dirname, "tray-color.png"));
  if (process.platform === "darwin") icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip(`ShopPal (${process.platform === "darwin" ? "⌘" : "Ctrl"}+Shift+Space)`);
  tray.on("click", () => { if (process.platform !== "darwin") toggleVisible(); });
  refreshTrayMenu();
}
function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show ShopPal", click: () => showHere() },
    { label: "Hide", click: () => win.hide() },
    { type: "separator" },
    { label: "Always on top", type: "checkbox", checked: state.alwaysOnTop, click: () => togglePin() },
    { label: "Opacity", submenu: [1, 0.85].map((o) => ({ label: `${o * 100}%`, type: "radio", checked: state.opacity === o, click: () => setOpacity(o) })) },
    { label: "Mode", submenu: [
      { label: "Compact panel", type: "radio", checked: state.mode === "compact", click: () => applyMode("compact") },
      { label: "Expanded window", type: "radio", checked: state.mode === "expanded", click: () => applyMode("expanded") },
      { label: "Mini bubble", type: "radio", checked: state.mode === "bubble", click: () => applyMode("bubble") },
    ] },
    { type: "separator" },
    { label: "Quit ShopPal", accelerator: "CommandOrControl+Q", click: () => { quitting = true; app.quit(); } },
  ]));
}

function togglePin() {
  state.alwaysOnTop = !state.alwaysOnTop;
  if (state.mode !== "bubble") applyOnTop(state.alwaysOnTop);
  broadcast();
}
function setOpacity(o) {
  state.opacity = o;
  if (state.mode !== "bubble") win.setOpacity(o);
  broadcast();
}

// ── IPC (only window controls are exposed to the renderer) ──
function registerIpc() {
  const fromMain = (e) => win && e.sender === win.webContents;
  ipcMain.handle("shoppal:get-state", () => publicState());
  ipcMain.on("shoppal:toggle-mode", (e) => fromMain(e) && applyMode(state.mode === "expanded" ? "compact" : "expanded"));
  ipcMain.on("shoppal:to-bubble", (e) => fromMain(e) && applyMode("bubble"));
  ipcMain.on("shoppal:from-bubble", (e) => fromMain(e) && applyMode(state.lastPanelMode || "compact"));
  ipcMain.on("shoppal:toggle-pin", (e) => fromMain(e) && togglePin());
  ipcMain.on("shoppal:toggle-opacity", (e) => fromMain(e) && setOpacity(state.opacity < 1 ? 1 : 0.85));
  ipcMain.on("shoppal:hide", (e) => fromMain(e) && win.hide());
  ipcMain.on("shoppal:minimize", (e) => fromMain(e) && win.minimize());
  ipcMain.on("shoppal:drag-by", (e, dx, dy) => {
    if (!fromMain(e) || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const [x, y] = win.getPosition();
    win.setPosition(Math.round(x + dx), Math.round(y + dy));
  });
  ipcMain.on("shoppal:open-external", (e, url) => fromMain(e) && typeof url === "string" && openExternalSafe(url));
}

// ── Boot ──
function loadEnv() {
  // .env next to the project (dev) or in userData (packaged app). Real env vars win.
  for (const p of [path.join(__dirname, "..", ".env"), path.join(app.getPath("userData"), ".env")]) {
    try { if (fs.existsSync(p)) process.loadEnvFile(p); } catch (err) { console.warn("Could not load", p, err.message); }
  }
}

// The dev self-test gets its own settings folder so it never touches a real running copy.
if (process.env.SHOPPAL_SELFTEST) app.setPath("userData", path.join(process.env.SHOPPAL_SELFTEST, "userData"));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => { if (win) { if (state.mode === "bubble") applyMode(state.lastPanelMode); showHere(); } });

  app.whenReady().then(async () => {
    // Run as a menu-bar accessory on macOS (no Dock icon). Required for the panel to float over
    // every desktop/Space and full-screen apps. Use the menu bar icon to show, hide or quit.
    if (process.platform === "darwin" && app.dock) app.dock.hide();
    loadEnv();
    loadState();
    const { startServer } = await import(pathToFileURL(path.join(__dirname, "..", "server", "index.js")).href);
    const { port } = await startServer(Number(process.env.SHOPPAL_DESKTOP_PORT) || 0, "127.0.0.1");
    serverUrl = `http://127.0.0.1:${port}/`;

    registerIpc();
    createWindow();
    createTray();
    if (!globalShortcut.register(SHORTCUT, toggleVisible)) console.warn(`Could not register ${SHORTCUT}`);

    if (process.env.SHOPPAL_SELFTEST) require("./selftest.cjs")({ win: () => win, applyMode, togglePin, setOpacity, state });
  });

  app.on("activate", () => { if (win) showHere(); });
  app.on("before-quit", () => { quitting = true; rememberBounds(); try { fs.writeFileSync(statePath(), JSON.stringify(state, null, 2)); } catch {} });
  app.on("will-quit", () => globalShortcut.unregisterAll());
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
