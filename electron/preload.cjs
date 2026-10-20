const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("alleviateDesktop", {
  isDesktop: true,
  authBaseUrl: process.env.ELECTRON_AUTH_BASE_URL || process.env.NEXT_PUBLIC_AUTH_BASE_URL || "https://vdock.vercel.app",
  authHttp: {
    request: (payload) => ipcRenderer.invoke("alleviate:auth-http:request", payload),
  },
  authTokenStore: {
    set: (username, refreshToken) => ipcRenderer.invoke("alleviate:auth-token:set", { username, refreshToken }),
    get: (username) => ipcRenderer.invoke("alleviate:auth-token:get", { username }),
    clear: (username) => ipcRenderer.invoke("alleviate:auth-token:clear", { username }),
  },
  backup: {
    browseDirectory: (options) => ipcRenderer.invoke("alleviate:backup-browse-directory", options),
    writeArchive: (payload) => ipcRenderer.invoke("alleviate:backup-write-archive", payload),
    openFolder: (payload) => ipcRenderer.invoke("alleviate:backup-open-folder", payload),
  },
});
