import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { setTimeout as pause } from 'node:timers/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { build } from 'vite'
import { createClient } from '@omne-harness/sdk/core'
import { domainProtocols } from '../dist/shared/protocols.js'
import {
  devtools,
  evaluate,
  record,
  screenshot,
  startChrome,
  startStack,
  stopChrome,
} from './walk-support.mjs'
import { SERIES } from './visual-series.mjs'
import { raisedEdges } from '../tests/support/raised-edges.ts'

const USAGE = `usage: node apps/desktop/demo/visual-walk.mjs [options]

The acceptance walk of the page's look: a server on a fresh state directory with a scripted model, the standalone
forwarding process and a headless Chromium; it seeds the acceptance data, then shoots every scene in every theme,
window and size asked for, named <scene>-<theme>-<width>[-<size>].png. A scene that means something only in some
windows says which; in the others it prints SKIP <scene> <width>. Each shot prints how far the page scrolls
sideways; the specimen scene prints the page policy violations it saw. After every shot the walk checks that no
raised control is cut, with its shadow and ring room, by an ancestor that clips it (FE-I37). The candidates are the
shown elements with data-control, and besides them a segmented control's track and its raised segment (the thumb,
which has no data-control); a candidate is raised when a border, an inset line or an outer shadow draws.
raised-edges.json in the shots folder lists, per shot, the cuts and every raised control with its box, the last line
of the log counts the cuts, and any cut fails the walk. The scenes that end the login (A2-expired) or stop the walk's
own server (A7-disconnected) run after the other signed-in scenes, the server one last. Two scenes start their own
conversation: B2-working, where the scripted model holds its reply halfway until the scene ends, and B9-background,
whose call runs in the background until the walk's server stops.

  --shots <dir>        where the pictures go (a fresh temporary folder by default)
  --scenes <a,b>       only these scenes (by id); --list prints them, ※ marks the ones the acceptance asks
                       to see in every size
  --themes <a,b>       light,dark (default both)
  --widths <a,b>       1440x900,1100x760,720x480 (default 1440x900,1100x760)
  --sizes <a,b>        medium,small,large,reading: the sizes besides medium, for every scene (default none)
  --scale <n>          device pixels per CSS pixel (default 1)
  --series <a,b>       record these frame series instead of the scenes, once per theme (--list prints them);
                       the ink series each run on a fresh specimen page, the app series in the app, signed in
  --reduced            emulate prefers-reduced-motion: reduce for everything shot or recorded

Needs \`pnpm run build\` in apps/desktop and apps/harness-server first. The specimen page (demo/specimen/) is built
with vite into a temporary folder for the walk and served under /specimen/; it never goes into dist/page. Chromium:
OMNE_WALK_CHROME, a Playwright chrome-headless-shell, or Google Chrome on macOS, always on a fresh profile.`

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const at = args.indexOf(name)
  return at < 0 ? fallback : args[at + 1]
}
const list = (name, fallback) =>
  option(name, fallback)
    .split(',')
    .map(item => item.trim())
    .filter(item => item !== '')
if (args.includes('--help')) {
  process.stdout.write(`${USAGE}\n`)
  process.exit(0)
}

const print = line => process.stdout.write(`${line}\n`)
const shots = resolve(option('--shots', mkdtempSync(join(tmpdir(), 'visual-walk-'))))
const themes = list('--themes', 'light,dark')
const windowOf = text => {
  const [width, height = 900] = text.split('x').map(Number)
  return { name: String(width), width, height }
}
const widths = list('--widths', '1440x900,1100x760').map(windowOf)
const sizes = list('--sizes', '')
const scale = Number(option('--scale', '1'))
const reduced = args.includes('--reduced')
const ACCOUNT = { loginIdentifier: 'visual', credential: 'visual-walk-pw-3b81' }
/** The window every scene's way in runs at: the sidebar's links are there only from 768 up. */
const WAY_IN = windowOf('1440x900')
/** How long a scene stays still after its animations ended, before the shot. */
const SETTLE_MS = 600
/**
 * The ink a journey leaves on the seat it left dries on the ink's own clock (ui-kit `WRITE.leftDry`, 2200 ms), which
 * `document.getAnimations()` does not see: after a step that can send the figure on a journey, wait it out.
 */
const INK_DRY_MS = 2400
/** What the strong notification of the told note says: the reference's sentence (07-told-home), so the two compare. */
const TOLD_TITLE = '时间到了：该给阳台的花浇水啦。'

const REPLY_MARKDOWN = [
  '## 这一轮做了什么',
  '',
  '读了三份文件，改了一处配置。要点：',
  '',
  '- 端口从 `8080` 换成 `8081`，因为 8080 被占用；',
  '- 缓存目录保留，下一次构建会快一些；',
  '- 没有动别的设置。',
  '',
  '| 项 | 之前 | 之后 |',
  '| --- | --- | --- |',
  '| 端口 | 8080 | 8081 |',
  '| 缓存 | 清除 | 保留 |',
  '',
  '```sh',
  'pnpm run dev -- --port 8081',
  '```',
].join('\n')
const ASK = JSON.stringify({
  command: 'ask',
  params: {
    questions: [
      {
        title: '开发服务器用哪个端口？',
        description: '8080 被本机另一个进程占用。',
        options: [
          { label: '8081（推荐）', description: '下一个空闲的端口。' },
          { label: '3000', description: '框架的缺省端口。' },
        ],
      },
      {
        title: '新分支叫什么？',
        description: '分支放资产页的改动。',
        options: [
          { label: 'feature/assets', description: '按功能命名。' },
          { label: 'wip', description: '一个临时的短名字。' },
        ],
      },
    ],
  },
})
const ASK_THIRD = JSON.stringify({
  command: 'ask',
  params: {
    questions: [
      {
        title: './dist 下的构建缓存要留着吗？',
        description: '缓存里是页面的一份旧构建。',
        options: [
          { label: '留着', description: '在它上面接着构建。' },
          { label: '清掉', description: '下一次构建会慢一些。' },
        ],
      },
    ],
  },
})
const SHELL = JSON.stringify({
  command: 'execute',
  intent: '看看走查的命令能不能跑',
  params: { script: 'echo visual-walk' },
})
/** A one-shot command whose result has some fifty lines (B4-tool-long). */
const LONG_SHELL = JSON.stringify({
  command: 'execute',
  intent: '跑一遍构建，看每个包的结果',
  params: {
    script:
      "i=1; while [ $i -le 48 ]; do printf 'build %02d/48  packages/module-%02d  ok  %d ms\\n' $i $i $((i * 37 % 400 + 120)); i=$((i + 1)); done",
  },
})
/**
 * A command the model runs in the background (B9-background): three lines of output, then it waits. It runs until the
 * walk's server stops, which closes its retention scope and stops it.
 */
