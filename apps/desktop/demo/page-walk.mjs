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
import { createClient } from '@omne-harness/sdk/core'
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
const SECRET_SENTINEL = 'walk-secret-SENTINEL-8c41'
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

let phase = 'walk'
/** What the host and the model gateway saw, with times; printed when a step fails. */
const hostLog = []
const AFTER_RETRY = 'answered after the retry'
const TOOL_ARGUMENTS = JSON.stringify({ command: 'execute', params: { script: 'echo walk-args' } })
const ASK_TITLE = 'Which port should the dev server use?'
const ASK_PICK = '8081 (Recommended)'
const AFTER_ASK = 'the port is settled'
const ASK_SECOND_TITLE = 'What should the new branch be called?'
const ASK_OWN_WORDS = 'walk/asset-page'
const APPROVAL_ACTION = 'Delete the build cache under ./dist'
const POOL_TITLE = 'Should the walk keep the screenshots?'
const POOL_PICK = 'Keep them'
const AFTER_POOL = 'the screenshots are kept'
const ASK_ARGUMENTS = JSON.stringify({
  command: 'ask',
  params: {
    questions: [
      {
        title: ASK_TITLE,
        description: 'Port 8080 is in use by another process on this machine.',
        options: [
          { label: ASK_PICK, description: 'The next free port.' },
          { label: '3000', description: 'The default port of the framework.' },
        ],
      },
      {
        title: ASK_SECOND_TITLE,
        description: 'The branch holds the asset page work.',
        options: [
          { label: 'feature/assets', description: 'Named after the feature.' },
          { label: 'wip', description: 'A short temporary name.' },
        ],
      },
    ],
  },
})
const APPROVAL_ARGUMENTS = JSON.stringify({
  command: 'request_approval',
  params: {
    action: APPROVAL_ACTION,
    reason: 'The cache holds a stale build of the page.',
    impact: 'The next build takes longer.',
    reversibility: 'The cache is rebuilt by the next build.',
    fallback: 'Keep the cache and build on top of it.',
  },
})
const POOL_ARGUMENTS = JSON.stringify({
  command: 'ask',
  params: {
    questions: [
      {
        title: POOL_TITLE,
        description: 'They are written to a temporary directory.',
        options: [
          { label: POOL_PICK, description: 'Leave them where they are.' },
          { label: 'Delete them', description: 'Remove the directory at the end.' },
        ],
      },
    ],
  },
})
const askCall = (index, id, args) => ({
  index,
  id,
  type: 'function',
  function: { name: 'Ask', arguments: args },
})

const final = (body, content) => `${sse([piece(body, content), STOP])}data: [DONE]\n\n`

