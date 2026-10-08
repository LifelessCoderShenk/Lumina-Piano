import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { OpenDialogOptions } from 'electron'

import { spawnProcess } from './spawnProcess'

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 800,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0f',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize()
    mainWindow?.show()
  })
}

app.on('ready', () => {
  ipcMain.handle('dialog:showSaveDialog', async (_, options) => {
    if (!mainWindow) return null
    const result = await dialog.showSaveDialog(mainWindow, options)
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle('dialog:getDefaultExportPath', async () => {
    const videosPath = app.getPath('videos')
    return path.join(videosPath, 'lumina_export.mp4')
  })

  ipcMain.handle('dialog:openMidiFile', async () => {
    const options: OpenDialogOptions = {
      filters: [
        { name: 'MIDI Files', extensions: ['mid', 'midi'] },
      ],
      properties: ['openFile'],
    }
    const result = mainWindow == null
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(mainWindow, options)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  ipcMain.handle('dialog:openVideoFile', async () => {
    const options: OpenDialogOptions = {
      filters: [{ name: 'Video Files', extensions: ['mp4', 'webm', 'mov', 'm4v'] }],
      properties: ['openFile'],
    }
    const result = mainWindow == null
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(mainWindow, options)

    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:openAudioFile', async () => {
    const options: OpenDialogOptions = {
      filters: [{ name: 'Audio Files', extensions: ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg'] }],
      properties: ['openFile'],
    }
    const result = mainWindow == null
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(mainWindow, options)

    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:openProjectFile', async () => {
    const options: OpenDialogOptions = {
      filters: [{ name: 'Lumina Projects', extensions: ['lumina'] }],
      properties: ['openFile'],
    }
    const result = mainWindow == null
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(mainWindow, options)

    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:openMusicXmlFile', async () => {
    const options: OpenDialogOptions = {
      filters: [{ name: 'MusicXML Scores', extensions: ['musicxml', 'xml'] }],
      properties: ['openFile'],
    }
    const result = mainWindow == null
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(mainWindow, options)
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:openJsonFile', async () => {
    const options: OpenDialogOptions = {
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
      ],
      properties: ['openFile'],
    }
    const result = mainWindow == null
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(mainWindow, options)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return readFile(result.filePaths[0], 'utf8')
  })

  ipcMain.handle('shell:openPath', async (_, filePath: string) => {
    const errorMessage = await shell.openPath(filePath)
    if (errorMessage.length > 0) {
      throw new Error(errorMessage)
    }
  })

  ipcMain.handle('fs:mkdir', async (_event, dir: string) => {
    if (typeof dir !== 'string' || dir.length === 0) {
      throw new Error('Directory path must be a non-empty string.')
    }

    await mkdir(dir, { recursive: true })
  })

  ipcMain.handle('fs:rm', async (_event, dir: string) => {
    if (typeof dir !== 'string' || dir.length === 0) {
      throw new Error('Directory path must be a non-empty string.')
    }

    await rm(dir, { recursive: true, force: true })
  })

  ipcMain.handle('fs:writeFile', async (_event, filePath: string, data: Uint8Array | ArrayBuffer) => {
    if (typeof filePath !== 'string' || filePath.length === 0) {
      throw new Error('File path must be a non-empty string.')
    }

    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    await writeFile(filePath, bytes)
  })

  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    if (typeof filePath !== 'string' || filePath.length === 0) {
      throw new Error('File path must be a non-empty string.')
    }

    const bytes = await readFile(filePath)
    return new Uint8Array(bytes)
  })

  ipcMain.handle('samplePieces:list', async () => {
    const entries = await readdir(getSamplePiecesDirectory(), { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && isMidiFileName(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right))
  })

  ipcMain.handle('samplePieces:read', async (_event, fileName: unknown) => {
    if (!isSafeSamplePieceFileName(fileName)) {
      throw new Error('Sample piece file name must be a bare MIDI file name.')
    }

    const bytes = await readFile(path.join(getSamplePiecesDirectory(), fileName))
    return new Uint8Array(bytes)
  })

  ipcMain.handle(
    'export:getTempDir',
    async () => path.join(app.getPath('temp'), `lumina-export-${Date.now()}`),
  )

  ipcMain.handle(
    'export:saveFile',
    async (
      _event,
      payload: {
        buffer: number[]
        outputPath: string
      },
    ) => {
      const { buffer, outputPath } = payload
      if (typeof outputPath !== 'string' || outputPath.length === 0) {
        throw new Error('Output path must be a non-empty string.')
      }

      if (!Array.isArray(buffer) || buffer.length === 0) {
        throw new Error('Encoded video buffer is empty.')
      }

      await writeFile(outputPath, Buffer.from(buffer))
    },
  )

  ipcMain.handle('export:saveScorePdf', async (_event, html: string, outputPath: string) => {
    if (typeof html !== 'string' || typeof outputPath !== 'string' || !outputPath) {
      throw new Error('Invalid PDF export request.')
    }
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false },
    })
    try {
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      const pdf = await printWindow.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true })
      await writeFile(outputPath, pdf)
    } finally {
      printWindow.destroy()
    }
  })

  ipcMain.handle('ffmpeg:run' , async (_event, args: string[]) => {
    if (!Array.isArray(args)) {
      throw new Error('FFmpeg arguments must be an array.')
    }

    const binaryPath = getFfmpegBinaryPath()
    if (binaryPath == null || binaryPath.length === 0) {
      throw new Error('FFmpeg binary is not available.')
    }

    await runFFmpeg(binaryPath, args)
  })

  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isFullScreen()) {
      mainWindow.setFullScreen(false)
    }

    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.handle('window:close', () => {
    mainWindow?.close()
  })

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Webpack/Vite injects these globals
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string
declare const MAIN_WINDOW_VITE_NAME: string

async function runFFmpeg(ffmpegBinaryPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const processHandle = spawnProcess(ffmpegBinaryPath, args)

    processHandle.on('error', (error: Error) => {
      reject(error)
    })

    processHandle.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`FFmpeg exited with code ${code ?? 'unknown'}.`))
    })
  })
}

function getSamplePiecesDirectory(): string {
  if (!app.isPackaged) {
    return path.join(app.getAppPath(), 'public', 'sample-pieces')
  }

  return path.join(
    app.getAppPath(),
    '.vite',
    'renderer',
    MAIN_WINDOW_VITE_NAME,
    'sample-pieces',
  )
}

function getFfmpegBinaryPath(): string | null {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'ffmpeg.exe')
  }

  // Keep the dev-only lookup lazy. Vite deliberately externalizes this
  // dependency, and loading it at module evaluation would crash a packaged
  // app before the resources-path fallback above can run.
  return require('ffmpeg-static') as string | null
}
function isMidiFileName(fileName: string): boolean {
  return /\.(mid|midi)$/i.test(fileName)
}

function isSafeSamplePieceFileName(fileName: unknown): fileName is string {
  return (
    typeof fileName === 'string' &&
    fileName.length > 0 &&
    fileName.trim() === fileName &&
    !fileName.includes('..') &&
    !fileName.includes('/') &&
    !fileName.includes('\\') &&
    path.basename(fileName) === fileName &&
    isMidiFileName(fileName)
  )
}
