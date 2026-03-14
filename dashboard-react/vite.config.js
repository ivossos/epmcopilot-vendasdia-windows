import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execFile } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT        = resolve(__dirname, '..')
const CONFIG_FILE = resolve(ROOT, 'config', 'assumptions.json')
const SCRIPT      = resolve(ROOT, 'scripts', 'generate_cash_flow_forecast.py')

function readBody(req) {
  return new Promise((ok, fail) => {
    let s = ''
    req.on('data', c => s += c)
    req.on('end', () => ok(s))
    req.on('error', fail)
  })
}

function apiPlugin() {
  return {
    name: 'cash-flow-api',
    configureServer(server) {

      // GET /api/assumptions  — return current config
      server.middlewares.use('/api/assumptions', (req, res, next) => {
        if (req.method !== 'GET') return next()
        res.setHeader('Content-Type', 'application/json')
        try {
          res.end(existsSync(CONFIG_FILE) ? readFileSync(CONFIG_FILE, 'utf8') : '{}')
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: e.message }))
        }
      })

      // POST /api/generate  — save assumptions + run python script
      server.middlewares.use('/api/generate', async (req, res, next) => {
        if (req.method !== 'POST') return next()
        try {
          const body = await readBody(req)
          const assumptions = JSON.parse(body)
          mkdirSync(resolve(ROOT, 'config'), { recursive: true })
          writeFileSync(CONFIG_FILE, JSON.stringify(assumptions, null, 2))
          const ob = String(assumptions.opening_balance ?? 0)
          execFile(
            'python3',
            [SCRIPT, '--opening-balance', ob],
            { env: { ...process.env, ASSUMPTIONS_FILE: CONFIG_FILE }, timeout: 60000 },
            (err, stdout, stderr) => {
              res.setHeader('Content-Type', 'application/json')
              if (err) {
                res.statusCode = 500
                res.end(JSON.stringify({ ok: false, error: stderr || err.message, stdout }))
              } else {
                res.end(JSON.stringify({ ok: true, stdout, stderr }))
              }
            }
          )
        } catch (e) {
          res.statusCode = 400
          res.end(JSON.stringify({ ok: false, error: e.message }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), apiPlugin()],
  server: {
    allowedHosts: true,
  },
})
