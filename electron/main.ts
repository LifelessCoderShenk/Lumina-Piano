import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import ffmpegPath from 'ffmpeg-static'

import { spawnProcess } from './spawnProcess'
import type { SongMetadata } from '../src/learn/types'

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
    mainWindow?.show()
    mainWindow?.minimize()
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
    const dialogTarget = mainWindow ?? undefined
    const result = await dialog.showOpenDialog(dialogTarget, {
      filters: [
        { name: 'Supported Files', extensions: ['mid', 'midi', 'mp4'] },
        { name: 'MIDI Files', extensions: ['mid', 'midi'] },
        { name: 'MP4 Files', extensions: ['mp4'] },
      ],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  ipcMain.handle('dialog:openJsonFile', async () => {
    const dialogTarget = mainWindow ?? undefined
    const result = await dialog.showOpenDialog(dialogTarget, {
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
      ],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return readFile(result.filePaths[0], 'utf8')
  })

  ipcMain.handle('shell:openPath', async (_, filePath: string) => {
    await shell.openPath(filePath)
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

  ipcMain.handle('library:getUserSongs', async () => {
    return readUserSongs()
  })

  ipcMain.handle('library:saveUserSong', async (_event, payload: { sourcePath: string }) => {
    const { sourcePath } = payload
    if (typeof sourcePath !== 'string' || sourcePath.length === 0) {
      throw new Error('Source path must be a non-empty string.')
    }

    const userSongs = await readUserSongs()
    const songsDirectory = getUserSongsDirectory()
    await mkdir(songsDirectory, { recursive: true })

    const extension = path.extname(sourcePath) || '.mid'
    const title = path.basename(sourcePath, extension)
    const id = globalThis.crypto.randomUUID()
    const destinationFileName = `${id}${extension}`
    const destinationPath = path.join(songsDirectory, destinationFileName)
    const bytes = await readFile(sourcePath)

    await writeFile(destinationPath, bytes)

    const savedSong: SongMetadata = {
      composer: 'User Upload',
      difficulty: 'intermediate',
      file: destinationFileName,
      filePath: destinationPath,
      id,
      source: 'user',
      title,
    }

    const nextSongs = [savedSong, ...userSongs]
    await writeUserSongs(nextSongs)
    return savedSong
  })

  ipcMain.handle('library:deleteUserSong', async (_event, songId: string) => {
    if (typeof songId !== 'string' || songId.length === 0) {
      throw new Error('Song id must be a non-empty string.')
    }

    const userSongs = await readUserSongs()
    const songToDelete = userSongs.find((song) => song.id === songId)
    if (songToDelete?.filePath) {
      await rm(songToDelete.filePath, { force: true })
    }

    await writeUserSongs(userSongs.filter((song) => song.id !== songId))
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

  ipcMain.handle('ffmpeg:run', async (_event, args: string[]) => {
    if (!Array.isArray(args)) {
      throw new Error('FFmpeg arguments must be an array.')
    }

    const binaryPath = ffmpegPath
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

function getUserSongsDirectory(): string {
  return path.join(app.getPath('userData'), 'song-library')
}

function getUserSongsManifestPath(): string {
  return path.join(getUserSongsDirectory(), 'user-songs.json')
}

async function readUserSongs(): Promise<SongMetadata[]> {
  const manifestPath = getUserSongsManifestPath()

  try {
    const content = await readFile(manifestPath, 'utf8')
    const parsed = JSON.parse(content) as SongMetadata[]
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }

    throw error
  }
}

async function writeUserSongs(songs: SongMetadata[]): Promise<void> {
  const songsDirectory = getUserSongsDirectory()
  await mkdir(songsDirectory, { recursive: true })
  await writeFile(getUserSongsManifestPath(), JSON.stringify(songs, null, 2), 'utf8')
}
