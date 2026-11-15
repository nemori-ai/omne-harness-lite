import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { startModelGateway } from '../../harness-server/tests/fixtures/model-gateway.ts'
import {
  freePort,
  newScratch,
  operatorLayer,
  startServer,
  writeOperator,
} from '../../harness-server/tests/r9/support.ts'
import { accessProtocol } from '@omne-harness/public-contract'
import { httpServer, memoryCredentialStore, openLoginSession } from '../dist/main-core/index.js'
import { domainProtocols } from '../dist/shared/protocols.js'
import { createWebHost } from '../dist/web-host/server.js'

const USAGE = `usage: node apps/desktop/demo/page-walk.mjs [--shots <dir>]

Starts a server on a fresh state directory, the local host and a headless Chromium, then walks the page.
Needs \`pnpm run build\` in apps/desktop and apps/harness-server first. The Chromium is the newest
chrome-headless-shell under ~/.cache/ms-playwright, or OMNE_WALK_CHROME.`

const args = process.argv.slice(2)
if (args.includes('--help')) {
  process.stdout.write(`${USAGE}\n`)
  process.exit(0)
}
const shotsAt = args.indexOf('--shots')
const shots = resolve(shotsAt < 0 ? mkdtempSync(join(tmpdir(), 'page-walk-')) : args[shotsAt + 1])
mkdirSync(shots, { recursive: true })

const print = line => process.stdout.write(`${line}\n`)
const ACCOUNT = { loginIdentifier: 'walker', credential: 'walk-pw-MARKER-5d2e' }
const REPLY = ['hello from the page walk', 'a second answer that is held', 'the third answer']

const sse = events => events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
const piece = (body, content) => ({
  model: JSON.parse(body).model ?? 'm',
  provider: 'OpenAI',
  choices: [{ delta: { content } }],
})
const STOP = { choices: [{ delta: {}, finish_reason: 'stop' }] }

let releaseHeld = () => {}
const held = new Promise(resolve => {
  releaseHeld = resolve
})

function answer({ index, body }) {
  const text = REPLY[Math.min(index, REPLY.length - 1)]
  const reply = { status: 200, contentType: 'text/event-stream' }
  if (index !== 1) return { ...reply, body: `${sse([piece(body, text), STOP])}data: [DONE]\n\n` }
  return {
    ...reply,
    body: sse([piece(body, text.slice(0, 8))]),
    rest: { after: held, body: `${sse([piece(body, text.slice(8)), STOP])}data: [DONE]\n\n` },
  }
}

function chromePath() {
  if (process.env['OMNE_WALK_CHROME']) return process.env['OMNE_WALK_CHROME']
  const cache = join(homedir(), '.cache', 'ms-playwright')
  const builds = readdirSync(cache)
    .filter(name => name.startsWith('chromium_headless_shell-'))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
  for (const build of builds) {
    const path = join(cache, build, 'chrome-headless-shell-linux64', 'chrome-headless-shell')
    if (existsSync(path)) return path
  }
  throw new Error('no chrome-headless-shell under ~/.cache/ms-playwright; set OMNE_WALK_CHROME')
}

function startChrome(profile) {
  const child = spawn(
    chromePath(),
    [
      '--headless',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--window-size=1280,860',
      '--no-first-run',
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

async function devtools(port) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const page = targets.find(target => target.type === 'page')
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let next = 0
  const waiting = new Map()
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data))
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
  return { send, close: () => socket.close() }
}

const HELPERS = `
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  const wait = async (what, find) => {
    for (let i = 0; i < 300; i += 1) {
      const found = find()
      if (found) return found
      await sleep(100)
    }
    throw new Error('timed out waiting for ' + what)
  }
  const byText = (selector, text) =>
    [...document.querySelectorAll(selector)].find(element => element.textContent.trim() === text)
  const fill = (element, text) => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, text)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const press = async (selector, text) => {
    const button = await wait('an enabled ' + text, () => {
      const found = byText(selector, text)
      return found && !found.disabled ? found : undefined
    })
    button.click()
  }
  const signIn = async (mode, account) => {
    await wait('the login gate', () => document.querySelector('input[name=loginIdentifier]'))
    await press('button', mode)
    fill(document.querySelector('input[name=loginIdentifier]'), account.loginIdentifier)
    fill(document.querySelector('input[name=credential]'), account.credential)
    await press('button[type=submit]', mode === '第一次使用' ? '注册并登录' : '登录')
    await wait('the sidebar', () => document.querySelector('.shell-sidebar'))
  }
  const sidebar = () => [...document.querySelectorAll('.shell-sidebar-item')].map(item => item.dataset.item)
  const nav = () => [...document.querySelectorAll('.shell-nav-link')].map(link => link.textContent.trim())
  const transcript = () => document.querySelector('section[data-page=conversation]')?.innerText ?? ''
`

