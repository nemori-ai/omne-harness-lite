/**
 * @module-tag slow
 * Starts a real Electron process (under a virtual display on Linux), which takes seconds.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { identityProtocol } from '@omne-harness/identity-protocol'
import { accessProtocol } from '@omne-harness/public-contract'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { PROOF_SENTINEL, fakeServer, value } from './support/fake-server.ts'
import { serveFakeHttp } from './support/http-fake.ts'

const electron = createRequire(import.meta.url)('electron') as string
const probeMain = fileURLToPath(new URL('./support/probe-main.mjs', import.meta.url))
const builtMain = fileURLToPath(new URL('../dist/release/main/main.js', import.meta.url))
// Linux needs a virtual display; macOS and Windows start the window directly.
const needsXvfb = process.platform === 'linux'
const hasDisplay = !needsXvfb || spawnSync('xvfb-run', ['--help']).error === undefined

const OBSERVE = JSON.stringify({
  protocol: { name: 'session', major: 1 },
  observation: 'observe-session',
  messageId: 'm-1',
  open: { session: 's' },
})

// Opens the page's event stream with one observation on it and resolves at its first event.
const openObservation = `(async () => {
  const page = crypto.randomUUID()
  const abort = new AbortController()
  const events = await fetch('/bridge/events?page=' + page, { signal: abort.signal })
  const attached = await fetch('/bridge/observe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ page, id: 'o-1', request: ${JSON.stringify(OBSERVE)} }),
  })
  const first = await events.body.getReader().read()
  window.__abortObservation = () => abort.abort()
  return { events: events.status, attached: attached.status, gotEvent: first.done === false }
})()`

// After a reload: the page finds itself signed in from the cookie alone, and still holds no proof.
const AFTER_RELOAD = `(async () => {
  const workspace = () => document.querySelector('.shell-workspace') !== null
  for (let i = 0; i < 150 && !workspace(); i += 1)
    await new Promise(resolve => setTimeout(resolve, 100))
  const text = document.body.innerText
  const places = [document.cookie, document.documentElement.outerHTML, JSON.stringify(localStorage)]
  return {
    workspace: workspace(),
    gate: text.includes('登录名'),
    cookie: document.cookie,
    proofInPage: places.some(place => place.includes(${JSON.stringify(PROOF_SENTINEL)})),
  }
})()`

// After the utility process was killed: asks until the forwarding layer answers again.
const STANDING = `(async () => {
  for (let i = 0; i < 100; i += 1) {
    const answer = await fetch('/bridge/login-standing', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }).catch(() => undefined)
    if (answer !== undefined && answer.ok) return (await answer.json()).state
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return 'no answer'
})()`

const PROBE = `(async () => {
  const wait = async check => {
    for (let i = 0; i < 150; i += 1) {
      if (check()) return true
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return false
  }
  const needle = ${JSON.stringify(PROOF_SENTINEL)}
  const holds = () => {
    const places = [document.cookie, document.documentElement.outerHTML]
    for (const store of [localStorage, sessionStorage])
      for (let i = 0; i < store.length; i += 1) places.push(store.key(i), store.getItem(store.key(i)))
    for (const key of Object.getOwnPropertyNames(window)) {
      try {
        places.push(key, JSON.stringify(window[key]))
      } catch {}
    }
    return places.some(place => typeof place === 'string' && place.includes(needle))
  }
  const sawGate = await wait(() => document.body.innerText.includes('登录名'))
  const fromHost = Object.getOwnPropertyNames(window).filter(key => /omne|electron|ipc|bridge/i.test(key))
  const environment = { require: typeof require, process: typeof process, fromHost }
  const theme = document.documentElement.dataset.theme
  window.__control = needle
  const searchWorks = holds()
  delete window.__control
  const opened = window.open('https://example.invalid/')
  const origin = location.origin
  location.href = 'https://example.invalid/'
  await new Promise(resolve => setTimeout(resolve, 500))
  const stayed = location.origin === origin
  const geolocation = (await navigator.permissions.query({ name: 'geolocation' })).state
  const microphone = (await navigator.permissions.query({ name: 'microphone' })).state
  const camera = (await navigator.permissions.query({ name: 'camera' })).state
  const notifications = (await navigator.permissions.query({ name: 'notifications' })).state
  const mail = window.open('mailto:someone@example.invalid')
  const local = window.open('file:///etc/hosts')
  const foreign = await fetch('/bridge/logout', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })
  const login = await (await fetch('/bridge/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ loginIdentifier: 'alice', credential: 'pw' }),
  })).text()
  const observation = await ${openObservation}
  window.__abortObservation()
  const cookie = document.cookie
  return { sawGate, environment, theme, searchWorks, opened, mail, local, notJson: foreign.status, stayed, geolocation, microphone, camera, notifications, origin, login, cookie, observation, proofInPage: holds() }
})()`

it(
  '真的应用：沙箱开着，页面读不到 cookie，登录经 cookie 留过重新加载与 utility 进程重启，页面走了观察就取消，不开端口',
  {
    timeout: 120_000,
  },
  async ctx => {
    if (!hasDisplay) return ctx.skip('xvfb-run is not installed')
    let cancelled = 0
    expect(existsSync(builtMain), 'run `pnpm run build` in apps/desktop first').toBe(true)
    const server = fakeServer()
    server.stream('access/v1 availability', async function* (request) {
      yield value({
        kind: 'snapshot',
        revision: 1,
        protocols: [
          { name: 'access', major: 1 },
          { name: 'identity', major: 1 },
          { name: 'session', major: 1 },
        ],
      })
      await new Promise(resolve => request.signal.addEventListener('abort', resolve))
      return { kind: 'aborted' }
    })
    server.stream('session/v1 observe-session', async function* (request) {
      yield value({ kind: 'state', n: 1 })
      await new Promise(resolve => request.signal.addEventListener('abort', resolve))
      cancelled += 1
      return { kind: 'aborted' }
    })
    const counter = createServer((_request, response) => response.end(String(cancelled)))
    await new Promise<void>(resolve => counter.listen(0, '127.0.0.1', resolve))
    const countUrl = `http://127.0.0.1:${(counter.address() as AddressInfo).port}/`
    const http = await serveFakeHttp(server, [accessProtocol, identityProtocol, sessionProtocol])
    const userData = await realpath(await mkdtemp(join(tmpdir(), 'omne-electron-')))
    const args = [probeMain, `--user-data-dir=${userData}`]
    const {
      ELECTRON_RUN_AS_NODE: _runAsNode,
      NODE_OPTIONS: _nodeOptions,
      ...inherited
    } = process.env
    const child = spawn(
      needsXvfb ? 'xvfb-run' : electron,
      needsXvfb ? ['-a', electron, ...args] : args,
      {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...inherited,
          OMNE_SERVER: http.origin,
          OMNE_PROBE_SCRIPT: PROBE,
          OMNE_PROBE_LEAVE_OPEN: openObservation,
          OMNE_PROBE_AFTER_RELOAD: AFTER_RELOAD,
          OMNE_PROBE_STANDING: STANDING,
          OMNE_PROBE_COUNT: countUrl,
        },
      },
    )
    let output = ''
    child.stdout.on('data', chunk => (output += String(chunk)))
    child.stderr.on('data', chunk => (output += String(chunk)))
    const killer = setTimeout(() => process.kill(-child.pid!, 'SIGKILL'), 100_000)
    try {
      await new Promise(resolve => child.once('close', resolve))
    } finally {
      clearTimeout(killer)
      await http.close()
      await new Promise(resolve => counter.close(resolve))
      await rm(userData, { recursive: true, force: true })
    }
    const line = output.split('\n').find(item => item.startsWith('PROBE '))
    expect(line, output).toBeDefined()
    const probe = JSON.parse(line!.slice('PROBE '.length))
    expect(probe).toMatchObject({
      windows: 1,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      opened: [
        'https://example.invalid/',
        'https://example.invalid/',
        'mailto:someone@example.invalid',
      ],
      result: {
        ok: true,
        value: {
          sawGate: true,
          environment: {
            require: 'undefined',
            process: 'undefined',
            fromHost: ['omneDesktop', 'omneVisualBootstrap'],
          },
          mail: null,
          local: null,
          notJson: 403,
          observation: { events: 200, attached: 200, gotEvent: true },
          searchWorks: true,
          opened: null,
          stayed: true,
          geolocation: 'denied',
          microphone: 'granted',
          camera: 'denied',
          notifications: 'denied',
          origin: 'omne-app://app',
          login: '{"result":"signed-in"}',
          cookie: '',
          proofInPage: false,
        },
      },
    })
    expect(server.seen.some(item => item.credentials.proof === PROOF_SENTINEL)).toBe(true)
    expect(['light', 'dark']).toContain(probe.result.value.theme)
    // One cancellation each: the page aborting, a reload, a crash, the window destroyed.
    const tagged = (tag: string) =>
      output
        .split('\n')
        .filter(item => item.startsWith(`${tag} `))
        .map(item => item.slice(tag.length + 1))
    expect(tagged('PHASE'), output).toEqual([
      'reload 1',
      'utility-restart signed-in',
      'crash 2',
      'recovered',
      'destroy 3',
    ])
    // The cookie alone carried the login across the reload; the page still cannot read it.
    expect(JSON.parse(tagged('AFTER')[0]!)).toEqual({
      workspace: true,
      gate: false,
      cookie: '',
      proofInPage: false,
    })
    // No process of the app listens on a TCP port (where `lsof` can tell).
    expect(['0', 'unchecked']).toContain(tagged('LISTEN')[0])
    if (process.platform !== 'win32') expect(tagged('LISTEN')[0]).toBe('0')
    expect(cancelled).toBe(4)
  },
)
