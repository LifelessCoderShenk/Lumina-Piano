import type { SaveDialogOptions } from 'electron'

export interface ElectronFS {
  mkdir(path: string): Promise<void>
  readFile(path: string): Promise<Uint8Array>
  rm(path: string): Promise<void>
  writeFile(path: string, data: Uint8Array): Promise<void>
}

export interface ElectronExportBridge {
  saveScorePdf?(html: string, outputPath: string): Promise<void>
  getTempDir(): Promise<string>
  saveFile(payload: {
    buffer: number[]
    outputPath: string
  }): Promise<void>
}

export interface ElectronAPI {
  showSaveDialog(options: SaveDialogOptions): Promise<string | null>
  openJsonFile(): Promise<string | null>
  openMidiFile(): Promise<string | null>
  openMusicXmlFile?(): Promise<string | null>
  openProjectFile?(): Promise<string | null>
  openVideoFile?(): Promise<string | null>
  openAudioFile?(): Promise<string | null>
  dialog: {
    openAudioFile?(): Promise<string | null>
    openMidiFile(): Promise<string | null>
    openMusicXmlFile?(): Promise<string | null>
    openProjectFile?(): Promise<string | null>
    openVideoFile?(): Promise<string | null>
    showSaveDialog(options: SaveDialogOptions): Promise<string | null>
    getDefaultExportPath(): Promise<string | null>
  }
  export: ElectronExportBridge
  ffmpeg: {
    run(args: string[]): Promise<void>
  }
  samplePieces: {
    list(): Promise<string[]>
    read(fileName: string): Promise<Uint8Array>
  }
  shell: {
    openPath(path: string): Promise<void>
  }
  window: {
    minimize(): Promise<void>
    maximize(): Promise<void>
    close(): Promise<void>
  }
}
declare global {
  interface Window {
    electronAPI: ElectronAPI
    electronFS: ElectronFS
  }
}

export {}