async function walk(browser, origin, proofs) {
  const { send } = browser
  await send('Page.enable')
  await send('Page.navigate', { url: origin })
  let number = 0
  const step = async (name, body) => {
    number += 1
    const result = await send('Runtime.evaluate', {
      expression: `(async () => { ${HELPERS}\n${body} })()`,
      awaitPromise: true,
      returnByValue: true,
    })
    const failed = result.exceptionDetails !== undefined
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const file = join(shots, `${String(number).padStart(2, '0')}${failed ? '-failed' : ''}.png`)
    writeFileSync(file, Buffer.from(shot.data, 'base64'))
    if (failed)
      throw new Error(
        `step ${number} ${name}: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}  [${file}]`,
      )
    print(`STEP ${number} ${name}: ${JSON.stringify(result.result.value)}  [${file}]`)
    return result.result.value
  }
  const account = JSON.stringify(ACCOUNT)

  await step(
    '登录门出现',
    `
    await wait('the login gate', () => document.querySelector('input[name=loginIdentifier]'))
    return document.querySelector('h1')?.textContent`,
  )
  await step(
    '注册并登录',
    `
    await signIn('第一次使用', ${account})
    return 'signed in'`,
  )
  await step(
    '侧栏：页面导航、会话列表与账号块',
    `
    await wait('the account block', () => /租户 /.test(document.querySelector('.identity-account')?.textContent ?? ''))
    return { nav: nav(), sidebar: sidebar(), tenant: document.querySelector('.identity-account-tenant').textContent }`,
  )
  await step(
    '空的会话列表',
    `
    return await wait('the empty list', () => byText('.omne-sessions-note', '还没有会话。')?.textContent)`,
  )
  await step(
    '新建会话',
    `
    const refusals = []
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await press('button', '新建会话')
      const outcome = await wait('the composer or a refusal', () =>
        document.querySelector('textarea[aria-label="输入消息"]') ??
        [...document.querySelectorAll('section[data-page=conversation] [role=alert], section[data-page=conversation] .omne-notice')].find(item => item.textContent.includes('没有建成会话')))
      if (outcome.tagName === 'TEXTAREA') return { composer: 'shown', attempts: attempt, refusals }
      refusals.push(outcome.textContent.trim())
      await sleep(1000)
    }
    throw new Error('the session was not created: ' + refusals.join(' | '))`,
  )
  await step(
    '发消息，看到流式回复',
    `
    fill(document.querySelector('textarea[aria-label="输入消息"]'), 'say hello')
    await press('button[type=submit]', '发送')
    await wait('the reply', () => transcript().includes(${JSON.stringify(REPLY[0])}))
    return transcript().slice(-120)`,
  )
  await step(
    '再发一条，回复停在半路时停止这一轮',
    `
    fill(document.querySelector('textarea[aria-label="输入消息"]'), 'hold on')
    await press('button[type=submit]', '发送')
    await wait('the held run', () => transcript().includes('正在生成'))
    await press('button', '停止')
    const confirm = await wait('the stop to settle', () => byText('button', '再确认停止') ?? byText('button[type=submit]', '发送'))
    if (confirm.textContent.trim() === '再确认停止') confirm.click()
    await wait('the send button back', () => byText('button[type=submit]', '发送'))
    return 'stopped'`,
  )
  releaseHeld()
  await step(
    '停止之后再发一条',
    `
    fill(document.querySelector('textarea[aria-label="输入消息"]'), 'once more')
    await press('button[type=submit]', '发送')
    await wait('the third reply', () => transcript().includes(${JSON.stringify(REPLY[2])}))
    return transcript().slice(-120)`,
  )
  await step(
    '切到设置',
    `
    await press('.shell-nav-link', '设置')
    const page = await wait('the settings page', () => {
      const section = document.querySelector('section[data-page=settings]')
      return section && !section.hidden && section.innerText.trim() !== '' ? section : undefined
    })
    return { nav: nav(), current: document.querySelector('[aria-current=page]').textContent.trim(), heading: page.querySelector('h1, h2')?.textContent }`,
  )
  await step(
    '改一项设置，再清除它',
    `
    const rows = () => [...document.querySelectorAll('section[data-page=settings] li.assets-setting')]
    const row = await wait('an editable permission', () =>
      rows().find(item => item.querySelector('[role=radio][aria-checked=false]') && [...item.querySelectorAll('button')].some(button => button.textContent.trim() === '设置')))
    const title = row.querySelector('.assets-setting-title').textContent
    if (!row.innerText.includes('没有挑选')) throw new Error('the setting already had a choice on this layer')
    row.querySelector('[role=radio][aria-checked=false]').click()
    const set = await wait('an enabled set', () => [...row.querySelectorAll('button')].find(button => button.textContent.trim() === '设置' && !button.disabled))
    set.click()
    await wait('the write', () => row.innerText.includes('已写入。') && !row.innerText.includes('没有挑选'))
    const clear = await wait('an enabled clear', () => [...row.querySelectorAll('button')].find(button => button.textContent.trim() === '清除' && !button.disabled))
    clear.click()
    await wait('the clear to land', () => !row.innerText.includes('正在提交') && row.innerText.includes('没有挑选'))
    return { title, written: true, cleared: true }`,
  )
  await step(
    '被锁定的一项改不了',
    `
    const rows = [...document.querySelectorAll('section[data-page=settings] li.assets-setting')]
    const locked = rows.filter(item => item.innerText.includes('被上层锁定'))
    if (locked.length === 0) return 'no locked setting in this deployment; not walked'
    const editable = locked.filter(item => [...item.querySelectorAll('button')].some(button => ['设置', '清除'].includes(button.textContent.trim())))
    if (editable.length > 0) throw new Error('a locked setting shows controls')
    return { locked: locked.length, controls: 0 }`,
  )
  await step(
    '明暗切换',
    `
    const before = document.documentElement.dataset.theme
    await press('button', before === 'dark' ? '换成浅色' : '换成深色')
    await wait('the other theme', () => document.documentElement.dataset.theme !== before)
    return { before, after: document.documentElement.dataset.theme, stored: localStorage.getItem('omne.theme') }`,
  )
  await step(
    '切回对话，退出登录',
    `
    await press('.shell-nav-link', '对话')
    await press('button', '退出登录')
    await wait('the login gate', () => document.querySelector('input[name=loginIdentifier]'))
    return { sidebar: document.querySelector('.shell-sidebar') === null ? 'gone' : 'still there' }`,
  )
  await step(
    '再登录，会话还在',
    `
    await signIn('登录', ${account})
    const items = await wait('the session list', () => {
      const found = [...document.querySelectorAll('.omne-session-item')]
      return found.length > 0 ? found : undefined
    })
    return { sessions: items.length }`,
  )
  await step(
    '页面里搜不到登录证明与密码',
    `
    const needles = ${JSON.stringify([...proofs, ACCOUNT.credential])}
    const places = [document.cookie, document.documentElement.outerHTML]
    for (const store of [localStorage, sessionStorage])
      for (let i = 0; i < store.length; i += 1) places.push(store.key(i), store.getItem(store.key(i)))
    for (const key of Object.getOwnPropertyNames(window)) {
      try {
        places.push(key, JSON.stringify(window[key]))
      } catch {}
    }
    const found = needles.filter(needle => places.some(place => typeof place === 'string' && place.includes(needle)))
    if (found.length > 0) throw new Error('found ' + found.length + ' secret(s) in the page')
    return { searched: needles.length, places: places.length, found: 0 }`,
  )
}

