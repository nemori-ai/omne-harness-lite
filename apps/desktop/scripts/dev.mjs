// Development: builds once, then watches. A rebuilt page reloads the window;
// a rebuilt main or utility process restarts the app. Either way the login stays: it is a cookie.
import { spawn, spawnSync } from 'node:child_process'
import { rmSync, watch } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { electronBinary, electronEnvironment } from './electron-env.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const main = fileURLToPath(new URL('../dist/main/main.js', import.meta.url))
const MAIN_SIDE = ['shared', 'forwarding', 'port-fetch', 'utility', 'main']
const say = line => process.stderr.write(`dev: ${line}\n`)

const tool = (name, args) => ['pnpm', ['exec', name, ...args], { cwd: root, stdio: 'inherit' }]

rmSync(dist, { recursive: true, force: true })
for (const [name, args] of [
  ['tsc', ['-p', 'tsconfig.build.json']],
  ['vite', ['build']],
]) {
  const built = spawnSync(...tool(name, args))
  if (built.status !== 0) {
    say(`the first ${name} build failed`)
    process.exit(built.status ?? 1)
  }
}

const watchers = [
  spawn(...tool('tsc', ['-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput'])),
  spawn(...tool('vite', ['build', '--watch'])),
]

let app
let stopping = false
let restartTimer

function startApp() {
  app = spawn(electronBinary, [main, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: electronEnvironment(process.env, { OMNE_DESKTOP_DEV: '1' }),
  })
  const started = app
  started.on('exit', () => {
    if (app !== started) return
    // The person closed the window: development ends with it.
    if (!stopping) stop(0)
  })
}

function restartApp() {
  const old = app
  app = undefined
  say('the main process changed; restarting the window')
  // The single-instance lock: the new process must start after the old one is gone.
  old.once('exit', () => {
    if (!stopping) startApp()
  })
  old.kill('SIGTERM')
}

function stop(code) {
  if (stopping) return
  stopping = true
  clearTimeout(restartTimer)
  for (const watcher of watchers) watcher.kill('SIGTERM')
  app?.kill('SIGTERM')
  process.exit(code)
}

for (const directory of MAIN_SIDE)
  watch(new URL(`../dist/${directory}/`, import.meta.url), { recursive: true }, () => {
    if (app === undefined || stopping) return
    clearTimeout(restartTimer)
    restartTimer = setTimeout(restartApp, 300)
  })

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(0))
startApp()