function answer({ index, body }) {
  hostLog.push(`${new Date().toISOString()} model request ${index} (phase ${phase})`)
  const reply = { status: 200, contentType: 'text/event-stream' }
  if (phase === 'fail')
    return {
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'the input is rejected', code: 400 } }),
    }
  if (phase === 'recovered') return { ...reply, body: final(body, AFTER_RETRY) }
  if (phase === 'asked') return { ...reply, body: final(body, AFTER_ASK) }
  if (phase === 'pooled') return { ...reply, body: final(body, AFTER_POOL) }
  const calls =
    phase === 'ask'
      ? [
          askCall(0, 'call_ask_walk', ASK_ARGUMENTS),
          askCall(1, 'call_approval_walk', APPROVAL_ARGUMENTS),
        ]
      : phase === 'pool'
        ? [askCall(0, 'call_pool_walk', POOL_ARGUMENTS)]
        : []
  if (calls.length > 0) {
    const events = [
      { ...piece(body, undefined), choices: [{ delta: { tool_calls: calls } }] },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
    ]
    return { ...reply, body: `${sse(events)}data: [DONE]\n\n` }
  }
  if (phase === 'tool') {
    if (body.includes('"role":"tool"')) return { ...reply, body: final(body, 'done') }
    const call = {
      index: 0,
      id: 'call_walk',
      type: 'function',
      function: { name: 'Shell', arguments: TOOL_ARGUMENTS },
    }
    const events = [
      { ...piece(body, undefined), choices: [{ delta: { tool_calls: [call] } }] },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
    ]
    return { ...reply, body: `${sse(events)}data: [DONE]\n\n` }
  }
  const text = REPLY[Math.min(index, REPLY.length - 1)]
  if (index !== 1) return { ...reply, body: final(body, text) }
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
  const assetsPage = () => document.querySelector('section[data-page=assets]')
  const assetTabs = () => [...assetsPage().querySelectorAll('[role=tablist][aria-label="资产的类别"] [role=tab]')]
  const shownPanel = () => assetsPage().querySelector('[role=tabpanel]:not([hidden])')
  const openTab = async tab => {
    if (tab.getAttribute('aria-selected') !== 'true') tab.click()
    await wait('the panel of ' + tab.textContent, () => tab.getAttribute('aria-selected') === 'true' && shownPanel())
    await sleep(50)
    for (const button of shownPanel().querySelectorAll('.assets-item-title button[aria-expanded=false]')) button.click()
    await sleep(50)
    return shownPanel()
  }
  const inAssetTabs = async (what, find) => {
    for (let round = 0; round < 60; round += 1) {
      for (const tab of assetTabs()) {
        const found = find(await openTab(tab))
        if (found) return found
      }
      await sleep(100)
    }
    throw new Error('timed out waiting for ' + what + ' on any asset tab')
  }
  const dock = () => document.querySelector('section[data-page=conversation] .hitl-session-cards')
  const marks = area => [...area.querySelectorAll('.hitl-strip-item')].map(item => item.dataset.mark)
  const shownCard = area => area.querySelector('.hitl-card')
