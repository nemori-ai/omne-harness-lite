import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { build } from 'vite'
import { CONTENT_SECURITY_POLICY } from '../dist/shared/page-policy.js'

const USAGE = `usage: node apps/desktop/demo/charts-walk.mjs [--shots <dir>]

Builds a page of the chart controls with vite, serves it with the page policy of the desktop app and loads
it in Electron. Prints the policy violations, the console errors and the chart colors in the light and the
dark theme with a data point reached by keyboard, saves a screenshot of each, and exits 1 when a chart is not drawn or the policy refused anything.
Needs \`pnpm run build\` in packages/frontend/ui-kit and apps/desktop first: the page takes the built kit.`

const args = process.argv.slice(2)
if (args.includes('--help')) {
  process.stdout.write(`${USAGE}\n`)
  process.exit(0)
}
const shotsAt = args.indexOf('--shots')
const shots = resolve(shotsAt < 0 ? mkdtempSync(join(tmpdir(), 'charts-walk-')) : args[shotsAt + 1])
mkdirSync(shots, { recursive: true })

const root = fileURLToPath(new URL('./charts/', import.meta.url))
const built = mkdtempSync(join(tmpdir(), 'charts-page-'))
const userData = mkdtempSync(join(tmpdir(), 'charts-electron-'))
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
}

await build({
  root,
  configFile: false,
  logLevel: 'warn',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: built,
    emptyOutDir: true,
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
  },
})

const server = createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname
  const file = normalize(join(built, path === '/' ? 'index.html' : path))
  if (!file.startsWith(built)) return response.writeHead(403).end()
  let body
  try {
    body = readFileSync(file)
  } catch {
    return response.writeHead(404).end()
  }
  const type = TYPES[extname(file)] ?? 'application/octet-stream'
  response.writeHead(200, {
    'content-type': type,
    ...(type.startsWith('text/html') ? { 'content-security-policy': CONTENT_SECURITY_POLICY } : {}),
  })
  response.end(body)
})
await new Promise(ready => server.listen(0, '127.0.0.1', ready))
const url = `http://127.0.0.1:${server.address().port}/`

const electron = createRequire(import.meta.url)('electron')
const main = fileURLToPath(new URL('./charts-main.mjs', import.meta.url))
const { ELECTRON_RUN_AS_NODE: _runAsNode, ...env } = process.env
const output = await new Promise((done, failed) => {
  const child = spawn(electron, [main, `--user-data-dir=${userData}`], {
    env: { ...env, OMNE_CHARTS_URL: url, OMNE_CHARTS_OUT: shots },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  let text = ''
  child.stdout.on('data', chunk => {
    text += chunk
  })
  child.on('error', failed)
  child.on('close', () => done(text))
})
server.close()
rmSync(built, { recursive: true, force: true })
rmSync(userData, { recursive: true, force: true })

const line = output.split('\n').find(entry => entry.startsWith('CHARTWALK '))
if (line === undefined) {
  process.stderr.write(`charts-walk: no reading from Electron\n${output}`)
  process.exit(1)
}
const walk = JSON.parse(line.slice('CHARTWALK '.length))
const errors = (walk.messages ?? []).filter(
  message => message.level === 'error' || /Content Security Policy/i.test(message.message),
)
process.stdout.write(`${JSON.stringify({ shots, ...walk, errors }, null, 2)}\n`)
const [light, dark] = walk.readings ?? []
const drawn = reading =>
  reading !== undefined &&
  reading.surfaces >= 3 &&
  reading.tooltip === true &&
  reading.literal.length === 0 &&
  reading.styles === 0 &&
  reading.violations.length === 0 &&
  reading.bar.length > 0 &&
  reading.bar.every(fill => fill === reading.token) &&
  reading.line === reading.token
const passed =
  walk.ok === true &&
  errors.length === 0 &&
  drawn(light) &&
  drawn(dark) &&
  light.token !== dark.token
process.stdout.write(`charts-walk: ${passed ? 'passed' : 'failed'}\n`)
process.exit(passed ? 0 : 1)
