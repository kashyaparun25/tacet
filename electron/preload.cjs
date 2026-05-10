const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopCapture", {
  getSources: () => ipcRenderer.invoke("desktop-capture:get-sources"),
  enableLoopbackAudio: () => ipcRenderer.invoke("enable-loopback-audio"),
  disableLoopbackAudio: () => ipcRenderer.invoke("disable-loopback-audio")
});
