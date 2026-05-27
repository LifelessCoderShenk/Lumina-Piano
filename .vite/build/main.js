"use strict";
const promises = require("node:fs/promises");
const path = require("node:path");
const electron = require("electron");
const ffmpegPath = require("ffmpeg-static");
const node_child_process = require("node:child_process");
function spawnProcess(command, args, options) {
  return node_child_process.spawn(command, args, {});
}
if (require("electron-squirrel-startup")) {
  electron.app.quit();
}
let mainWindow = null;
const createWindow = () => {
  mainWindow = new electron.BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 800,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#0a0a0f",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  {
    mainWindow.loadURL("http://localhost:5173");
  }
  mainWindow.once("ready-to-show", () => {
    mainWindow == null ? void 0 : mainWindow.show();
  });
};
electron.app.on("ready", () => {
  electron.ipcMain.handle("dialog:showSaveDialog", async (_, options) => {
    if (!mainWindow) return null;
    const result = await electron.dialog.showSaveDialog(mainWindow, options);
    return result.canceled ? null : result.filePath;
  });
  electron.ipcMain.handle("dialog:getDefaultExportPath", async () => {
    const videosPath = electron.app.getPath("videos");
    return path.join(videosPath, "lumina_export.mp4");
  });
  electron.ipcMain.handle("dialog:openMidiFile", async () => {
    const dialogTarget = mainWindow ?? void 0;
    const result = await electron.dialog.showOpenDialog(dialogTarget, {
      filters: [
        { name: "MIDI Files", extensions: ["mid", "midi"] }
      ],
      properties: ["openFile"]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });
  electron.ipcMain.handle("shell:openPath", async (_, filePath) => {
    await electron.shell.openPath(filePath);
  });
  electron.ipcMain.handle("fs:mkdir", async (_event, dir) => {
    if (typeof dir !== "string" || dir.length === 0) {
      throw new Error("Directory path must be a non-empty string.");
    }
    await promises.mkdir(dir, { recursive: true });
  });
  electron.ipcMain.handle("fs:rm", async (_event, dir) => {
    if (typeof dir !== "string" || dir.length === 0) {
      throw new Error("Directory path must be a non-empty string.");
    }
    await promises.rm(dir, { recursive: true, force: true });
  });
  electron.ipcMain.handle("fs:writeFile", async (_event, filePath, data) => {
    if (typeof filePath !== "string" || filePath.length === 0) {
      throw new Error("File path must be a non-empty string.");
    }
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    await promises.writeFile(filePath, bytes);
  });
  electron.ipcMain.handle("fs:readFile", async (_event, filePath) => {
    if (typeof filePath !== "string" || filePath.length === 0) {
      throw new Error("File path must be a non-empty string.");
    }
    const bytes = await promises.readFile(filePath);
    return new Uint8Array(bytes);
  });
  electron.ipcMain.handle(
    "export:getTempDir",
    async () => path.join(electron.app.getPath("temp"), `lumina-export-${Date.now()}`)
  );
  electron.ipcMain.handle(
    "export:saveFile",
    async (_event, payload) => {
      const { buffer, outputPath } = payload;
      if (typeof outputPath !== "string" || outputPath.length === 0) {
        throw new Error("Output path must be a non-empty string.");
      }
      if (!Array.isArray(buffer) || buffer.length === 0) {
        throw new Error("Encoded video buffer is empty.");
      }
      await promises.writeFile(outputPath, Buffer.from(buffer));
    }
  );
  electron.ipcMain.handle("ffmpeg:run", async (_event, args) => {
    if (!Array.isArray(args)) {
      throw new Error("FFmpeg arguments must be an array.");
    }
    const binaryPath = ffmpegPath;
    if (binaryPath == null || binaryPath.length === 0) {
      throw new Error("FFmpeg binary is not available.");
    }
    await runFFmpeg(binaryPath, args);
  });
  electron.ipcMain.handle("window:minimize", () => {
    mainWindow == null ? void 0 : mainWindow.minimize();
  });
  electron.ipcMain.handle("window:maximize", () => {
    if (mainWindow == null ? void 0 : mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow == null ? void 0 : mainWindow.maximize();
    }
  });
  electron.ipcMain.handle("window:close", () => {
    mainWindow == null ? void 0 : mainWindow.close();
  });
  createWindow();
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
async function runFFmpeg(ffmpegBinaryPath, args) {
  return new Promise((resolve, reject) => {
    const processHandle = spawnProcess(ffmpegBinaryPath, args);
    processHandle.on("error", (error) => {
      reject(error);
    });
    processHandle.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`FFmpeg exited with code ${code ?? "unknown"}.`));
    });
  });
}
