import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { startModelGateway } from '../../harness-server/tests/fixtures/model-gateway.ts'
import {
  freePort,
  newScratch,
  operatorLayer,
  startServer,
  writeOperator,
} from '../../harness-server/tests/r9/support.ts'
import { accessProtocol } from '@omne-harness/public-contract'
import { createForwarding } from '../dist/forwarding/app.js'
import { createForwardingRules, httpServer } from '../dist/forwarding/rules.js'
import { domainProtocols } from '../dist/shared/protocols.js'
import { createStandalone } from '../dist/standalone/server.js'

const PLAYWRIGHT_SHELLS = [
  ['chrome-headless-shell-linux64', 'chrome-headless-shell'],
  ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell'],
  ['chrome-headless-shell-mac-x64', 'chrome-headless-shell'],
]
const SYSTEM_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

export function chromePath() {
  if (process.env['OMNE_WALK_CHROME']) return process.env['OMNE_WALK_CHROME']
  for (const cache of [
    join(homedir(), '.cache', 'ms-playwright'),
    join(homedir(), 'Library', 'Caches', 'ms-playwright'),
  ]) {
    if (!existsSync(cache)) continue
    const builds = readdirSync(cache)
      .filter(name => name.startsWith('chromium_headless_shell-'))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
    for (const build of builds)
      for (const [folder, binary] of PLAYWRIGHT_SHELLS) {
        const path = join(cache, build, folder, binary)
        if (existsSync(path)) return path
      }
  }
  if (existsSync(SYSTEM_CHROME)) return SYSTEM_CHROME
  throw new Error('no headless Chromium found; set OMNE_WALK_CHROME')
}

export function startChrome(profile, scale = 1) {
  const child = spawn(
    chromePath(),
    [
      '--headless',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--window-size=1440,900',
      '--hide-scrollbars=false',
      '--no-first-run',
      '--no-default-browser-check',
      ...(scale === 1 ? [] : [`--force-device-scale-factor=${scale}`]),
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'], detached: true },
  )
  return new Promise((resolve, reject) => {
    let text = ''
    const timer = setTimeout(() => reject(new Error('Chromium did not open DevTools')), 20_000)
    child.stderr.on('data', chunk => {
      text += String(chunk)
      const found = /DevTools listening on ws:\/\/[^:]+:(\d+)\//.exec(text)
      if (found === null) return
      clearTimeout(timer)
      resolve({ child, port: Number(found[1]) })
    })
    child.once('exit', code => reject(new Error(`Chromium exited ${code}: ${text}`)))
  })
}

export function stopChrome(chrome) {
  if (chrome?.child.pid !== undefined && chrome.child.exitCode === null)
    process.kill(-chrome.child.pid, 'SIGKILL')
}

export async function devtools(port) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const page = targets.find(target => target.type === 'page')
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let next = 0
  const waiting = new Map()
  const listeners = new Map()
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data))
    if (message.method !== undefined) {
      for (const listener of listeners.get(message.method) ?? []) listener(message.params)
      return
    }
    const pending = waiting.get(message.id)
    if (pending === undefined) return
    waiting.delete(message.id)
    if (message.error) pending.reject(new Error(message.error.message))
    else pending.resolve(message.result)
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      next += 1
      waiting.set(next, { resolve, reject })
      socket.send(JSON.stringify({ id: next, method, params }))
    })
  const on = (method, listener) => {
    const set = listeners.get(method) ?? new Set()
    set.add(listener)
    listeners.set(method, set)
    return () => set.delete(listener)
  }
  return { send, on, close: () => socket.close() }
}

export async function evaluate(browser, expression) {
  const result = await browser.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails !== undefined)
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  return result.result.value
}

export async function screenshot(browser, file, clip) {
  const shot = await browser.send('Page.captureScreenshot', {
    format: 'png',
    ...(clip === undefined ? {} : { clip: { ...clip, scale: 1 } }),
  })
  writeFileSync(file, Buffer.from(shot.data, 'base64'))
  return file
}

