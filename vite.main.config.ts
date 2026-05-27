import { builtinModules } from 'node:module'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: '.vite/build',
    lib: {
      entry: 'electron/main.ts',
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      external: [
        'electron',
        'ffmpeg-static',
        'sharp',
        'electron-squirrel-startup',
        ...builtinModules,
        ...builtinModules.map((moduleName) => `node:${moduleName}`),
      ],
    },
    emptyOutDir: false,
  },
  resolve: {
    conditions: ['node'],
  },
})
