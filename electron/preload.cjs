// Exposes only window controls to the page. No Node APIs leak into the renderer.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("shoppal", {
  isDesktop: true,
  platform: process.platform,
  getState: () => ipcRenderer.invoke("shoppal:get-state"),
  onState: (cb) => ipcRenderer.on("shoppal:state", (_e, s) => cb(s)),
  toggleMode: () => ipcRenderer.send("shoppal:toggle-mode"),
  toBubble: () => ipcRenderer.send("shoppal:to-bubble"),
  fromBubble: () => ipcRenderer.send("shoppal:from-bubble"),
  togglePin: () => ipcRenderer.send("shoppal:toggle-pin"),
  toggleOpacity: () => ipcRenderer.send("shoppal:toggle-opacity"),
  minimize: () => ipcRenderer.send("shoppal:minimize"),
  hide: () => ipcRenderer.send("shoppal:hide"),
  dragBy: (dx, dy) => ipcRenderer.send("shoppal:drag-by", dx, dy),
  openExternal: (url) => ipcRenderer.send("shoppal:open-external", url),
});
