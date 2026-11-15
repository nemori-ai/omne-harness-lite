/**
 * @module-tag slow
 * Starts a real Electron process under a virtual display, which takes seconds.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { identityProtocol } from '@omne-harness/identity-protocol'
import { accessProtocol } from '@omne-harness/public-contract'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { OMNE_HOST_METHODS } from '../src/shared/host-bridge.ts'
import { PROOF_SENTINEL, fakeServer, value } from './support/fake-server.ts'
import { serveFakeHttp } from './support/http-fake.ts'

const electron = createRequire(import.meta.url)('electron') as string
const probeMain = fileURLToPath(new URL('./support/probe-main.mjs', import.meta.url))
const builtMain = fileURLToPath(new URL('../dist/electron-host/main.js', import.meta.url))
const hasDisplay = spawnSync('xvfb-run', ['--help']).error === undefined

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
  const environment = { require: typeof require, process: typeof process, keys: Object.keys(window.omneHost).sort() }
  window.__control = needle
  const searchWorks = holds()
  delete window.__control
  const opened = window.open('https://example.invalid/')
  const origin = location.origin
  location.href = 'https://example.invalid/'
  await new Promise(resolve => setTimeout(resolve, 500))
  const stayed = location.origin === origin
  const geolocation = (await navigator.permissions.query({ name: 'geolocation' })).state
  const login = await window.omneHost.login(JSON.stringify({ loginIdentifier: 'alice', credential: 'pw' }))
  const gateGone = await wait(() => !document.body.innerText.includes('登录名'))
  await new Promise(resolve => setTimeout(resolve, 500))
  return { sawGate, environment, searchWorks, opened, stayed, geolocation, origin, login, gateGone, proofInPage: holds() }
})()`

it(
  '真的窗口：沙箱开着，只暴露五条通道，登录门出现，登录后页面里搜不到登录证明',
  {
    timeout: 120_000,
  },
  async ctx => {
    if (!hasDisplay) return ctx.skip('xvfb-run is not installed')
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
    const http = await serveFakeHttp(server, [accessProtocol, identityProtocol, sessionProtocol])
    const userData = await mkdtemp(join(tmpdir(), 'omne-electron-'))
    const child = spawn('xvfb-run', ['-a', electron, probeMain, `--user-data-dir=${userData}`], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, OMNE_SERVER: http.origin, OMNE_PROBE_SCRIPT: PROBE },
    })
    let output = ''
    child.stdout.on('data', chunk => (output += String(chunk)))
    child.stderr.on('data', chunk => (output += String(chunk)))
    const killer = setTimeout(() => process.kill(-child.pid!, 'SIGKILL'), 100_000)
    try {
      await new Promise(resolve => child.once('close', resolve))
    } finally {
      clearTimeout(killer)
      await http.close()
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
      result: {
        ok: true,
        value: {
          sawGate: true,
          environment: {
            require: 'undefined',
            process: 'undefined',
            keys: [...OMNE_HOST_METHODS].sort(),
          },
          searchWorks: true,
          opened: null,
          stayed: true,
          geolocation: 'denied',
          origin: 'omne-app://app',
          login: { text: '{"result":"signed-in"}' },
          gateGone: true,
          proofInPage: false,
        },
      },
    })
    expect(server.seen.some(item => item.credentials.proof === PROOF_SENTINEL)).toBe(true)
  },
)
