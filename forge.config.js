module.exports = {
  packagerConfig: {
    name: 'Lumina Piano',
    executableName: 'lumina-piano',
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'LuminaPiano',
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
