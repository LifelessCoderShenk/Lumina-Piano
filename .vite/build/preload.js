"use strict";
const electron = require("electron");
const electronApi = {
  dialog: {
    openMidiFile: () => electron.ipcRenderer.invoke("dialog:openMidiFile"),
    showSaveDialog: (options) => electron.ipcRenderer.invoke("dialog:showSaveDialog", options),
    getDefaultExportPath: () => electron.ipcRenderer.invoke("dialog:getDefaultExportPath")
  },
  export: {
    getTempDir: () => electron.ipcRenderer.invoke("export:getTempDir"),
    saveFile: (payload) => electron.ipcRenderer.invoke("export:saveFile", payload)
  },
  ffmpeg: {
    run: (args) => electron.ipcRenderer.invoke("ffmpeg:run", args)
  },
  shell: {
    openPath: (filePath) => electron.ipcRenderer.invoke("shell:openPath", filePath)
  },
  window: {
    minimize: () => electron.ipcRenderer.invoke("window:minimize"),
    maximize: () => electron.ipcRenderer.invoke("window:maximize"),
    close: () => electron.ipcRenderer.invoke("window:close")
  }
};
const electronFs = {
  mkdir: (dir) => electron.ipcRenderer.invoke("fs:mkdir", dir),
  readFile: (filePath) => electron.ipcRenderer.invoke("fs:readFile", filePath),
  rm: (dir) => electron.ipcRenderer.invoke("fs:rm", dir),
  writeFile: (filePath, data) => electron.ipcRenderer.invoke("fs:writeFile", filePath, data)
};
electron.contextBridge.exposeInMainWorld("electronAPI", electronApi);
electron.contextBridge.exposeInMainWorld("electronFS", electronFs);
