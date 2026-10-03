import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI, ElectronFS } from '../src/preload/api'

const electronApi: ElectronAPI = {
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:showSaveDialog', options),
  openJsonFile: () => ipcRenderer.invoke('dialog:openJsonFile'),
  openMidiFile: () => ipcRenderer.invoke('dialog:openMidiFile'),
  openMusicXmlFile: () => ipcRenderer.invoke('dialog:openMusicXmlFile'),
  openProjectFile: () => ipcRenderer.invoke('dialog:openProjectFile'),
  openVideoFile: () => ipcRenderer.invoke('dialog:openVideoFile'),
  openAudioFile: () => ipcRenderer.invoke('dialog:openAudioFile'),
  dialog: {
    openAudioFile: () => ipcRenderer.invoke('dialog:openAudioFile'),
    openMidiFile: () => ipcRenderer.invoke('dialog:openMidiFile'),
    openMusicXmlFile: () => ipcRenderer.invoke('dialog:openMusicXmlFile'),
    openProjectFile: () => ipcRenderer.invoke('dialog:openProjectFile'),
    openVideoFile: () => ipcRenderer.invoke('dialog:openVideoFile'),
    showSaveDialog: (options) => ipcRenderer.invoke('dialog:showSaveDialog', options),
    getDefaultExportPath: () => ipcRenderer.invoke('dialog:getDefaultExportPath'),
  },
  export: {
    saveScorePdf: (html, outputPath) => ipcRenderer.invoke('export:saveScorePdf', html, outputPath),
    getTempDir: () => ipcRenderer.invoke('export:getTempDir'),
    saveFile: (payload) => ipcRenderer.invoke('export:saveFile', payload),
  },
  ffmpeg: {
    run: (args) => ipcRenderer.invoke('ffmpeg:run', args),
  },
  samplePieces: {
    list: () => ipcRenderer.invoke('samplePieces:list'),
    read: (fileName) => ipcRenderer.invoke('samplePieces:read', fileName),
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
