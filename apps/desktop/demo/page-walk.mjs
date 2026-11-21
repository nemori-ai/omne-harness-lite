import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
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
import { createForwarding } from '../dist/forwarding/app.js'
import { createForwardingRules, httpServer } from '../dist/forwarding/rules.js'
import { domainProtocols } from '../dist/shared/protocols.js'
import { createStandalone } from '../dist/standalone/server.js'

const USAGE = `usage: node apps/desktop/demo/page-walk.mjs [--shots <dir>]

Starts a server on a fresh state directory, the standalone forwarding process and a headless Chromium, then walks the page.
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
const THIRD_TITLE = 'Should the build cache under ./dist be kept?'
const THIRD_PICK = 'Keep it'
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
const THIRD_ARGUMENTS = JSON.stringify({
  command: 'ask',
  params: {
    questions: [
      {
        title: THIRD_TITLE,
        description: 'The cache holds a stale build of the page.',
        options: [
          { label: THIRD_PICK, description: 'Build on top of it.' },
          { label: 'Clear it', description: 'The next build takes longer.' },
        ],
      },
    ],
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
      ? [askCall(0, 'call_ask_walk', ASK_ARGUMENTS), askCall(1, 'call_third_walk', THIRD_ARGUMENTS)]
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
  // An icon button writes no words: it is found by its accessible name.
  const byName = (selector, name) =>
    [...document.querySelectorAll(selector)].find(element => element.getAttribute('aria-label') === name)
  const pressNamed = async (selector, name) => {
    const button = await wait('an enabled ' + name, () => {
      const found = byName(selector, name)
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
  const goHome = async () => (await wait('the home', () => document.querySelector('.shell-home'))).click()
  const openAppearance = async () => {
    const trigger = await wait('the appearance control', () => document.querySelector('[data-appearance]'))
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }))
    return await wait('the appearance menu', () => document.querySelector('[role=menu]'))
  }
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
  const sections = area => [...area.querySelectorAll('.hitl-section')]
  const sectionTitled = (area, title) => sections(area).find(item => item.querySelector('.hitl-title')?.textContent === title)
  const answered = section =>
    section.querySelector('[role=radio][aria-checked=true]') !== null
  const submitOf = area => [...area.querySelectorAll('.hitl-actions button')].find(button => button.textContent.trim().startsWith('提交'))
  const footLink = area => area.querySelector('.hitl-missing')?.textContent.trim()
  const answerRow = (section, label) => [...section.querySelectorAll('[role=radio]')].find(item => item.textContent.includes(label))
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
    const short = await wait('the account block', () => document.querySelector('.identity-account-short')?.textContent.trim())
    return { nav: nav(), sidebar: sidebar(), tenant: short }`,
  )
  await step(
    '没有会话时主区的一句',
    `
    return await wait('the empty line', () => document.querySelector('.omne-empty[data-empty="none"]')?.textContent.trim())`,
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
    await pressNamed('button[type=submit]', '发送')
    await wait('the reply', () => transcript().includes(${JSON.stringify(REPLY[0])}))
    return transcript().slice(-120)`,
  )
  await step(
    '再发一条，回复停在半路时停止这一轮',
    `
    fill(document.querySelector('textarea[aria-label="输入消息"]'), 'hold on')
    await pressNamed('button[type=submit]', '发送')
    await wait('the held run', () => transcript().includes(${JSON.stringify(REPLY[1].slice(0, 8))}) && document.querySelector('button[data-action=stop]'))
    await pressNamed('.omne-composer button', '停止')
    const confirm = await wait('the stop to settle', () => byName('.omne-composer button', '再确认停止') ?? byName('button[type=submit]', '发送'))
    if (confirm.getAttribute('aria-label') === '再确认停止') confirm.click()
    await wait('the send button back', () => byName('button[type=submit]', '发送'))
    return 'stopped'`,
  )
  releaseHeld()
  await step(
    '停止之后再发一条',
    `
    fill(document.querySelector('textarea[aria-label="输入消息"]'), 'once more')
    await pressNamed('button[type=submit]', '发送')
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
    listed.querySelector('.assets-item-title button[aria-expanded=false]')?.click()
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
  await step(
    '新建的这一份：列表里有它的简介；在详情里禁用、启用、移除',
    `
    const item = () => shownPanel().querySelector('li.assets-item[aria-label="walk-page"]')
    const button = text => [...(item()?.querySelectorAll('button') ?? [])].find(each => each.textContent.trim() === text && !each.disabled)
    const row = await wait('the row', item)
    if (!row.innerText.includes('Made in the page by the walk.')) throw new Error('the row shows no summary: ' + row.innerText)
    row.querySelector('button[aria-expanded="false"]')?.click()
    ;(await wait('a disable button', () => button('禁用'))).click()
    await wait('the row to read disabled', () => item()?.innerText.includes('已禁用'))
    ;(await wait('an enable button', () => button('启用'))).click()
    await wait('the row to read enabled', () => item()?.innerText.includes('已启用'))
    ;(await wait('a remove button', () => button('移除'))).click()
    ;(await wait('the confirmation', () => button('确认移除'))).click()
    await wait('the row to go', () => item() === null)
    return { summary: 'Made in the page by the walk.', disabled: true, enabled: true, removed: true }`,
  )
  await step(
    '同名再新建：选同一个目录提交，列表里又有它',
    `
    if (shownPanel().querySelector('form[aria-label="新建"]') === null) await press('button', '新建')
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
    const item = await wait('the row again', () => shownPanel().querySelector('li.assets-item[aria-label="walk-page"]'))
    await wait('the creation', () => form.innerText.includes('已新建 walk-page。'))
    return { again: item.getAttribute('aria-label'), facts: item.innerText.includes('已启用') }`,
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
      return groups.includes('日历与时区') && !groups.includes('agent 管理日程') ? section : undefined
    })
    const groups = [...page.querySelectorAll('section.assets-group')].map(group => group.getAttribute('aria-label'))
    const row = [...page.querySelectorAll('li.assets-setting')].find(item =>
      item.querySelector('.assets-setting-title').textContent === '时区')
    if (!row) throw new Error('no timezone on the settings page')
    const picks = [...page.querySelectorAll('li.assets-setting')].filter(item => item.querySelector('[role=radio]')).length
    if (picks < 1) throw new Error('the enum setting shows no choices: ' + picks)
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
    const menu = await openAppearance()
    const other = [...menu.querySelectorAll('[role=menuitemradio]')].find(item =>
      item.textContent.trim() === (before === 'dark' ? '浅色' : '深色'))
    if (!other) throw new Error('the appearance menu has no ' + (before === 'dark' ? '浅色' : '深色'))
    other.click()
    await wait('the other theme', () => document.documentElement.dataset.theme !== before)
    await wait('the menu to close', () => document.querySelector('[role=menu]') === null)
    return { before, after: document.documentElement.dataset.theme, stored: localStorage.getItem('omne.theme') }`,
  )
  await step(
    '「待你决定」页读得出',
    `
    await press('.shell-nav-link', '待你决定')
    const page = await wait('the decisions page', () => document.querySelector('.hitl-decisions'))
    const settled = await wait('the list to settle', () => {
      if ([...page.querySelectorAll('button')].some(button => button.textContent.trim() === '重试')) return 'failed'
      if (page.querySelector('.hitl-paper') !== null) return 'cards'
      return page.textContent.includes('待答的问题会在这里等你。') ? 'empty' : undefined
    })
    if (settled === 'failed') throw new Error('the pending decisions did not read: ' + page.innerText)
    return { state: settled, cards: page.querySelectorAll('.hitl-section').length }`,
  )
  await step(
    '切回对话，退出登录',
    `
    await goHome()
    const account = await wait('the account control', () => document.querySelector('.identity-account-control'))
    account.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }))
    const out = await wait('the account menu', () => [...document.querySelectorAll('[role=menu] [role=menuitem]')].find(item => item.textContent.trim() === '退出登录'))
    out.click()
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
    await pressNamed('button[type=submit]', '发送')
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
    '工具调用是一行过程行，展开后参数是人读的名与值',
    `
    fill(document.querySelector('textarea[aria-label="输入消息"]'), 'run the tool')
    await pressNamed('button[type=submit]', '发送')
    const live = () => [...document.querySelectorAll('section[data-page=conversation] .omne-process')].find(item => item.querySelector('code.omne-process-name')?.textContent === 'Shell')
    await wait('the tool call line', live)
    await wait('the run to settle', () => transcript().includes('done') && byName('button[type=submit]', '发送'))
    const trigger = await wait('the line trigger', () => live().querySelector('button[aria-expanded]'))
    if (trigger.getAttribute('aria-expanded') === 'false') trigger.click()
    await wait('the line open', () => live().querySelector('button[aria-expanded=true]'))
    const line = live()
    const list = await wait('the visible arguments list', () => {
      const found = line.querySelector('dl[aria-label="参数"]')
      return found && found.innerText.includes('echo walk-args') ? found : undefined
    })
    const rows = Object.fromEntries([...list.querySelectorAll('.fact-list-row')].map(row => [row.querySelector('dt').textContent, row.querySelector('dd')]))
    for (const name of ['command', 'params'])
      if (!(name in rows)) throw new Error('the arguments do not name ' + name + ': ' + JSON.stringify(Object.keys(rows)))
    if (rows.command.textContent !== 'execute') throw new Error('a plain value is not shown as itself: ' + rows.command.textContent)
    const nested = rows.params.querySelector('[data-nested]')
    if (!nested || nested.textContent.includes('\\n') || !nested.textContent.includes('echo walk-args')) throw new Error('a nested value is not one summary line: ' + rows.params.innerHTML)
    if (line.querySelector('pre:not(.code-surface pre)')) throw new Error('the line shows a bare pre')
    return { names: Object.keys(rows), params: nested.textContent }`,
  )
  await step(
    '过程行展开之后才送达的滚动事件，不让转写区停止跟随',
    `
    const scroller = document.querySelector('section[data-page=conversation] .omne-conversation')
    const gap = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
    const before = gap()
    if (before <= 32) throw new Error('the open line does not push the end out of view, so this step cannot tell: gap ' + before)
    scroller.dispatchEvent(new Event('scroll'))
    fill(document.querySelector('textarea[aria-label="输入消息"]'), 'one more message')
    await pressNamed('button[type=submit]', '发送')
    await wait('the message in the transcript', () => transcript().includes('one more message'))
    await wait('the reply to the message', () =>
      transcript().split('one more message').at(-1).includes('done') && byName('button[type=submit]', '发送'))
    await wait('the end of the transcript in view', () => gap() <= 32)
    return { before, after: gap() }`,
  )
  phase = 'ask'
  await step(
    '一轮里并行的两次 Ask：对话页的一张纸上叠着三节问询，纸底的链接与导航上的张数',
    `
    // The row of this session is selected only while its conversation shows; remember which row it is.
    window.walkAskRow = document.querySelector('.omne-session-item[aria-current=true] .omne-session-item-title')?.textContent
    if (!window.walkAskRow) throw new Error('no session row is selected while the conversation shows')
    fill(document.querySelector('textarea[aria-label="输入消息"]'), 'ask me')
    await pressNamed('button[type=submit]', '发送')
    const area = await wait('the cards of this session', () => dock())
    await wait('three sections on one sheet', () => sections(area).length === 3 && area.querySelectorAll('.hitl-paper').length === 1)
    const seen = sections(area).map(section => ({
      kind: section.dataset.kind,
      title: section.querySelector('.hitl-title').textContent,
      head: section.querySelector('.hitl-kind').innerText,
      who: section.querySelector('.hitl-who').textContent,
    }))
    const titles = seen.map(card => card.title).sort()
    const expected = ${JSON.stringify([ASK_TITLE, ASK_SECOND_TITLE, THIRD_TITLE].sort())}
    if (JSON.stringify(titles) !== JSON.stringify(expected)) throw new Error('the cards ask something else: ' + JSON.stringify(seen))
    if (!seen.every(card => card.kind === 'question')) throw new Error('a card is not a question: ' + JSON.stringify(seen))
    if (!seen.every(card => card.head.startsWith('需要你回答'))) throw new Error('a kind line does not say whose move it is: ' + JSON.stringify(seen))
    if (area.querySelector('[role=tablist], button[aria-label="下一题"]')) throw new Error('the sheet still pages its questions')
    if (!submitOf(area).disabled) throw new Error('the submit is open before any answer')
    if (footLink(area) !== '还差 3 题') throw new Error('the foot says ' + footLink(area))
    const badge = await wait('the count in the navigation', () => {
      const found = document.querySelector('.shell-nav-link[data-page=decisions] .shell-nav-badge')
      return found && found.textContent.trim() === '3' ? found : undefined
    })
    return { cards: seen, badge: badge.textContent.trim() }`,
  )
  await step(
    '「待你决定」页按会话分组，是同一组卡',
    `
    document.querySelector('.shell-nav-link[data-page=decisions]').click()
    const page = await wait('the decisions page', () => document.querySelector('.hitl-decisions'))
    const groups = await wait('the group of this session', () => {
      const found = [...page.querySelectorAll('.hitl-group')]
      return found.length > 0 && sections(found[0]).length === 3 ? found : undefined
    })
    if (groups.length !== 1) throw new Error('the pool has ' + groups.length + ' groups')
    return { groups: groups.length, title: groups[0].querySelector('.hitl-group-title').innerText, sections: sections(groups[0]).length }`,
  )
  await step(
    '照纸底的链接逐节答齐、一次提交：纸收走，两次 Ask 各自走完，这一轮接着走完',
    () => {
      phase = 'asked'
    },
    `
    const shown = id => document.querySelector('section[data-page=' + id + ']')?.hidden === false
    await goHome()
    await wait('the home to go to the decisions page while answers wait', () => shown('decisions'))
    if (document.querySelector('.omne-session-item[aria-current=true]')) throw new Error('a session row stays selected while the decisions page shows')
    ;(await wait('the asking session in the list', () => [...document.querySelectorAll('.omne-session-item')].find(row => row.querySelector('.omne-session-item-title')?.textContent === window.walkAskRow))).click()
    await wait('its row selected again', () => document.querySelector('.omne-session-item[aria-current=true] .omne-session-item-title')?.textContent === window.walkAskRow)
    await wait('the conversation page', () => shown('conversation'))
    const area = await wait('the cards of this session', () => dock())
    const steps = []
    for (let left = 3; left > 0; left -= 1) {
      await wait('the link to the first unanswered', () => footLink(area) === '还差 ' + left + ' 题')
      if (!submitOf(area).disabled) throw new Error('the submit is open with ' + left + ' left')
      area.querySelector('.hitl-missing').click()
      await sleep(50)
      const section = document.activeElement?.closest('.hitl-section')
      if (!section) throw new Error('the link did not bring focus to an unanswered section')
      const title = section.querySelector('.hitl-title').textContent
      if (title === ${JSON.stringify(ASK_SECOND_TITLE)}) {
        answerRow(section, '用自己的话回答').click()
        const field = await wait('the field under 用自己的话回答', () => section.querySelector('.hitl-field textarea'))
        fill(field, ${JSON.stringify(ASK_OWN_WORDS)})
      } else {
        const label = title === ${JSON.stringify(ASK_TITLE)} ? ${JSON.stringify(ASK_PICK)} : ${JSON.stringify(THIRD_PICK)}
        answerRow(section, label).click()
      }
      await wait('the section counted as answered', () => sections(area).filter(answered).length === 4 - left)
      steps.push(title)
    }
    const submit = await wait('the submit button', () => {
      const found = submitOf(area)
      return found && !found.disabled ? found : undefined
    })
    submit.click()
    await wait('the cards gone from the conversation', () => dock() === null)
    await wait('the reply after the answers', () => transcript().includes(${JSON.stringify(AFTER_ASK)}))
    await wait('the run to settle', () => byName('button[type=submit]', '发送'))
    await wait('the count gone', () =>
      document.querySelector('.shell-nav-link[data-page=decisions] .shell-nav-badge').textContent.trim() === '')
    await press('.shell-nav-link', '待你决定')
    const page = await wait('the decisions page', () => document.querySelector('.hitl-decisions'))
    await wait('the pool empty', () => page.textContent.includes('待答的问题会在这里等你。'))
    await goHome()
    await wait('the home to go to the conversation once nothing waits', () => shown('conversation'))
    return { answered: steps, transcript: transcript().slice(-160) }`,
  )
  phase = 'pool'
  await step(
    '另一轮在「待你决定」页里答：对话页的卡随之收起，会话自己接着走完',
    `
    fill(document.querySelector('textarea[aria-label="输入消息"]'), 'ask once more')
    await pressNamed('button[type=submit]', '发送')
    await wait('the card in the conversation', () => dock()?.querySelector('.hitl-section'))
    return 'asked'`,
    () => {
      phase = 'pooled'
    },
    `
    document.querySelector('.shell-nav-link[data-page=decisions]').click()
    const page = await wait('the decisions page', () => document.querySelector('.hitl-decisions'))
    const card = await wait('the card in the pool', () => sectionTitled(page, ${JSON.stringify(POOL_TITLE)}))
    answerRow(card, ${JSON.stringify(POOL_PICK)}).click()
    const submit = await wait('the submit in the pool', () => {
      const found = submitOf(page)
      return found && !found.disabled ? found : undefined
    })
    submit.click()
    await wait('the pool empty', () => page.textContent.includes('待答的问题会在这里等你。'))
    await goHome()
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
  const inner = createForwardingRules({
    connect: httpServer(`http://127.0.0.1:${port}`),
    contracts: [accessProtocol, ...domainProtocols],
  })
  // The forwarding layer keeps no login; the walk keeps the last one the page got, to search the
  // page for its proof and to act as the same login outside the page.
  let lastLogin
  const rules = {
    ...inner,
    async login(credentials) {
      const answer = await inner.login(credentials)
      if (answer.result === 'signed-in') {
        lastLogin = answer.login
        proofs.add(answer.login.proof)
      }
      return answer
    },
    async call(request, login) {
      const started = Date.now()
      const report = await inner.call(request, login)
      const name = `${request.protocol.name}/v${request.protocol.major} ${request.operation}`
      hostLog.push(
        `${new Date().toISOString()} call ${name}: ${report.outcome ?? report.kind} in ${Date.now() - started} ms`,
      )
      return report
    },
  }
  const session = {
    transport: {
      call: request => inner.call(request, lastLogin),
      observe: request => inner.observe(request, lastLogin),
    },
  }
  const pageRoot = new URL('../dist/page/', import.meta.url).pathname
  const log = line => hostLog.push(`${new Date().toISOString()} ${line}`)
  host = createStandalone({
    forwarding: createForwarding({
      rules,
      readPageFile: segments =>
        readFile(join(pageRoot, ...segments)).then(
          content => new Uint8Array(content),
          () => undefined,
        ),
      log,
    }),
    log,
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