`

async function walk(browser, origin, proofs, elsewhere) {
  const { send } = browser
  await send('Page.enable')
  await send('Page.navigate', { url: origin })
  let number = 0
  const step = async (name, ...stages) => {
    number += 1
    hostLog.push(`${new Date().toISOString()} step ${number} ${name}`)
    let result
    for (const stage of stages) {
      if (typeof stage === 'function') {
        await stage()
        continue
      }
      result = await send('Runtime.evaluate', {
        expression: `(async () => { ${HELPERS}\n${stage} })()`,
        awaitPromise: true,
        returnByValue: true,
      })
      if (result.exceptionDetails !== undefined) break
    }
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
    '切到资产',
    `
    await press('.shell-nav-link', '资产')
    const tabs = await wait('the category tabs', () => {
      const page = assetsPage()
      if (!page || page.hidden) return undefined
      const found = page.querySelectorAll('[role=tablist][aria-label="资产的类别"] [role=tab]')
      return found.length > 0 ? [...found].map(tab => tab.textContent) : undefined
    })
    for (const name of ['工具', '模型供应商', 'MCP'])
      if (!tabs.includes(name)) throw new Error('no ' + name + ' tab: ' + JSON.stringify(tabs))
    for (const id of ['tool', 'model-provider'])
      if (tabs.includes(id)) throw new Error('the tab ' + id + ' shows its identifier, not the name from the server')
    for (const gone of ['偏好', 'preference'])
      if (tabs.includes(gone)) throw new Error('the asset page still has a tab for settings that are not assets: ' + JSON.stringify(tabs))
    const order = nav()
    if (!(order.indexOf('待你决定') < order.indexOf('资产') && order.indexOf('资产') < order.indexOf('设置')))
      throw new Error('the asset page is not between the decisions and the settings: ' + JSON.stringify(order))
    return { nav: order, current: document.querySelector('[aria-current=page]').textContent.trim(), tabs }`,
  )
  await step(
    '资产的列表与详情',
    `
    const listed = await inAssetTabs('a listed asset', panel => panel.querySelector('li.assets-item'))
    const item = await wait('its detail', () =>
      listed.querySelector('.assets-detail') && listed.innerText.includes('现在能不能用') ? listed : undefined)
    const facts = [...item.querySelectorAll('.assets-item-facts span')].map(span => span.textContent)
    const standing = [...item.querySelectorAll('.fact-list-row')]
      .find(row => row.querySelector('dt').textContent === '现在能不能用').querySelector('dd').textContent
    return { asset: item.getAttribute('aria-label'), facts, standing }`,
  )
  let madeElsewhere = Promise.resolve()
  await step(
    '别处新建一份技能：页面不用人动就列出它',
    `
    const tab = await wait('the skill tab', () => assetTabs().find(item => item.textContent === '技能'))
    await openTab(tab)
    if (shownPanel().querySelector('li.assets-item[aria-label="walk-made"]')) throw new Error('walk-made is listed before it is made')
    return 'watching the skill tab'`,
    () => {
      madeElsewhere = elsewhere.createSkill('walk-made').then(
        () => print('made walk-made outside the page'),
        failure => print(`making walk-made outside the page failed: ${failure.message}`),
      )
    },
    `
    const item = await wait('the new skill, without touching the page', () =>
      shownPanel().querySelector('li.assets-item[aria-label="walk-made"]'))
    return { listed: item.getAttribute('aria-label'), facts: [...item.querySelectorAll('.assets-item-facts span')].map(span => span.textContent) }`,
  )
  await madeElsewhere
  const skillDirectory = mkdtempSync(join(tmpdir(), 'page-walk-skill-'))
  writeFileSync(
    join(skillDirectory, 'SKILL.md'),
    '---\nname: walk-page\ndescription: Made in the page by the walk.\n---\n\n# walk-page\n',
  )
  await step(
    '在页面里新建一份技能：选目录、提交，列表里出现它',
    `
    const tab = await wait('the skill tab', () => assetTabs().find(item => item.textContent === '技能'))
    await openTab(tab)
    await press('button', '新建')
    const form = await wait('the form', () => shownPanel().querySelector('form[aria-label="新建"]'))
    fill(form.querySelector('input:not([type=file])'), 'walk-page')
    return 'the form is open'`,
    async () => {
      const found = await send('Runtime.evaluate', {
        expression: `document.querySelector('form[aria-label="新建"] input[type=file]')`,
      })
      await send('DOM.setFileInputFiles', {
        objectId: found.result.objectId,
        files: [skillDirectory],
      })
    },
    `
    const form = shownPanel().querySelector('form[aria-label="新建"]')
    await wait('the file count', () => form.innerText.includes('1 个文件'))
    await press('form[aria-label="新建"] button', '提交')
    await wait('the creation', () => form.innerText.includes('已新建 walk-page。'))
    const item = await wait('the new row', () => shownPanel().querySelector('li.assets-item[aria-label="walk-page"]'))
    return { created: item.getAttribute('aria-label'), note: form.innerText.split('\\n').filter(line => line.includes('文件')) }`,
  )
  rmSync(skillDirectory, { recursive: true, force: true })
  await step(
    '改一项设置，再清除它',
    `
    const row = await inAssetTabs('an editable permission with no pick on this layer', panel =>
      [...panel.querySelectorAll('li.assets-setting')].find(item =>
        item.innerText.includes('没有挑选') &&
        item.querySelector('[role=radio][aria-checked=false]') &&
        [...item.querySelectorAll('button')].some(button => button.textContent.trim() === '设置')))
    const title = row.querySelector('.assets-setting-title').textContent
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
    '设一个秘密项，再清除它',
    `
    const row = await inAssetTabs('an editable secret', panel =>
      [...panel.querySelectorAll('li.assets-setting[data-kind=secret]')].find(item => item.querySelector('input[type=password]')))
    const own = () => row.querySelector('.fact-list-row:nth-child(1) dd')?.textContent
    const input = row.querySelector('input[type=password]')
    if (own() !== '未配置') throw new Error('the secret already had a value on this layer: ' + own())
    if (input.autocomplete !== 'off') throw new Error('the password field allows autocomplete')
    fill(input, ${JSON.stringify(SECRET_SENTINEL)})
    const set = await wait('an enabled set', () => [...row.querySelectorAll('button')].find(button => button.textContent.trim() === '设置' && !button.disabled))
    set.click()
    await wait('the field to empty at once', () => input.value === '')
    await wait('the secret to read back as available', () => own() === '可用')
    const clear = await wait('an enabled clear', () => [...row.querySelectorAll('button')].find(button => button.textContent.trim() === '清除' && !button.disabled))
    clear.click()
    await wait('the clear to land', () => own() === '未配置')
    return { title: row.querySelector('.assets-setting-title').textContent, written: true, cleared: true }`,
  )
  await step(
    '被锁定的一项改不了',
    `
    let locked = 0
    for (const tab of assetTabs()) {
      const panel = await openTab(tab)
      const rows = [...panel.querySelectorAll('li.assets-setting')].filter(item => item.innerText.includes('被上层锁定'))
      locked += rows.length
      if (rows.some(item => [...item.querySelectorAll('button')].some(button => ['设置', '清除'].includes(button.textContent.trim()))))
        throw new Error('a locked setting shows controls on the tab ' + tab.textContent)
    }
    if (locked === 0) return 'no locked setting in this deployment; not walked'
    return { locked, controls: 0 }`,
  )
  await step(
    'MCP 的页签与它的说明',
    `
    const tab = await wait('the MCP tab', () => assetTabs().find(item => item.textContent === 'MCP'))
    const panel = await openTab(tab)
    const page = await wait('the MCP page', () => panel.querySelector('.mcp-page'))
    const text = await wait('the statement of the MCP page', () =>
      page.innerText.includes('MCP 还没有接进这个应用') ? page.innerText.trim() : undefined)
    if (panel.querySelector('.assets-category') !== null) throw new Error('the MCP tab draws the generic page')
    return { text }`,
  )
  await step(
    '设置页的两组：改时区，再清除',
    `
    await press('.shell-nav-link', '设置')
    const page = await wait('the two groups on the settings page', () => {
      const section = document.querySelector('section[data-page=settings]')
      if (!section || section.hidden) return undefined
      const groups = [...section.querySelectorAll('section.assets-group')].map(group => group.getAttribute('aria-label'))
      return groups.includes('日历与时区') && groups.includes('agent 管理日程') ? section : undefined
    })
    const groups = [...page.querySelectorAll('section.assets-group')].map(group => group.getAttribute('aria-label'))
    const row = [...page.querySelectorAll('li.assets-setting')].find(item =>
      item.querySelector('.assets-setting-title').textContent === '时区')
    if (!row) throw new Error('no timezone on the settings page')
    const picks = [...page.querySelectorAll('li.assets-setting')].filter(item => item.querySelector('[role=radio]')).length
    if (picks < 2) throw new Error('the two enum settings show no choices: ' + picks)
    fill(row.querySelector('.assets-setting-value input'), 'Europe/Paris')
    const set = await wait('an enabled set', () => [...row.querySelectorAll('button')].find(button => button.textContent.trim() === '设置' && !button.disabled))
    set.click()
    await wait('the write', () => row.innerText.includes('已写入。') && row.innerText.includes('Europe/Paris'))
    const clear = await wait('an enabled clear', () => [...row.querySelectorAll('button')].find(button => button.textContent.trim() === '清除' && !button.disabled))
    clear.click()
    await wait('the clear to land', () => !row.innerText.includes('正在提交') && !row.innerText.includes('Europe/Paris'))
    return { groups, written: 'Europe/Paris', cleared: true }`,
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
    '「待你决定」页读得出',
    `
    await press('.shell-nav-link', '待你决定')
    const page = await wait('the decisions page', () => document.querySelector('.hitl-decisions'))
    const settled = await wait('the list to settle', () => {
      if ([...page.querySelectorAll('button')].some(button => button.textContent.trim() === '重试')) return 'failed'
      if (page.querySelector('.hitl-cards') !== null) return 'cards'
      return page.textContent.includes('现在没有要你决定的事') ? 'empty' : undefined
    })
    if (settled === 'failed') throw new Error('the pending decisions did not read: ' + page.innerText)
    return { state: settled, cards: page.querySelectorAll('.hitl-cards > li').length }`,
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
    const needles = ${JSON.stringify([...proofs, ACCOUNT.credential, SECRET_SENTINEL])}
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
  phase = 'fail'
  await step(
    '一轮失败后看到成因与没处理的条数，按重试接着做',
    `
    await press('button', '新建会话')
    const box = await wait('the composer', () => document.querySelector('textarea[aria-label="输入消息"]'))
    fill(box, 'this one will fail')
    await press('button[type=submit]', '发送')
    const notice = await wait('the failure notice', () => document.querySelector('section.omne-waiting[aria-label="这一轮失败了"]'))
    await wait('the cause and the pending count', () => notice.innerText.includes('模型没有给出有效的回复。') && /还有 [1-9][0-9]* 条消息没有处理/.test(notice.innerText))
    await wait('the retry button', () => byText('section.omne-waiting button', '重试'))
    return { notice: notice.innerText }`,
    () => {
      phase = 'recovered'
    },
    `
    await press('section.omne-waiting button', '重试')
    await wait('the reply after the retry', () => transcript().includes(${JSON.stringify(AFTER_RETRY)}))
    await wait('the notice gone', () => document.querySelector('section.omne-waiting') === null)
    return transcript().slice(-120)`,
  )
  phase = 'tool'
  await step(
    '工具卡的参数是人读的样子',
    `
    fill(document.querySelector('textarea[aria-label="输入消息"]'), 'run the tool')
    await press('button[type=submit]', '发送')
    await wait('the tool card', () =>
      [...document.querySelectorAll('section[data-page=conversation] .omne-card')].find(item => item.querySelector('code')?.textContent === 'Shell'))
    await wait('the run to settle', () => transcript().includes('done') && byText('button[type=submit]', '发送'))
    const live = () => [...document.querySelectorAll('section[data-page=conversation] .omne-card')].find(item => item.querySelector('code')?.textContent === 'Shell')
    const trigger = await wait('the card trigger', () => live().querySelector('button[aria-expanded]'))
    if (trigger.getAttribute('aria-expanded') === 'false') trigger.click()
    await wait('the card open', () => live().querySelector('button[aria-expanded=true]'))
    const card = live()
    const list = await wait('the visible arguments list', () => {
      const found = card.querySelector('ul.omne-arguments')
      return found && found.innerText.includes('echo walk-args') ? found : undefined
    })
    const pairs = [...list.querySelectorAll('.omne-argument-name, .omne-argument-value')].map(item => item.textContent)
    for (const expected of ['command', 'execute', 'params', 'script', 'echo walk-args'])
      if (!pairs.includes(expected)) throw new Error('the card does not show ' + expected + ' as its own element: ' + JSON.stringify(pairs))
    const label = [...card.querySelectorAll('.omne-card-label')].find(item => item.textContent === '参数')
    if (label?.nextElementSibling !== list) throw new Error('the arguments are not a key/value list: ' + label?.nextElementSibling?.outerHTML)
    if (/[{}"]/.test(list.innerText)) throw new Error('the arguments show raw JSON: ' + list.innerText)
    return { pairs, arguments: list.innerText }`,
  )
  await step(
    '卡片展开之后才送达的滚动事件，不让转写区停止跟随',
    `
    const scroller = document.querySelector('section[data-page=conversation] .omne-conversation')
    const gap = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
    const before = gap()
    if (before <= 32) throw new Error('the open card does not push the end out of view, so this step cannot tell: gap ' + before)
    scroller.dispatchEvent(new Event('scroll'))
    fill(document.querySelector('textarea[aria-label="输入消息"]'), 'one more message')
    await press('button[type=submit]', '发送')
    await wait('the message in the transcript', () => transcript().includes('one more message'))
    await wait('the reply to the message', () =>
      transcript().split('one more message').at(-1).includes('done') && byText('button[type=submit]', '发送'))
    await wait('the end of the transcript in view', () => gap() <= 32)
    return { before, after: gap() }`,
  )
  phase = 'ask'
  await step(
    '一轮里并行的两次 Ask：对话页出现三张卡，两张问询一张请示，题号、等待提示与导航上的张数',
    `
    fill(document.querySelector('textarea[aria-label="输入消息"]'), 'ask me')
    await press('button[type=submit]', '发送')
    const area = await wait('the cards of this session', () => dock())
    await wait('three numbers above the cards', () => marks(area).length === 3)
    const seen = []
    for (let at = 1; at <= 3; at += 1) {
      const card = await wait('card ' + at, () => {
        const found = shownCard(area)
        return found && found.getAttribute('aria-label') === '第 ' + at + ' 题' ? found : undefined
      })
      seen.push({
        kind: card.dataset.kind,
        title: card.querySelector('.hitl-card-title').textContent,
        head: card.querySelector('.hitl-card-head').innerText,
        source: card.querySelector('.hitl-card-source').textContent,
      })
      if (at < 3) area.querySelector('button[aria-label="下一题"]').click()
    }
    const titles = seen.map(card => card.title).sort()
    const expected = ${JSON.stringify([ASK_TITLE, ASK_SECOND_TITLE, APPROVAL_ACTION].sort())}
    if (JSON.stringify(titles) !== JSON.stringify(expected)) throw new Error('the cards ask something else: ' + JSON.stringify(seen))
    if (seen.filter(card => card.kind === 'approval').length !== 1) throw new Error('not one approval card: ' + JSON.stringify(seen))
    if (!seen.every(card => card.source.endsWith(' · Ask'))) throw new Error('a card source does not name the tool: ' + JSON.stringify(seen))
    const hint = await wait('the waiting hint', () => document.querySelector('section[data-page=conversation] .hitl-wait-hint')?.textContent)
    if (!hint.includes('Agent 在等你回答 3 个问题')) throw new Error('the hint says ' + hint)
    const submit = area.querySelector('.hitl-area-submit')
    if (!submit.disabled) throw new Error('the submit is open before any answer')
    const missing = [...area.querySelectorAll('.hitl-area-foot button')].map(button => button.textContent.trim())
    if (!missing.includes('还差 3 题')) throw new Error('the foot says ' + JSON.stringify(missing))
    const badge = await wait('the count in the navigation', () => {
      const found = document.querySelector('.shell-nav-link[data-page=decisions] .shell-nav-badge')
      return found && found.textContent.trim() === '3' ? found : undefined
    })
    return { cards: seen, hint, badge: badge.textContent.trim() }`,
  )
  await step(
    '「待你决定」页按会话分组，是同一组卡',
    `
    document.querySelector('.shell-nav-link[data-page=decisions]').click()
    const page = await wait('the decisions page', () => document.querySelector('.hitl-decisions'))
    const groups = await wait('the group of this session', () => {
      const found = [...page.querySelectorAll('.hitl-group')]
      return found.length > 0 && marks(found[0]).length === 3 ? found : undefined
    })
    if (groups.length !== 1) throw new Error('the pool has ' + groups.length + ' groups')
    return { groups: groups.length, title: groups[0].querySelector('.hitl-group-title').innerText, marks: marks(groups[0]) }`,
  )
  await step(
    '左右切换、答齐、一次提交：三张卡都收起，两次 Ask 各自走完，这一轮接着走完',
    () => {
      phase = 'asked'
    },
    `
    document.querySelector('.shell-nav-link[data-page=conversation]').click()
    const area = await wait('the cards of this session', () => dock())
    const showing = () => shownCard(area)?.getAttribute('aria-label')
    const stage = area.querySelector('.hitl-area')
    const key = name => stage.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }))
    const first = showing()
    key('ArrowRight')
    await wait('the right arrow to move on', () => showing() !== first)
    key('ArrowLeft')
    await wait('the left arrow to come back', () => showing() === first)
    const steps = []
    for (let left = 3; left > 0; left -= 1) {
      const link = await wait('the link to the first unanswered', () =>
        [...area.querySelectorAll('.hitl-area-foot button')].find(button => button.textContent.trim() === '还差 ' + left + ' 题'))
      if (!area.querySelector('.hitl-area-submit').disabled) throw new Error('the submit is open with ' + left + ' left')
      link.click()
      await sleep(50)
      const card = shownCard(area)
      const title = card.querySelector('.hitl-card-title').textContent
      if (title === ${JSON.stringify(ASK_SECOND_TITLE)}) {
        fill(card.querySelector('textarea.hitl-card-words'), ${JSON.stringify(ASK_OWN_WORDS)})
      } else {
        const label = title === ${JSON.stringify(ASK_TITLE)} ? ${JSON.stringify(ASK_PICK)} : '同意'
        const choice = [...card.querySelectorAll('.hitl-card-choice')].find(item =>
          item.querySelector('.hitl-card-choice-label').textContent === label)
        choice.querySelector('[role=radio]').click()
      }
      await wait('the card counted as answered', () => marks(area).filter(mark => mark === 'answered').length === 4 - left)
      steps.push(title)
    }
    const submit = await wait('the submit button', () => {
      const found = area.querySelector('.hitl-area-submit')
      return found && !found.disabled ? found : undefined
    })
    submit.click()
    await wait('the cards gone from the conversation', () => dock() === null)
    await wait('the reply after the answers', () => transcript().includes(${JSON.stringify(AFTER_ASK)}))
    await wait('the run to settle', () => byText('button[type=submit]', '发送'))
    await wait('the count gone', () =>
      document.querySelector('.shell-nav-link[data-page=decisions] .shell-nav-badge').textContent.trim() === '')
    await press('.shell-nav-link', '待你决定')
    const page = await wait('the decisions page', () => document.querySelector('.hitl-decisions'))
    await wait('the pool empty', () => page.textContent.includes('现在没有要你决定的事'))
    await press('.shell-nav-link', '对话')
    return { answered: steps, transcript: transcript().slice(-160) }`,
  )
  phase = 'pool'
  await step(
    '另一轮在「待你决定」页里答：对话页的卡随之收起，会话自己接着走完',
    `
    fill(document.querySelector('textarea[aria-label="输入消息"]'), 'ask once more')
    await press('button[type=submit]', '发送')
    await wait('the card in the conversation', () => dock()?.querySelector('.hitl-card'))
    return 'asked'`,
    () => {
      phase = 'pooled'
    },
    `
    document.querySelector('.shell-nav-link[data-page=decisions]').click()
    const page = await wait('the decisions page', () => document.querySelector('.hitl-decisions'))
    const card = await wait('the card in the pool', () =>
      [...page.querySelectorAll('.hitl-card')].find(item => item.querySelector('.hitl-card-title').textContent === ${JSON.stringify(POOL_TITLE)}))
    const choice = [...card.querySelectorAll('.hitl-card-choice')].find(item =>
      item.querySelector('.hitl-card-choice-label').textContent === ${JSON.stringify(POOL_PICK)})
    choice.querySelector('[role=radio]').click()
    const submit = await wait('the submit in the pool', () => {
      const found = page.querySelector('.hitl-area-submit')
      return found && !found.disabled ? found : undefined
    })
    submit.click()
    await wait('the pool empty', () => page.textContent.includes('现在没有要你决定的事'))
    await press('.shell-nav-link', '对话')
    await wait('the reply after the answer', () => transcript().includes(${JSON.stringify(AFTER_POOL)}))
    if (dock() !== null) throw new Error('the conversation still shows the card')
    return transcript().slice(-160)`,
  )
}