export async function record(browser, folder, act, { lasting, clip, pixels } = {}) {
  mkdirSync(folder, { recursive: true })
  const frames = []
  const off = browser.on('Page.screencastFrame', params => {
    frames.push({ at: params.metadata.timestamp * 1000, data: params.data })
    browser.send('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {})
  })
  await browser.send('Page.startScreencast', {
    format: 'png',
    everyNthFrame: 1,
    ...(pixels === undefined ? {} : { maxWidth: pixels.width, maxHeight: pixels.height }),
  })
  const started = await evaluate(browser, 'performance.timeOrigin + performance.now()')
  await act(started)
  await new Promise(resolve => setTimeout(resolve, lasting ?? 2000))
  await browser.send('Page.stopScreencast')
  off()
  const index = frames.map((frame, number) => {
    const name = `${String(number).padStart(4, '0')}.png`
    writeFileSync(join(folder, name), Buffer.from(frame.data, 'base64'))
    return { name, ms: Math.round(frame.at - started) }
  })
  writeFileSync(join(folder, 'index.json'), `${JSON.stringify({ clip, frames: index }, null, 2)}\n`)
  return index
}

/**
 * The notification page limit the application ships with (harness-server `operator-defaults.ts`): the inbox page asks
 * for that many, while the test layer's policy allows fewer and would refuse every read.
 */
const APP_NOTIFICATION_PAGE_LIMIT = 100

function withAppInbox(layer) {
  const visit = node => {
    if (Array.isArray(node)) return node.map(visit)
    if (node === null || typeof node !== 'object') return node
    if (node.id === 'notification' && node.config?.policy !== undefined) {
      const policy = { ...node.config.policy, pageLimit: APP_NOTIFICATION_PAGE_LIMIT }
      return { ...node, config: { ...node.config, policy } }
    }
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, visit(value)]))
  }
  return visit(layer)
}

// The server writes megabytes of telemetry per scene; the walk keeps the newest part, enough to read a failure.
const LOG_TAIL = 4_000_000

export async function startStack({ answer, pageRoot, specimenRoot }) {
  const scratch = newScratch('visual-walk-')
  const hostLog = []
  const log = line => hostLog.push(`${new Date().toISOString()} ${line}`)
  const gateway = await startModelGateway(answer)
  const port = await freePort()
  const operatorPath = join(scratch.base, 'operator.json')
  writeOperator(
    operatorPath,
    withAppInbox(
      operatorLayer({ storageRoot: scratch.storageRoot, port, modelRoute: gateway.url }),
    ),
  )
  const server = await startServer({
    stateRoot: scratch.stateRoot,
    operatorPath,
    port,
    extraCaPath: gateway.certPath,
    logTail: LOG_TAIL,
  })
  let lastLogin
  const inner = createForwardingRules({
    connect: httpServer(`http://127.0.0.1:${port}`),
    contracts: [accessProtocol, ...domainProtocols],
  })
  const rules = {
    ...inner,
    async login(credentials) {
      const answered = await inner.login(credentials)
      if (answered.result === 'signed-in') lastLogin = answered.login
      return answered
    },
  }
  const host = createStandalone({
    forwarding: createForwarding({
      rules,
      readPageFile: segments =>
        readFile(
          specimenRoot !== undefined && segments[0] === 'specimen'
            ? join(specimenRoot, ...segments.slice(1))
            : join(pageRoot, ...segments),
        ).then(
          content => new Uint8Array(content),
          () => undefined,
        ),
      log,
    }),
    log,
  })
  const hostPort = await host.listen(0)
  const transport = {
    call: request => inner.call(request, lastLogin),
    observe: request => inner.observe(request, lastLogin),
  }
  const stop = async () => {
    await host.close().catch(() => {})
    await server.stop().catch(() => {})
    await gateway.close().catch(() => {})
    scratch.remove()
  }
  return { origin: `http://127.0.0.1:${hostPort}/`, server, hostLog, transport, stop }
}
