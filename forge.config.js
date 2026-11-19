const path = require('node:path')

module.exports = {
  packagerConfig: {
    name: 'Lumina Piano',
    executableName: 'lumina-piano',
    appBundleId: 'com.luminapiano.desktop',
    appCategoryType: 'public.app-category.music',
    extendInfo: {
      NSCameraUsageDescription: 'Lumina Piano uses your camera to record piano performances.',
      NSMicrophoneUsageDescription: 'Lumina Piano uses your microphone to record piano audio.',
    },
    // Vite externalizes the main-process dependency, so Forge would otherwise
    // omit ffmpeg-static and the packaged app would fail before opening a
    // window. Ship the Windows binary as a real resource instead.
    extraResource: [
      path.join(__dirname, 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
    ],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'LuminaPiano',
        authors: 'Lumina Piano',
        description: 'Create and export piano performances with Lumina Piano. Trial exports include a watermark.',
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        build: [
          { entry: 'electron/main.ts', config: 'vite.main.config.ts' },
          { entry: 'electron/preload.ts', config: 'vite.preload.config.ts' },
        ],
        renderer: [
          { name: 'main_window', config: 'vite.renderer.config.ts' },
        ],
      },
    },
  ],
}