const CATEGORIES = [
  ['model-provider', '模型供应商'],
  ['skill', '技能'],
  ['tool', '工具'],
]

/** A Skill made by the walk's own login outside the page, while the page is open. */
async function createSkill(session, name) {
  const client = protocol =>
    createClient(
      domainProtocols.find(item => item.name === protocol),
      session.transport,
    )
  const current = await client('identity')['query-current-tenant']({})
  const tenant = current.outcome === 'succeeded' ? current.body.tenantId : undefined
  if (tenant === undefined)
    throw new Error('query-current-tenant answered ' + JSON.stringify(current))
  const assets = client('assets')
  const bytes = new TextEncoder().encode(
    `---\nname: ${name}\ndescription: Made by the page walk.\n---\n\n# ${name}\n`,
  )
  const upload = `walk-${name}`
  const begun = await assets['begin-asset-upload']({
    tenant,
    operation: upload,
    category: 'skill',
    name,
    manifest: [{ path: 'SKILL.md', bytes: bytes.length }],
  })
  if (begun.outcome !== 'succeeded') throw new Error('begin-asset-upload answered ' + begun.outcome)
  const sent = await assets['append-asset-upload']({
    tenant,
    upload,
    path: 'SKILL.md',
    offset: 0,
    bytes,
  })
  if (sent.outcome !== 'succeeded') throw new Error('append-asset-upload answered ' + sent.outcome)
  const made = await assets['commit-asset-upload']({ tenant, upload })
  if (made.outcome !== 'succeeded') throw new Error('commit-asset-upload answered ' + made.outcome)
}