const BACKGROUND_INTENT = '看着页面的构建，改了就重建'
const BACKGROUND_SHELL = JSON.stringify({
  command: 'execute',
  intent: BACKGROUND_INTENT,
  params: {
    script:
      "printf 'watching src/ for changes\\nbuilt the page in 812 ms\\nwaiting for the next change\\n'; sleep 900",
    run_in_background: true,
  },
})
/** The reply of the working turn (B2-working): the head comes at once, the tail when the scene lets it go. */
const SLOW_HEAD = [
  '## 迁移说明\n\n',
  '这一次把配置从 `config.json` 搬到 `settings.toml`，分三步做：\n\n',
  '1. 先读出旧文件里的每一项；\n',
]
const SLOW_TAIL = ['2. 再按新的名字写进新文件；\n', '3. 最后核对一遍，删掉旧文件。\n']
/** What the person says to the conversations of the B scenes; the scripted model knows each by its whole sentence. */
const REST_ASK = '把开发服务器换到一个空闲的端口'
const LONG_ASK = '跑一遍构建，把每个包的结果列出来'
const SLOW_ASK = '慢慢写一份迁移说明'
const BACKGROUND_ASK = '把页面的构建放到后台盯着'
/** The releases of the replies held halfway, until the scene that asked for one leaves. */
const held = []
const releaseHeld = () => {
  for (const release of held.splice(0)) release()
}

const sse = events => events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
const piece = (body, content) => ({
  model: JSON.parse(body).model ?? 'm',
  provider: 'OpenAI',
  choices: [{ delta: { content } }],
})
const STOP = { choices: [{ delta: {}, finish_reason: 'stop' }] }
const final = (body, content) => `${sse([piece(body, content), STOP])}data: [DONE]\n\n`
const calls = (body, list) =>
  `${sse([
    { ...piece(body, undefined), choices: [{ delta: { tool_calls: list } }] },
    { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
  ])}data: [DONE]\n\n`
const call = (index, id, name, argumentsText) => ({
  index,
  id,
  type: 'function',
  function: { name, arguments: argumentsText },
})

/** Streams the head of a reply and holds the rest until `releaseHeld`: the gateway writes `rest` after `after`. */
function halfway(body) {
  const { promise, resolve } = Promise.withResolvers()
  held.push(resolve)
  return {
    body: sse(SLOW_HEAD.map(text => piece(body, text))),
    rest: {
      after: promise,
      body: `${sse([...SLOW_TAIL.map(text => piece(body, text)), STOP])}data: [DONE]\n\n`,
    },
  }
}

function afterTool(said) {
  if (said.includes(LONG_ASK)) return '构建跑完了：48 个包都通过。'
  if (said.includes(BACKGROUND_ASK)) return '构建在后台跑着，跑完了我再告诉你。'
  return '命令跑完了，输出是 visual-walk。'
}