const scratch = newScratch('page-walk-')
const profile = mkdtempSync(join(tmpdir(), 'page-walk-chrome-'))
let gateway
let server
let host
let chrome
let browser
let code = 1
try {
  gateway = await startModelGateway(answer)
  const port = await freePort()
  const operatorPath = join(scratch.base, 'operator.json')
  writeOperator(
    operatorPath,
    operatorLayer({ storageRoot: scratch.storageRoot, port, modelRoute: gateway.url }),
  )
  server = await startServer({
    stateRoot: scratch.stateRoot,
    operatorPath,
    port,
    extraCaPath: gateway.certPath,
  })
  print(`server: 127.0.0.1:${port}, state ${scratch.stateRoot}`)
  const proofs = new Set()
  const store = memoryCredentialStore()
  const session = await openLoginSession({
    connect: httpServer(`http://127.0.0.1:${port}`),
    store: {
      read: () => store.read(),
      write: login => {
        proofs.add(login.proof)
        return store.write(login)
      },
      erase: () => store.erase(),
    },
    contracts: [accessProtocol, ...domainProtocols],
  })
  host = createWebHost({
    session,
    pageRoot: new URL('../dist/page/', import.meta.url).pathname,
  })
  const hostPort = await host.listen(0)
  print(`host: http://127.0.0.1:${hostPort}/`)
  chrome = await startChrome(profile)
  browser = await devtools(chrome.port)
  await walk(browser, `http://127.0.0.1:${hostPort}/`, proofs)
  print(`walk: all steps passed; ${proofs.size} login proof(s) were searched for`)
  code = 0
} catch (failure) {
  print(`failed: ${failure instanceof Error ? failure.message : String(failure)}`)
} finally {
  releaseHeld()
  browser?.close()
  if (chrome?.child.pid !== undefined && chrome.child.exitCode === null)
    process.kill(-chrome.child.pid, 'SIGKILL')
  await host?.close().catch(() => {})
  await server?.stop().catch(() => {})
  await gateway?.close().catch(() => {})
  scratch.remove()
  rmSync(profile, { recursive: true, force: true })
}
print(`screenshots: ${shots}`)
process.exit(code)