async function listCategories(session) {
  const assets = domainProtocols.find(protocol => protocol.name === 'assets')
  const answer = await createClient(assets, session.transport)['list-categories']({
    after: null,
    limit: 100,
  })
  const page = answer.outcome === 'succeeded' ? answer.body : undefined
  const listed = page?.items.map(item => [item.category, item.title])
  if (page?.next !== null || JSON.stringify(listed) !== JSON.stringify(CATEGORIES))
    throw new Error('list-categories answered ' + JSON.stringify(answer))
  print(`list-categories: ${JSON.stringify(listed)}`)
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
  const timed = {
    async call(request) {
      const started = Date.now()
      const report = await session.transport.call(request)
      const name = `${request.protocol.name}/v${request.protocol.major} ${request.operation}`
      hostLog.push(
        `${new Date().toISOString()} call ${name}: ${report.outcome ?? report.kind} in ${Date.now() - started} ms`,
      )
      return report
    },
    observe: request => session.transport.observe(request),
  }
  host = createWebHost({
    session: new Proxy(session, {
      get: (target, key) => (key === 'transport' ? timed : Reflect.get(target, key)),
    }),
    pageRoot: new URL('../dist/page/', import.meta.url).pathname,
    log: line => hostLog.push(`${new Date().toISOString()} ${line}`),
  })
  const hostPort = await host.listen(0)
  print(`host: http://127.0.0.1:${hostPort}/`)
  chrome = await startChrome(profile)
  browser = await devtools(chrome.port)
  await walk(browser, `http://127.0.0.1:${hostPort}/`, proofs, {
    createSkill: name => createSkill(session, name),
  })
  print(`walk: all steps passed; ${proofs.size} login proof(s) were searched for`)
  await listCategories(session)
  code = 0
} catch (failure) {
  print(`failed: ${failure instanceof Error ? failure.message : String(failure)}`)
  if (server !== undefined) writeFileSync(join(shots, 'server-stderr.log'), server.stderr())
  const errors = server?.stderr().slice(-2000) ?? ''
  if (errors !== '') print(`server stderr (tail):\n${errors}`)
  if (hostLog.length > 0) writeFileSync(join(shots, 'host.log'), `${hostLog.join('\n')}\n`)
  if (hostLog.length > 0)
    print(`host log (tail; all of it in host.log):\n${hostLog.slice(-30).join('\n')}`)
  const startup = server
    ?.stdout()
    .split('\n')
    .find(line => line.includes('"kind":"startup-result"'))
  if (startup !== undefined) print(`server startup: ${startup.slice(0, 600)}`)
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
