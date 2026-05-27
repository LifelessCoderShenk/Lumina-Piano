import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI, ElectronFS } from '../src/preload/api'

const electronApi: ElectronAPI = {
  dialog: {
    openMidiFile: () => ipcRenderer.invoke('dialog:openMidiFile'),
    showSaveDialog: (options) => ipcRenderer.invoke('dialog:showSaveDialog', options),
    getDefaultExportPath: () => ipcRenderer.invoke('dialog:getDefaultExportPath'),
  },
  export: {
    getTempDir: () => ipcRenderer.invoke('export:getTempDir'),
    saveFile: (payload) => ipcRenderer.invoke('export:saveFile', payload),
  },
  ffmpeg: {
    run: (args) => ipcRenderer.invoke('ffmpeg:run', args),
  },
  shell: {
    openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },
}

const electronFs: ElectronFS = {
  mkdir: (dir) => ipcRenderer.invoke('fs:mkdir', dir),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  rm: (dir) => ipcRenderer.invoke('fs:rm', dir),
  writeFile: (filePath, data) => ipcRenderer.invoke('fs:writeFile', filePath, data),
}

contextBridge.exposeInMainWorld('electronAPI', electronApi)
contextBridge.exposeInMainWorld('electronFS', electronFs)
