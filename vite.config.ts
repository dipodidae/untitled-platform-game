import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const here = fileURLToPath(new URL('.', import.meta.url))
const LEVELS_DIR = resolve(here, 'src/levels')

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    strictPort: false,
  },
  plugins: [
    vue(),
    {
      name: 'editor-save',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use('/__editor/save', (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end('method not allowed')
            return
          }
          const url = new URL(req.url ?? '/', 'http://x')
          const name = url.searchParams.get('name') ?? ''
          if (!/^[\w-]+$/.test(name)) {
            res.statusCode = 400
            res.end('invalid name')
            return
          }
          let body = ''
          req.on('data', (chunk) => {
            body += chunk
          })
          req.on('end', async () => {
            try {
              JSON.parse(body)
              const target = resolve(LEVELS_DIR, `${name}.json`)
              if (!target.startsWith(`${LEVELS_DIR}/`) && target !== `${LEVELS_DIR}/${name}.json`) {
                res.statusCode = 400
                res.end('path escape')
                return
              }
              await writeFile(target, body.endsWith('\n') ? body : `${body}\n`, 'utf8')
              res.statusCode = 200
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify({ ok: true, path: `src/levels/${name}.json` }))
            }
            catch (e) {
              res.statusCode = 500
              res.end(String((e as Error).message ?? e))
            }
          })
        })
      },
    },
  ],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: 'index.html',
        editor: 'editor.html',
        editorVue: 'editor-vue.html',
      },
    },
  },
})