function answer({ body }) {
  const request = JSON.parse(body)
  const messages = request.messages ?? []
  const last = messages.at(-1)
  const said = JSON.stringify(messages.filter(message => message.role === 'user').at(-1) ?? {})
  const reply = { status: 200, contentType: 'text/event-stream' }
  if (said.includes('失败'))
    return {
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'the input is rejected', code: 400 } }),
    }
  if (said.includes(SLOW_ASK)) return { ...reply, ...halfway(body) }
  if (last?.role === 'tool') return { ...reply, body: final(body, afterTool(said)) }
  if (said.includes(LONG_ASK))
    return { ...reply, body: calls(body, [call(0, 'call_shell_long', 'Shell', LONG_SHELL)]) }
  if (said.includes(BACKGROUND_ASK))
    return {
      ...reply,
      body: calls(body, [call(0, 'call_shell_background', 'Shell', BACKGROUND_SHELL)]),
    }
  if (said.includes('工具'))
    return { ...reply, body: calls(body, [call(0, 'call_shell_visual', 'Shell', SHELL)]) }
  if (said.includes('问我'))
    return {
      ...reply,
      body: calls(body, [
        call(0, 'call_ask_visual', 'Ask', ASK),
        call(1, 'call_ask_third', 'Ask', ASK_THIRD),
      ]),
    }
  return { ...reply, body: final(body, REPLY_MARKDOWN) }
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
  // The element whose text is \`text\`, or whose accessible name is when it draws only a glyph (an icon button).
  const byText = (selector, text) =>
    [...document.querySelectorAll(selector)].find(element =>
      element.textContent.trim() === text || element.getAttribute('aria-label') === text)
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
  const transcript = () => document.querySelector('section[data-page=conversation]')?.innerText ?? ''
  const conversation = () => document.querySelector('section[data-page=conversation]:not([hidden])')
  const say = async (text, until) => {
    fill(await wait('the composer', () => document.querySelector('textarea[aria-label="输入消息"]')), text)
    await press('button[type=submit]', '发送')
    await wait(until, () => transcript().includes(until))
  }
  const fresh = async () => {
    await press('button', '新建会话')
    await wait('the composer', () => document.querySelector('textarea[aria-label="输入消息"]'))
  }
  const openSession = async title => {
    const row = await wait('the session ' + title, () =>
      [...document.querySelectorAll('.omne-session-item')].find(item => item.textContent.includes(title)))
    row.click()
    await sleep(300)
  }
  const goTo = async title => {
    const link = await wait('the page ' + title, () =>
      [...document.querySelectorAll('.shell-nav-link, [data-nav-page]')].find(item => item.textContent.trim().startsWith(title)))
    link.click()
    await sleep(300)
  }
  const signIn = async (mode, account) => {
    await wait('the login gate', () => document.querySelector('input[name=loginIdentifier]'))
    await press('button', mode)
    fill(document.querySelector('input[name=loginIdentifier]'), account.loginIdentifier)
    fill(document.querySelector('input[name=credential]'), account.credential)
    await press('button[type=submit]', mode === '第一次使用' ? '注册并登录' : '登录')
    await wait('the sidebar', () => document.querySelector('.shell-sidebar'))
  }
  const shown = element => element !== null && element !== undefined && element.getClientRects().length > 0
  const centre = element => {
    const box = element.getBoundingClientRect()
    return [box.left + box.width / 2, box.top + box.height / 2]
  }
  /** The seat the figure sits on: the shown seat nearest its centre, once it has stopped flying. */
  const seatOf = () => {
    const body = document.querySelector('.omne-figure-carried')
    if (!body || body.dataset.phase !== 'seated') return undefined
    const [x, y] = centre(body)
    let nearest
    for (const seat of document.querySelectorAll('[data-figure-seat]')) {
      if (!shown(seat)) continue
      const [left, top] = centre(seat)
      const away = Math.hypot(left - x, top - y)
      if (nearest === undefined || away < nearest.away) nearest = { name: seat.dataset.figureSeat, away }
    }
    return nearest?.name
  }
  /** The running animations that end: not the looping marks, not the ones a scroll drives (the code edges). */
  const ending = () => document.getAnimations().filter(animation =>
    animation.playState === 'running' && animation.timeline === document.timeline &&
    animation.effect?.getTiming().iterations !== Infinity)
  /** Every animation that ends has ended, then a still moment. */
  const settle = async () => {
    try {
      await wait('the animations to end', () => ending().length === 0)
    } catch (failure) {
      const names = ending().map(animation =>
        (animation.animationName ?? animation.transitionProperty ?? animation.id ?? '?') + ' on ' +
        (animation.effect?.target?.className || animation.effect?.target?.tagName))
      throw new Error(failure.message + ': ' + names.join('; '))
    }
    await sleep(${SETTLE_MS})
  }
  const seated = async name => {
    await wait('the figure seated at ' + name, () => seatOf() === name)
    await settle()
  }
  const narrow = () => !window.matchMedia('(min-width: 768px)').matches
  /** Still, with the figure on the seat this screen gives it: the gate, the conversation's header or home. */
  const rest = async () => {
    if (document.querySelector('input[name=loginIdentifier]')) return await seated('gate')
    if (document.querySelector('section[data-page=conversation]:not([hidden])')) return await seated('header')
    if (narrow() && document.querySelector('.shell-sheet') === null) return await settle()
    await seated('home')
  }
  const escape = target => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  const openDrawer = async () => {
    if (document.querySelector('.shell-sheet') === null)
      (await wait('the menu button', () => document.querySelector('.shell-menu'))).click()
    await wait('the drawer', () => document.querySelector('.shell-sheet[data-state=open]'))
    await seated('home')
  }
  const closeDrawer = async () => {
    const sheet = document.querySelector('.shell-sheet')
    if (sheet === null) return
    escape(sheet)
    await wait('the drawer to close', () => document.querySelector('.shell-sheet') === null)
  }
  const openAppearance = async () => {
    if (narrow()) await openDrawer()
    const within = document.querySelector('.shell-sheet') ?? document.querySelector('.shell-sidebar')
    const trigger = await wait('the appearance control', () => within.querySelector('[data-appearance]'))
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }))
    await wait('the appearance menu', () => document.querySelector('[role=menu][data-state=open]'))
    await settle()
  }
  const closeMenu = async () => {
    const menu = document.querySelector('[role=menu]')
    if (menu === null) return
    escape(menu)
    await wait('the menu to close', () => document.querySelector('[role=menu]') === null)
  }
  const fold = async width => {
    const sidebar = await wait('the sidebar', () => document.querySelector('.shell-sidebar'))
    if (sidebar.dataset.width !== width) sidebar.querySelector('.shell-fold').click()
    const labels = width === 'rail' ? 'hidden' : 'shown'
    await wait('the sidebar ' + width, () => sidebar.dataset.width === width && sidebar.dataset.labels === labels)
    await settle()
  }
  const sideControl = () =>
    document.querySelector('section[data-page=conversation]:not([hidden]) button.omne-session-figure')
  const bubble = () => document.querySelector('.omne-session-side[data-presentation=bubble]')
  /** Where the page is wide enough at this size (1160 × the size factor), the side content docks instead. */
  const docked = () => document.querySelector(
    'section[data-page=conversation]:not([hidden]) .omne-session-side[data-presentation=docked][data-open=true]')
  const openSide = async () => {
    const control = await wait('the figure and name in the header as a control', sideControl)
    if (control.getAttribute('aria-expanded') !== 'true') control.click()
    await wait('the light ink bubble written, or the side docked at this size',
      () => bubble()?.dataset.ink === 'open' || docked() !== null)
    await settle()
  }
  const closeSide = async () => {
    const control = sideControl()
    if (control?.getAttribute('aria-expanded') === 'true') control.click()
    await wait('the bubble folded away and the side undocked', () => bubble() === null && docked() === null)
  }
  const reconnecting = () => [...document.querySelectorAll('.shell-reconnecting')].find(shown)
