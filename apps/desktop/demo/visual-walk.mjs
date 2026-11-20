import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { build } from 'vite'
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

const USAGE = `usage: node apps/desktop/demo/visual-walk.mjs [options]

The acceptance walk of the page's look: a server on a fresh state directory with a scripted model, the standalone
forwarding process and a headless Chromium; it seeds the acceptance data, then shoots every scene in every theme,
window and size asked for, named <scene>-<theme>-<width>[-<size>].png. Each shot prints how far the page
scrolls sideways; the specimen scene prints the page policy violations it saw.

  --shots <dir>        where the pictures go (a fresh temporary folder by default)
  --scenes <a,b>       only these scenes (by id); --list prints them
  --themes <a,b>       light,dark (default both)
  --widths <a,b>       1440x900,1100x760,720x480 (default 1440x900,1100x760)
  --sizes <a,b>        medium,small,large,reading: the extra sizes for the scenes marked ※ (default none)
  --scale <n>          device pixels per CSS pixel (default 1)
  --series <a,b>       record these frame series instead of the scenes, once per theme, each on a fresh
                       specimen page (--list prints them)
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
const widths = list('--widths', '1440x900,1100x760').map(text => {
  const [width, height = 900] = text.split('x').map(Number)
  return { name: String(width), width, height }
})
const sizes = list('--sizes', '')
const scale = Number(option('--scale', '1'))
const reduced = args.includes('--reduced')
const ACCOUNT = { loginIdentifier: 'visual', credential: 'visual-walk-pw-3b81' }

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
const SHELL = JSON.stringify({ command: 'execute', params: { script: 'echo visual-walk' } })

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
  if (last?.role === 'tool')
    return { ...reply, body: final(body, '命令跑完了，输出是 visual-walk。') }
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
  const transcript = () => document.querySelector('section[data-page=conversation]')?.innerText ?? ''
  const say = async (text, until) => {
    fill(await wait('the composer', () => document.querySelector('textarea[aria-label="输入消息"]')), text)
    await press('button[type=submit]', '发送')
    await wait(until, () => transcript().includes(until))
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
`

const run = (browser, body) => evaluate(browser, `(async () => { ${HELPERS}\n${body} })()`)

async function seed(browser) {
  await run(
    browser,
    `
    await wait('the login gate', () => document.querySelector('input[name=loginIdentifier]'))
    await press('button', '第一次使用')
    fill(document.querySelector('input[name=loginIdentifier]'), ${JSON.stringify(ACCOUNT.loginIdentifier)})
    fill(document.querySelector('input[name=credential]'), ${JSON.stringify(ACCOUNT.credential)})
    await press('button[type=submit]', '注册并登录')
    await wait('the sidebar', () => document.querySelector('.shell-sidebar'))
    const fresh = async () => {
      await press('button', '新建会话')
      await wait('the composer', () => document.querySelector('textarea[aria-label="输入消息"]'))
    }
    await fresh()
    await say('请总结一下这一轮做了什么', '这一轮做了什么')
    await say('请调用工具跑一下命令', '命令跑完了')
    await say('这一句会失败', '这一轮失败了')
    await fresh()
    await say('有几件事要问我', 'Agent 在问你')
    await fresh()
    return 'seeded'`,
  )
}

