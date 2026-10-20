import path from 'node:path'
import fs from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
const out = path.resolve('website/capture/output')
const names = new Set(['export.webm', 'export-audio.wav', 'workflow-performance.mp4'])
const run = promisify(execFile)
export default defineConfig({
  root: '.',
  plugins: [react(), {
    name: 'local-capture-export-bridge',
    enforce: 'pre',
    transform(code, id) {
      // Capture framing only: use CanvasArea's existing layout option, without
      // changing app sources, editing behavior, or export implementation.
      if (id.replaceAll('\\','/').endsWith('/src/App.tsx')) return code.replace('engine="three"', 'engine="three" keyboardHeightRatio={0.22}')
    },
    configureServer(server) {
      server.middlewares.use('/capture-export', async (req, res) => {
        // Local capture only: no arbitrary paths, commands, or cross-origin requests.
        if (req.method !== 'POST' || req.headers.origin !== 'http://127.0.0.1:5176') { res.statusCode=403; res.end(); return }
        try {
          const url = new URL(req.url, 'http://127.0.0.1:5176')
          await fs.mkdir(out, {recursive:true})
          if (url.pathname === '/write') {
            const name=url.searchParams.get('name')
            if (!names.has(name)) throw new Error('Unsupported capture file')
            const chunks=[]; let size=0
            for await (const chunk of req) { size+=chunk.length; if(size>150*1024*1024) throw new Error('Capture too large'); chunks.push(chunk) }
            await fs.writeFile(path.join(out,name),Buffer.concat(chunks))
          } else if (url.pathname === '/combine') {
            await run(path.resolve('node_modules/ffmpeg-static/ffmpeg.exe'), ['-nostdin','-y','-i',path.join(out,'export.webm'),'-i',path.join(out,'export-audio.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart','-shortest',path.join(out,'workflow-performance.mp4')])
          } else throw new Error('Unsupported capture operation')
          res.end('OK')
        } catch(error) { res.statusCode=500; res.end(String(error)) }
      })
    }
  }],
  resolve: {alias: {'@':path.resolve('src')}},
})