`

const run = (browser, body) => evaluate(browser, `(async () => { ${HELPERS}\n${body} })()`)

async function seed(browser) {
  await run(
    browser,
    `
    await signIn('第一次使用', ${JSON.stringify(ACCOUNT)})
    await fresh()
    await say('请总结一下这一轮做了什么', '这一轮做了什么')
    await say('请调用工具跑一下命令', '命令跑完了')
    await say('这一句会失败', '这一轮失败了')
    await fresh()
    await say('有几件事要问我', 'Agent 在问你')
    await fresh()
    await say(${JSON.stringify(REST_ASK)}, '没有动别的设置')
    await fresh()
    await say(${JSON.stringify(LONG_ASK)}, '构建跑完了')
    await fresh()
    return 'seeded'`,
  )
}

async function signInAgain(browser) {
  await apply(browser, { theme: themes[0], width: WAY_IN, size: 'medium' })
  await run(browser, `await signIn('登录', ${JSON.stringify(ACCOUNT)})`)
}

const client = (stack, name) =>
  createClient(
    domainProtocols.find(protocol => protocol.name === name),
    stack.transport,
  )

async function tenantOf(stack) {
  const current = await client(stack, 'identity')['query-current-tenant']({})
  if (current.outcome !== 'succeeded')
    throw new Error(`query-current-tenant answered ${JSON.stringify(current)}`)
  return current.body.tenantId
}

/** The login ends on the server, as when it is revoked elsewhere: every valid login of the account. */
async function revokeLogins(stack) {
  const identity = client(stack, 'identity')
  const valid = await identity['query-own-valid-logins']({})
  if (valid.outcome !== 'succeeded')
    throw new Error(`query-own-valid-logins answered ${JSON.stringify(valid)}`)
  for (const { loginId } of valid.body.logins) {
    const revoked = await identity['revoke-login']({ targetLoginId: loginId })
    if (revoked.outcome !== 'succeeded' && revoked.outcome !== 'no-change')
      throw new Error(`revoke-login answered ${JSON.stringify(revoked)}`)
  }
  print(`revoked ${valid.body.logins.length} login(s) on the server`)
}

let told = 0
/** The owner writes one to themselves (source owner.posts, type post): strong for the person by default. */
async function tellStrong(stack) {
  told += 1
  const sent = await client(stack, 'notification').send({
    tenant: await tenantOf(stack),
    source: 'owner.posts',
    event: `visual-walk-told-${told}`,
    type: 'post',
    subject: null,
    title: TOLD_TITLE,
    body: '',
    locator: null,
    replaceKey: null,
    renotify: false,
    named: [],
  })
  if (sent.outcome !== 'succeeded')
    throw new Error(`notification send answered ${JSON.stringify(sent)}`)
  print(`sent strong notification ${told}`)
}

const ON_ASSETS = `await goTo('资产'); await seated('home')`
const WIDE_ONLY = ['1440', '1100']

/**
 * A scene: `act` brings the app there once, at the way-in window; `each` brings what does not outlast a change of
 * window, theme or size again before every shot (by default: still, with the figure seated); `leave` puts the app
 * back for the next scene. A step is a script run in the page with the helpers above, or a function of the walk
 * run outside the page. `widths` names the windows the scene means something in; `breaks` says it ends the login
 * or stops the server, so it runs after the others.
 */
/** The side open on 「后台」, its call unfolded with output: B9 and the tooltip of the call's stop. */
const ON_BACKGROUND = `
      if (bubble() !== null) await closeSide()
      await rest()
      await openSide()
      const side = conversation().querySelector('.omne-session-side')
      const tab = await wait('the side’s 后台 tab', () =>
        [...side.querySelectorAll('[data-segment]')].find(item => item.textContent.trim().startsWith('后台')))
      if (tab.getAttribute('aria-pressed') !== 'true') tab.click()
      const intent = ${JSON.stringify(BACKGROUND_INTENT)}
      await wait('the background call', () => side.innerText.includes(intent))
      // Unfold the call where its line folds; a pane that shows every call unfolded has nothing to press.
      const line = [...side.querySelectorAll('[aria-expanded]')].find(item => item.textContent.includes(intent))
      if (line !== undefined && line.getAttribute('aria-expanded') !== 'true') line.click()
      await wait('the call’s output', () => side.innerText.includes('waiting for the next change'))
      await settle()`

const pointerAt = (x, y) => walk =>
  walk.browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
const shiftKey = type => walk =>
  walk.browser.send('Input.dispatchKeyEvent', {
    type,
    key: 'Shift',
    code: 'ShiftLeft',
    windowsVirtualKeyCode: 16,
  })

/** An icon button's name shows on a pointer resting on it and on keyboard focus (A1); `find` is in-page code. */
function tipScenes(id, title, { act, ready = 'await rest()', find, leave = [] }) {
  const target = `await wait('the icon button', () => ${find})`
  const tooltip = `await wait('the tooltip', () => document.querySelector('[role=tooltip]'))\n await settle()`
  const away = [pointerAt(1, 1), 'document.activeElement?.blur()']
  return [
    {
      id: `${id}-hover`,
      title: `${title}：指针停在上面`,
      widths: ['1440'],
      act,
      each: [
        ...away,
        `${ready}\n ;(${target}).scrollIntoView({ block: 'nearest' })\n await settle()`,
        async walk => {
          const at = await run(
            walk.browser,
            `const box = (${target}).getBoundingClientRect()\n return { x: box.x + box.width / 2, y: box.y + box.height / 2 }`,
          )
          await pointerAt(at.x, at.y)(walk)
        },
        tooltip,
      ],
      leave: [...away, ...[leave].flat()],
    },
    {
      id: `${id}-focus`,
      title: `${title}：键盘聚焦`,
      widths: ['1440'],
      act,
      each: [
        ...away,
        ready,
        shiftKey('keyDown'),
        shiftKey('keyUp'),
        `;(${target}).focus()\n ${tooltip}`,
      ],
      leave: [...away, ...[leave].flat()],
    },
  ]
}

const SCENES = [
  {
    id: 'A1-gate',
    title: '冷启动到登录门',
    before: true,
    tiers: true,
    act: `await wait('the login gate', () => document.querySelector('input[name=loginIdentifier]'))`,
  },
  {
    id: 'A2-login-failed',
    title: '登录失败：表单下的一句行内通知',
    before: true,
    act: `
      await wait('the login gate', () => document.querySelector('input[name=loginIdentifier]'))
      await press('button', '登录')
      fill(document.querySelector('input[name=loginIdentifier]'), ${JSON.stringify(ACCOUNT.loginIdentifier)})
      fill(document.querySelector('input[name=credential]'), 'not-the-password')
      await press('button[type=submit]', '登录')
      await wait('the failure under the form', () =>
        document.querySelector('.shell-gate-card [role=alert]')?.textContent.includes('登录名或密码不对'))`,
  },
  {
    id: 'A2-expired',
    title: '登录失效后回到门：门上的形写出原因',
    breaks: 'login',
    act: [
      ON_ASSETS,
      walk => revokeLogins(walk.stack),
      `
      if (document.querySelector('.shell-sidebar') !== null) await goTo('通知')
      await wait('the login gate', () => document.querySelector('input[name=loginIdentifier]'))`,
    ],
    each: `
      await rest()
      await wait('the reason written by the figure', () =>
        document.querySelector('.shell-gate-notice')?.dataset.ink === 'open')
      await settle()`,
  },
  {
    id: 'A3-rest',
    title: '登录后的静止：形在家，一页选中（日程）',
    tiers: true,
    act: `await goTo('日程')`,
  },
  {
    id: 'A4-rail',
    title: '侧栏折成窄条',
    widths: WIDE_ONLY,
    act: ON_ASSETS,
    each: `await fold('rail'); await rest()`,
    leave: `await fold('expanded')`,
  },
  { id: 'A5-page', title: '选中「资产」一页', act: ON_ASSETS },
  {
    id: 'A6-appearance',
    title: '外观菜单打开',
    act: ON_ASSETS,
    each: `await closeMenu(); await openAppearance()`,
    leave: `await closeMenu(); await closeDrawer()`,
  },
  {
    id: 'A7-disconnected',
    title: '断开服务：重连那一行',
    breaks: 'server',
    act: [
      ON_ASSETS,
      async walk => {
        await walk.stack.server.stop()
        print('stopped the walk’s own server')
      },
      `await wait('the reconnecting line', reconnecting)`,
    ],
    each: `
      if (narrow()) await openDrawer()
      await wait('the reconnecting line', reconnecting)
      await rest()`,
  },
  {
    id: 'A8-drawer',
    title: '720 宽，抽屉打开',
    widths: ['720'],
    act: ON_ASSETS,
    each: `await closeDrawer(); await openDrawer()`,
    leave: `await closeDrawer()`,
  },
  {
    id: 'B1-conversation',
    title: '长会话',
    tiers: true,
    act: `await openSession('请总结')`,
  },
  {
    id: 'B1-side-bubble',
    title: '1100 宽，对话头展开的淡墨框',
    widths: ['1100'],
    act: `await openSession('请总结')`,
    each: `await closeSide(); await openSide()`,
    leave: `await closeSide()`,
  },
  {
    id: 'B1-rest',
    title: '静止的对话：转写停在一轮完成的回复上',
    act: `
      await openSession(${JSON.stringify(REST_ASK)})
      await wait('the finished reply', () => transcript().includes('没有动别的设置'))`,
  },
  {
    id: 'B2-working',
    title: '在做的一轮：回复流到一半，形在写',
    act: `await fresh(); await say(${JSON.stringify(SLOW_ASK)}, '先读出旧文件里的每一项')`,
    each: `
      await rest()
      if (transcript().includes('删掉旧文件')) throw new Error('the held reply finished before the shot')
      // The end of the transcript in view: the deepest element that holds the last line streamed so far.
      const streamed = [...conversation().querySelectorAll('*')].findLast(item =>
        item.textContent.includes('先读出旧文件里的每一项'))
      streamed.scrollIntoView({ block: 'nearest' })
      await settle()`,
    leave: [
      () => releaseHeld(),
      `await wait('the held reply to finish', () => transcript().includes('删掉旧文件'))`,
    ],
  },
  {
    id: 'B4-tool-long',
    title: '长的工具输出：过程行展开着，几十行的结果在代码面里',
    act: `await openSession(${JSON.stringify(LONG_ASK)})`,
    each: `
      await rest()
      const line = await wait('the Shell call’s line', () =>
        [...conversation().querySelectorAll('[aria-expanded]')].find(item => item.textContent.includes('Shell')))
      if (line.getAttribute('aria-expanded') !== 'true') line.click()
      await wait('the call unfolded', () => line.getAttribute('aria-expanded') === 'true')
      await settle()
      line.scrollIntoView({ block: 'start' })
      await settle()`,
  },
  {
    id: 'B5-failed',
    title: '一轮失败了：失败的那一轮与它下面的通知',
    act: `await openSession('请总结')`,
    each: `
      await rest()
      const retry = await wait('the failure’s retry', () => byText('section[data-page=conversation]:not([hidden]) button', '重试'))
      retry.scrollIntoView({ block: 'nearest' })
      await settle()`,
  },
  {
    id: 'B9-background',
    title: '后台调用：「后台」页签里展开着，有输出与停止的进度',
    act: `await fresh(); await say(${JSON.stringify(BACKGROUND_ASK)}, '构建在后台跑着')`,
    each: ON_BACKGROUND,
    leave: `if (bubble() !== null) await closeSide()`,
  },
  {
    id: 'T1-told',
    title: '一条强的通知：家旁的告知笺',
    widths: WIDE_ONLY,
    act: [ON_ASSETS, walk => tellStrong(walk.stack)],
    each: `
      await rest()
      await wait('the told note written', () => document.querySelector('.omne-told-note')?.dataset.ink === 'open')
      await settle()`,
  },
  {
    id: 'C1-cards',
    title: '一批问询卡',
    tiers: true,
    act: `await openSession('有几件事要问我')`,
  },
  { id: 'C5-decisions', title: '待你决定', act: `await goTo('待你决定')` },
  { id: 'C6-notifications', title: '通知', act: `await goTo('通知')` },
  { id: 'D1-search', title: '搜索', act: `await goTo('搜索')` },
  { id: 'D2-schedule', title: '日程', act: `await goTo('日程')` },
  { id: 'D3-calendar', title: '日历', act: `await goTo('日历')` },
  { id: 'D4-assets', title: '资产', act: `await goTo('资产')` },
  { id: 'D6-settings', title: '设置', tiers: true, act: `await goTo('设置')` },
  { id: 'D9-usage', title: '用量', act: `await goTo('用量')` },
  ...tipScenes('T2-tip-side-fold', '侧边区的收起钮的提示', {
    act: `await openSession('请总结')`,
    ready: `await rest(); await openSide()`,
    find: `document.querySelector('section[data-page=conversation]:not([hidden]) .omne-session-side [aria-label="收起侧边区"]')`,
  }),
  ...tipScenes('T3-tip-usage-more', '用量面板顶上 ⋯ 的提示', {
    act: `await openSession('请总结')`,
    ready: `await rest(); await openSide()`,
    find: `document.querySelector('section[data-page=conversation]:not([hidden]) .omne-session-side [aria-label="更多操作"]')`,
  }),
  ...tipScenes('T4-tip-background-stop', '后台调用的停止钮的提示', {
    act: `await fresh(); await say(${JSON.stringify(BACKGROUND_ASK)}, '构建在后台跑着')`,
    ready: ON_BACKGROUND,
    find: `document.querySelector('section[data-page=conversation]:not([hidden]) .omne-session-side [aria-label="停止"]')`,
    leave: `if (bubble() !== null) await closeSide()`,
  }),
  {
    id: 'K1-specimen',
    title: '共用件的样张',
    tiers: true,
    specimen: true,
  },
]

const BREAKS = [undefined, 'login', 'server']

async function apply(browser, { theme, width, size }) {
  await browser.send('Emulation.setDeviceMetricsOverride', {
    width: width.width,
    height: width.height,
    deviceScaleFactor: scale,
    mobile: false,
  })
  await browser.send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: theme },
      { name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' },
    ],
  })
  await evaluate(
    browser,
    `(async () => {
      const root = document.documentElement
      const want = ${JSON.stringify(size)}
      // Through the app's own keys (⌘0, then ⌘= or ⌘-), so its size setting and the appearance menu know it too.
      const mac = /Mac/.test(navigator.platform)
      const press = key => window.dispatchEvent(new KeyboardEvent('keydown',
        { key, metaKey: mac, ctrlKey: !mac, bubbles: true, cancelable: true }))
      press('0')
      const steps = ['small', 'medium', 'large', 'reading'].indexOf(want) - 1
      for (let step = 0; step < Math.abs(steps); step++) press(steps > 0 ? '=' : '-')
      if ((root.dataset.size ?? 'medium') !== want) {
        // A page without the app's size keys (the specimen): set the size on the root itself.
        if (want === 'medium') delete root.dataset.size
        else root.dataset.size = want
        try { localStorage.setItem('omne.size', want) } catch {}
      }
      await document.fonts.ready
      await new Promise(resolve => setTimeout(resolve, 450))
      return root.dataset.theme
    })()`,
  )
}

async function perform(walk, steps) {
  const all = steps === undefined ? [] : Array.isArray(steps) ? steps : [steps]
  for (const step of all) {
    if (typeof step === 'function') await step(walk)
    else await run(walk.browser, `${step}\n return true`)
  }
}

function combinations(windows) {
  const tiers = ['medium', ...sizes.filter(size => size !== 'medium')]
  const out = []
  for (const theme of themes)
    for (const width of windows) for (const size of tiers) out.push({ theme, width, size })
  return out
}

/**
 * FE-I37, run in the page: every shown candidate (an element with `data-control`, and a segmented control's track and
 * thumb, which have none; not `display: none`, not hidden, not under `aria-hidden`, the thumb's own decorative one
 * aside) with its border box, borders, shadow and ring room, and every ancestor that clips it, the nearest
 * first. Which of them are raised and which are cut is the judge's (tests/support/raised-edges.ts).
 */
function readControls() {
  const px = value => Number.parseFloat(value) || 0
  const round = value => Math.round(value * 100) / 100
  const boxOf = (x, y, width, height) => ({
    x: round(x),
    y: round(y),
    width: round(width),
    height: round(height),
  })
  const classes = element =>
    (typeof element.className === 'string' ? element.className : '').split(/\s+/).filter(Boolean)
  const nameOf = element => {
    const all = classes(element)
    const own = all.filter(name => /^(?:omne|shell)-/.test(name))
    const tag = element.tagName.toLowerCase()
    if (own.length > 0) return `${tag}${own.map(name => `.${name}`).join('')}`
    if (element.dataset.variant !== undefined)
      return `${tag}[data-variant=${element.dataset.variant}]`
    return `${tag}${all
      .slice(0, 4)
      .map(name => `.${name}`)
      .join('')}`
  }
  const labelOf = element => {
    if (element.matches('[data-segmented-thumb]')) {
      const track = element.closest('[data-slot="segmented"]')
      const chosen = track?.querySelector('[data-segment][aria-pressed="true"]')
      const words = `${track?.getAttribute('aria-label') ?? ''} ${chosen?.textContent ?? ''}`
      return `${words.replace(/\s+/g, ' ').trim()} [data-segmented-thumb]`
    }
    const labelledBy = (element.getAttribute('aria-labelledby') ?? '')
      .split(/\s+/)
      .map(id => document.getElementById(id)?.textContent ?? '')
      .join(' ')
    const words = [
      element.getAttribute('aria-label'),
      labelledBy,
      element.textContent,
      element.getAttribute('title'),
      element.getAttribute('placeholder'),
      element.getAttribute('name'),
    ]
      .map(text => (text ?? '').replace(/\s+/g, ' ').trim())
      .find(text => text !== '')
    return [words?.slice(0, 60), nameOf(element)].filter(Boolean).join(' ')
  }
  /** An ancestor holds a fixed descendant's containing block (and so clips it) when it transforms or contains. */
  const holdsFixed = style =>
    style.transform !== 'none' ||
    style.perspective !== 'none' ||
    style.filter !== 'none' ||
    style.backdropFilter !== 'none' ||
    style.containerType !== 'normal' ||
    /\b(?:paint|layout|strict|content)\b/.test(style.contain) ||
    /\b(?:transform|perspective|filter)\b/.test(style.willChange)
  const clippersOf = element => {
    const found = []
    let position = getComputedStyle(element).position
    for (
      let at = element.parentElement;
      at !== null && at !== document.body;
      at = at.parentElement
    ) {
      const style = getComputedStyle(at)
      if (style.display === 'contents') continue
      const contains =
        position === 'fixed'
          ? holdsFixed(style)
          : position === 'absolute'
            ? style.position !== 'static' || holdsFixed(style)
            : true
      if (!contains) continue
      position = style.position
      const axis = (overflow, scroll, size, client) =>
        overflow === 'visible'
          ? undefined
          : {
              overflow,
              position: round(scroll),
              size,
              client,
              clipMargin: px(/(-?[\d.]+)px/.exec(style.overflowClipMargin)?.[1] ?? '0'),
            }
      const x = axis(style.overflowX, at.scrollLeft, at.scrollWidth, at.clientWidth)
      const y = axis(style.overflowY, at.scrollTop, at.scrollHeight, at.clientHeight)
      if (x === undefined && y === undefined) continue
      const box = at.getBoundingClientRect()
      const [top, right, bottom, left] = [
        style.borderTopWidth,
        style.borderRightWidth,
        style.borderBottomWidth,
        style.borderLeftWidth,
      ].map(px)
      const barY = Math.max(0, at.offsetWidth - at.clientWidth - Math.round(left + right))
      const barX = Math.max(0, at.offsetHeight - at.clientHeight - Math.round(top + bottom))
      found.push({
        name: nameOf(at),
        box: boxOf(
          box.left + left,
          box.top + top,
          box.width - left - right - barY,
          box.height - top - bottom - barX,
        ),
        ...(x === undefined ? {} : { x }),
        ...(y === undefined ? {} : { y }),
      })
    }
    return found
  }
  const THUMB = '[data-segmented-thumb]'
  return [...document.querySelectorAll(`[data-control], [data-slot="segmented"], ${THUMB}`)]
    .filter(
      element =>
        element.getClientRects().length > 0 &&
        element.checkVisibility({ visibilityProperty: true, opacityProperty: true }) &&
        (element.matches(THUMB) ? element.parentElement : element)?.closest(
          '[aria-hidden="true"]',
        ) === null,
    )
    .map(element => {
      const style = getComputedStyle(element)
      const box = element.getBoundingClientRect()
      const ringRoom =
        px(style.getPropertyValue('--omne-ring-room')) ||
        px(style.getPropertyValue('--omne-ring-width')) +
          px(style.getPropertyValue('--omne-ring-offset'))
      return {
        control:
          element.dataset.control ?? (element.matches(THUMB) ? 'segmented-thumb' : 'segmented'),
        label: labelOf(element),
        box: boxOf(box.left, box.top, box.width, box.height),
        borders: ['Top', 'Right', 'Bottom', 'Left'].map(
          side =>
            `${style[`border${side}Width`]} ${style[`border${side}Style`]} ${style[`border${side}Color`]}`,
        ),
        boxShadow: style.boxShadow,
        ringRoom,
        clippers: clippersOf(element),
      }
    })
}

/** Every shot's raised controls and cuts, written to raised-edges.json in the shots folder after each shot. */
const edgeShots = []
const edgeCuts = () => edgeShots.reduce((sum, shot) => sum + shot.violations.length, 0)

async function checkEdges(browser, file, scene, { theme, width, size }) {
  const { raised, violations } = raisedEdges(await evaluate(browser, `(${readControls})()`))
  edgeShots.push({
    shot: file.slice(shots.length + 1),
    scene: scene.id,
    theme,
    width: `${width.width}x${width.height}`,
    size,
    violations,
    raised,
  })
  writeFileSync(
    join(shots, 'raised-edges.json'),
    `${JSON.stringify({ cuts: edgeCuts(), shots: edgeShots }, null, 2)}\n`,
  )
  for (const cut of violations)
    print(`CUT ${cut.control} "${cut.label}" by ${cut.clipper}: ${cut.side} ${cut.short}px`)
}

async function shootScene(walk, scene, done) {
  const { browser } = walk
  const windows = widths.filter(width => scene.widths?.includes(width.name) ?? true)
  for (const width of widths) if (!windows.includes(width)) print(`SKIP ${scene.id} ${width.name}`)
  if (windows.length === 0) return
  await apply(browser, { theme: themes[0], width: WAY_IN, size: 'medium' })
  await perform(walk, scene.act)
  await pause(INK_DRY_MS)
  for (const combination of combinations(windows)) {
    await apply(browser, combination)
    await perform(walk, scene.each ?? (scene.specimen ? undefined : 'await rest()'))
    if (scene.each !== undefined) await pause(INK_DRY_MS)
    const suffix = combination.size === 'medium' ? '' : `-${combination.size}`
    const file = join(
      shots,
      `${scene.id}-${combination.theme}-${combination.width.name}${suffix}.png`,
    )
    await screenshot(browser, file)
    const sideways = await evaluate(
      browser,
      'document.documentElement.scrollWidth - document.documentElement.clientWidth',
    )
    print(`SHOT ${file} sideways ${sideways}px`)
    await checkEdges(browser, file, scene, combination)
    done.push(file)
  }
  await perform(walk, scene.leave)
}

/** One scene; its failure is printed, shot and counted in the exit code, and the walk goes on to the next scene. */
async function attempt(walk, scene, done) {
  try {
    await shootScene(walk, scene, done)
    print(`SCENE ${scene.id}`)
  } catch (failure) {
    print(`FAILED ${scene.id}: ${failure instanceof Error ? failure.message : String(failure)}`)
    await screenshot(walk.browser, join(shots, `${scene.id}-failed.png`)).catch(() => {})
    await perform(walk, scene.leave).catch(() => {})
    process.exitCode = 1
  }
}

async function buildSpecimen() {
  const outDir = mkdtempSync(join(tmpdir(), 'visual-walk-specimen-'))
  const root = fileURLToPath(new URL('./specimen/', import.meta.url))
  await build({
    root,
    base: '/specimen/',
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    plugins: [react(), tailwindcss()],
    build: {
      outDir,
      emptyOutDir: true,
      modulePreload: { polyfill: false },
      assetsInlineLimit: 0,
      rollupOptions: { input: [join(root, 'index.html'), join(root, 'ink.html')] },
    },
  })
  return outDir
}

async function navigate(browser, url) {
  const loaded = new Promise(resolve => {
    const off = browser.on('Page.loadEventFired', () => {
      off()
      resolve()
    })
  })
  await browser.send('Page.navigate', { url })
  await loaded
}

async function openSpecimen(browser, origin, page = 'index.html') {
  await navigate(browser, `${origin}specimen/${page}`)
  await run(
    browser,
    `await wait('the specimen', () => document.querySelector('[data-specimen=ready]'))`,
  )
}

/** The app itself, signed in with the walk's account: seeded the first time, back on the app page after that. */
async function enterApp(walk) {
  const { browser, stack } = walk
  if ((await evaluate(browser, 'location.pathname')).startsWith('/specimen/'))
    await navigate(browser, stack.origin)
  if (!walk.seeded) {
    await apply(browser, { theme: themes[0], width: WAY_IN, size: 'medium' })
    await seed(browser)
    walk.seeded = true
    print('seeded the acceptance data')
    return
  }
  await run(browser, `await wait('the sidebar', () => document.querySelector('.shell-sidebar'))`)
}

async function specimenViolations(browser) {
  const seen = await evaluate(browser, 'window.specimenWalk?.violations ?? []')
  print(`POLICY specimen: ${seen.length === 0 ? 'no violations' : seen.join('; ')}`)
  if (seen.length > 0) process.exitCode = 1
}

async function recordSeries(walk, name) {
  const { browser, stack } = walk
  const series = SERIES[name]
  if (series === undefined) throw new Error(`no series ${name}`)
  for (const theme of themes) {
    const folder = join(shots, `${name}-${theme}${reduced ? '-reduced' : ''}`)
    const window = series.width ?? widths[0]
    await apply(browser, { theme, width: window, size: 'medium' })
    if (series.app) await enterApp(walk)
    else await openSpecimen(browser, stack.origin, series.page)
    await series.prepare?.(browser, run)
    const frames = await record(browser, folder, started => series.act(browser, run, started), {
      lasting: series.lasting,
      clip: series.clip,
      pixels: { width: window.width * scale, height: window.height * scale },
    })
    const timings = await series.measure?.(browser, run)
    writeFileSync(join(folder, 'timings.json'), `${JSON.stringify(timings ?? {}, null, 2)}\n`)
    print(
      `SERIES ${name} ${theme}: ${frames.length} frames  ${JSON.stringify(timings ?? {})}  [${folder}]`,
    )
  }
}

async function main() {
  mkdirSync(shots, { recursive: true })
  if (args.includes('--list')) {
    for (const scene of SCENES)
      print(
        `scene ${scene.id}${scene.tiers ? ' ※' : ''}  ${scene.title}${scene.widths === undefined ? '' : `  [${scene.widths.join(', ')}]`}`,
      )
    for (const [name, series] of Object.entries(SERIES)) print(`series ${name}  ${series.title}`)
    return
  }
  const wanted = new Set(list('--scenes', SCENES.map(scene => scene.id).join(',')))
  const seriesWanted = list('--series', '')
  const specimenWanted =
    seriesWanted.some(name => SERIES[name]?.app !== true) ||
    (seriesWanted.length === 0 && SCENES.some(item => item.specimen && wanted.has(item.id)))
  const specimenRoot = specimenWanted ? await buildSpecimen() : undefined
  const stack = await startStack({
    answer,
    pageRoot: new URL('../dist/page/', import.meta.url).pathname,
    specimenRoot,
  })
  const profile = mkdtempSync(join(tmpdir(), 'visual-walk-chrome-'))
  let chrome
  let browser
  try {
    chrome = await startChrome(profile, scale)
    browser = await devtools(chrome.port)
    await browser.send('Page.enable')
    await browser.send('Page.navigate', { url: stack.origin })
    const walk = { browser, stack, seeded: false }
    const done = []
    if (seriesWanted.length > 0) {
      for (const name of seriesWanted) await recordSeries(walk, name)
      return
    }
    for (const scene of SCENES.filter(item => item.before && wanted.has(item.id)))
      await attempt(walk, scene, done)
    const signedIn = SCENES.filter(
      item => !item.before && !item.specimen && wanted.has(item.id),
    ).sort((a, b) => BREAKS.indexOf(a.breaks) - BREAKS.indexOf(b.breaks))
    if (signedIn.length > 0) await enterApp(walk)
    for (const [at, scene] of signedIn.entries()) {
      await attempt(walk, scene, done)
      if (scene.breaks === 'login' && at < signedIn.length - 1) {
        await signInAgain(browser)
        print('signed in again')
      }
    }
    const specimen = SCENES.find(item => item.specimen && wanted.has(item.id))
    if (specimen !== undefined) {
      await openSpecimen(browser, stack.origin)
      await shootScene(walk, specimen, done)
      await specimenViolations(browser)
      print(`SCENE ${specimen.id}`)
    }
    print(`shots: ${done.length} in ${shots}`)
  } catch (failure) {
    print(`failed: ${failure instanceof Error ? failure.message : String(failure)}`)
    if (browser !== undefined) await screenshot(browser, join(shots, 'failed.png')).catch(() => {})
    writeFileSync(join(shots, 'server-stderr.log'), stack.server.stderr())
    writeFileSync(join(shots, 'host.log'), `${stack.hostLog.join('\n')}\n`)
    process.exitCode = 1
  } finally {
    browser?.close()
    stopChrome(chrome)
    releaseHeld()
    await stack.stop()
    rmSync(profile, { recursive: true, force: true })
    if (specimenRoot !== undefined) rmSync(specimenRoot, { recursive: true, force: true })
  }
  if (seriesWanted.length > 0) return
  if (edgeCuts() > 0) process.exitCode = 1
  print(
    `raised edges: ${edgeCuts()} cut(s) in ${edgeShots.length} shot(s), ${join(shots, 'raised-edges.json')}`,
  )
}

await main()
process.exit(process.exitCode ?? 0)