const SCENES = [
  { id: 'A1-gate', title: '登录门', before: true, tiers: true },
  {
    id: 'A3-rest',
    title: '登录后的静止',
    tiers: true,
    act: `await goTo('对话'); await openSession('请总结')`,
  },
  {
    id: 'B1-conversation',
    title: '长会话',
    tiers: true,
    act: `await openSession('请总结'); await sleep(300)`,
  },
  {
    id: 'C1-cards',
    title: '一批问询卡',
    tiers: true,
    act: `await goTo('对话'); await openSession('有几件事要问我')`,
  },
  { id: 'C5-decisions', title: '待你决定', act: `await goTo('待你决定')` },
  { id: 'C6-notifications', title: '通知', act: `await goTo('通知')` },
  { id: 'D1-search', title: '搜索', act: `await goTo('搜索')` },
  { id: 'D2-schedule', title: '日程', act: `await goTo('日程')` },
  { id: 'D3-calendar', title: '日历', act: `await goTo('日历')` },
  { id: 'D4-assets', title: '资产', act: `await goTo('资产')` },
  { id: 'D6-settings', title: '设置', tiers: true, act: `await goTo('设置')` },
  { id: 'D9-usage', title: '用量', act: `await goTo('用量')` },
  {
    id: 'K1-specimen',
    title: '共用件的样张',
    tiers: true,
    specimen: true,
  },
]

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
      if (${JSON.stringify(size)} === 'medium') delete root.dataset.size
      else root.dataset.size = ${JSON.stringify(size)}
      try { localStorage.setItem('omne.size', ${JSON.stringify(size)}) } catch {}
      window.dispatchEvent(new StorageEvent('storage', { key: 'omne.size' }))
      await document.fonts.ready
      await new Promise(resolve => setTimeout(resolve, 450))
      return root.dataset.theme
    })()`,
  )
}

function combinations(scene) {
  const tiers = scene.tiers ? ['medium', ...sizes.filter(size => size !== 'medium')] : ['medium']
  const out = []
  for (const theme of themes)
    for (const width of widths) for (const size of tiers) out.push({ theme, width, size })
  return out
}

async function shootScene(browser, scene, done) {
  for (const combination of combinations(scene)) {
    await apply(browser, combination)
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
    done.push(file)
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

async function openSpecimen(browser, origin, page = 'index.html') {
  const loaded = new Promise(resolve => {
    const off = browser.on('Page.loadEventFired', () => {
      off()
      resolve()
    })
  })
  await browser.send('Page.navigate', { url: `${origin}specimen/${page}` })
  await loaded
  await run(
    browser,
    `await wait('the specimen', () => document.querySelector('[data-specimen=ready]'))`,
  )
}

async function specimenViolations(browser) {
  const seen = await evaluate(browser, 'window.specimenWalk?.violations ?? []')
  print(`POLICY specimen: ${seen.length === 0 ? 'no violations' : seen.join('; ')}`)
  if (seen.length > 0) process.exitCode = 1
}

async function main() {
  mkdirSync(shots, { recursive: true })
  if (args.includes('--list')) {
    for (const scene of SCENES) print(`scene ${scene.id}  ${scene.title}`)
    for (const [name, series] of Object.entries(SERIES)) print(`series ${name}  ${series.title}`)
    return
  }
  const wanted = new Set(list('--scenes', SCENES.map(scene => scene.id).join(',')))
  const seriesWanted = list('--series', '')
  const specimenWanted =
    seriesWanted.length > 0 || SCENES.some(item => item.specimen && wanted.has(item.id))
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
    chrome = await startChrome(profile)
    browser = await devtools(chrome.port)
    await browser.send('Page.enable')
    await browser.send('Page.navigate', { url: stack.origin })
    const done = []
    if (seriesWanted.length > 0) {
      for (const name of seriesWanted) {
        const series = SERIES[name]
        if (series === undefined) throw new Error(`no series ${name}`)
        for (const theme of themes) {
          const folder = join(shots, `${name}-${theme}${reduced ? '-reduced' : ''}`)
          await apply(browser, { theme, width: series.width ?? widths[0], size: 'medium' })
          await openSpecimen(browser, stack.origin, series.page)
          await series.prepare?.(browser, run)
          const frames = await record(
            browser,
            folder,
            started => series.act(browser, run, started),
            { lasting: series.lasting, clip: series.clip },
          )
          const timings = await series.measure?.(browser, run)
          writeFileSync(join(folder, 'timings.json'), `${JSON.stringify(timings ?? {}, null, 2)}\n`)
          print(
            `SERIES ${name} ${theme}: ${frames.length} frames  ${JSON.stringify(timings ?? {})}  [${folder}]`,
          )
        }
      }
      return
    }
    for (const scene of SCENES.filter(item => item.before && wanted.has(item.id))) {
      await run(
        browser,
        `await wait('the login gate', () => document.querySelector('input[name=loginIdentifier]'))`,
      )
      await shootScene(browser, scene, done)
      print(`SCENE ${scene.id}`)
    }
    const signedIn = SCENES.filter(item => !item.before && !item.specimen && wanted.has(item.id))
    if (signedIn.length > 0) {
      await seed(browser)
      print('seeded the acceptance data')
      for (const scene of signedIn) {
        await apply(browser, { theme: themes[0], width: widths[0], size: 'medium' })
        await run(browser, `${scene.act}\n return true`)
        await shootScene(browser, scene, done)
        print(`SCENE ${scene.id}`)
      }
    }
    const specimen = SCENES.find(item => item.specimen && wanted.has(item.id))
    if (specimen !== undefined) {
      await openSpecimen(browser, stack.origin)
      await shootScene(browser, specimen, done)
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
    await stack.stop()
    rmSync(profile, { recursive: true, force: true })
    if (specimenRoot !== undefined) rmSync(specimenRoot, { recursive: true, force: true })
  }
}

await main()
process.exit(process.exitCode ?? 0)
