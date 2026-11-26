import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ElectronApplication, Page } from '@playwright/test'
import { electronBinary } from '../scripts/launch.ts'
import {
  blurMain,
  deskFigure,
  deskPage,
  deskWindow,
  liftOut,
  onDesk,
  recall,
  signIn,
  signUp,
} from './desk.ts'
import { ASK_MARKER, REPLY, expect, test } from './desktop.ts'

// The desk layer is macOS only in this version (apps/desktop/SPEC.md#桌面层); elsewhere the figure stays in the page.
test.skip(process.platform !== 'darwin', '桌面层这一版只在 macOS 上有，别的系统上形出不了页面')

const mainWindow = (app: ElectronApplication, act: 'minimize' | 'restore' | 'close') =>
  app.evaluate(({ BrowserWindow }, what) => {
    const main = BrowserWindow.getAllWindows().find(
      each => !/\/(desk|shot)\.html/.test(each.webContents.getURL()),
    )
    main?.[what]()
  }, act)

/** Whether the main window has the focus, read in the main process. */
const mainFocused = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find(each => !/\/(desk|shot)\.html/.test(each.webContents.getURL()))
      ?.isFocused(),
  )

/** The largest alpha in a 4x4 patch of the desk layer's window at a corner away from the figure. */
async function cornerAlpha(app: ElectronApplication, desk: Page): Promise<number> {
  const figure = await desk.locator('.omne-figure-reach').boundingBox()
  if (figure === null) throw new Error('the desk layer draws no figure')
  const [width, height] = (await desk.evaluate('[innerWidth, innerHeight]')) as [number, number]
  const x = figure.x > width / 2 ? 0 : width - 4
  const y = figure.y > height / 2 ? 0 : height - 4
  return app.evaluate(
    async ({ BrowserWindow }, rect) => {
      const window = BrowserWindow.getAllWindows().find(each =>
        each.webContents.getURL().includes('/desk.html'),
      )
      const image = await window!.webContents.capturePage({ ...rect, width: 4, height: 4 })
      const bitmap = image.toBitmap()
      let most = 0
      for (let index = 3; index < bitmap.length; index += 4) most = Math.max(most, bitmap[index]!)
      return bitmap.length === 0 ? -1 : most
    },
    { x, y },
  )
}

const inkOnPage = (page: Page) => page.locator('.omne-figure-carried .omne-figure-ink')
async function seated(app: ElectronApplication, page: Page): Promise<void> {
  await expect(recall(page)).toHaveCount(0, { timeout: 15_000 })
  await expect(inkOnPage(page)).toHaveCount(1)
  await expect.poll(async () => (await deskWindow(app))?.visible ?? false).toBe(false)
}

test('拖出视口再松手：桌面层的窗口显示着、在普通窗口之上、在所有桌面空间、不可聚焦，它画着形；页面里没有形，家空着', async ({
  launchApp,
}) => {
  const { app, page } = await launchApp()
  await signUp(page)
  await liftOut(page)
  await onDesk(app)
  expect(await deskWindow(app)).toEqual({
    visible: true,
    top: true,
    everywhere: true,
    focusable: false,
  })
  await expect(inkOnPage(page)).toHaveCount(0)
  await expect(recall(page)).toBeVisible()
  expect(await cornerAlpha(app, deskPage(app))).toBe(0)
})

/** Presses the figure on the desk layer and lets go of it at a point of the screen. */
async function dragOnDesk(desk: Page, to: { x: number; y: number }): Promise<void> {
  const box = await deskFigure(desk).boundingBox()
  if (box === null) throw new Error('the desk layer draws no figure')
  const [left, top] = (await desk.evaluate('[screenX, screenY]')) as [number, number]
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await desk.mouse.move(from.x, from.y)
  await desk.mouse.down()
  await desk.mouse.move(from.x + 12, from.y + 12, { steps: 3 })
  await desk.mouse.move(to.x - left, to.y - top, { steps: 12 })
  await desk.mouse.up()
}

test('在桌面上拿起形：放到别处它停在那里；拖回主窗口里松手，它回座位', async ({ launchApp }) => {
  const { app, page } = await launchApp()
  await signUp(page)
  await liftOut(page)
  const desk = await onDesk(app)
  const [left, top] = (await desk.evaluate('[screenX, screenY]')) as [number, number]
  const content = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find(each => !/\/(desk|shot)\.html/.test(each.webContents.getURL()))!
      .getContentBounds(),
  )
  // A point of this screen well clear of its edges and outside the main window: nothing clamps it.
  const [width, height] = (await desk.evaluate('[innerWidth, innerHeight]')) as [number, number]
  const clear = (point: { x: number; y: number }) =>
    point.x > left + 80 &&
    point.x < left + width - 80 &&
    point.y > top + 80 &&
    point.y < top + height - 80
  const middle = { x: content.x + content.width / 2, y: content.y + content.height / 2 }
  const outside = [
    { x: content.x + content.width + 120, y: middle.y },
    { x: content.x - 120, y: middle.y },
    { x: middle.x, y: content.y + content.height + 120 },
    { x: middle.x, y: content.y - 120 },
  ].find(clear)
  if (outside === undefined) throw new Error('the main window leaves no room on its screen')
  await dragOnDesk(desk, outside)
  await expect(desk.locator('main.desk[data-mode=rest] .omne-figure-ink')).toHaveCount(1)
  const rested = async () => {
    const box = await deskFigure(desk).boundingBox()
    if (box === null) return null
    return [
      Math.round(box.x + box.width / 2 + left - outside.x),
      Math.round(box.y + box.height / 2 + top - outside.y),
    ]
  }
  await expect.poll(rested).toEqual([0, 0])
  expect(await deskWindow(app)).toMatchObject({ visible: true })
  await dragOnDesk(desk, {
    x: content.x + content.width / 2,
    y: content.y + content.height / 2,
  })
  await seated(app, page)
})

test('双击桌面上的形：主窗口到前面，形留在桌面', async ({ launchApp }) => {
  const { app, page } = await launchApp()
  await signUp(page)
  await liftOut(page)
  const desk = await onDesk(app)
  await blurMain(app)
  await expect.poll(() => mainFocused(app)).toBe(false)
  await deskFigure(desk).dblclick()
  await expect.poll(() => mainFocused(app), { timeout: 10_000 }).toBe(true)
  await expect(desk.locator('main.desk[data-mode=rest] .omne-figure-ink')).toHaveCount(1)
  expect(await deskWindow(app)).toMatchObject({ visible: true })
  await expect(recall(page)).toBeVisible()
})

test('单击桌面上的形说一句话：缺省说给新会话，笺上写已发送，主窗口没有被聚焦；去对话页，主窗口到前面并打开那个会话', async ({
  launchApp,
}) => {
  const { app, page } = await launchApp()
  await signUp(page)
  await liftOut(page)
  const desk = await onDesk(app)
  await blurMain(app)
  await deskFigure(desk).click()
  const bubble = desk.locator('.omne-say-bubble')
  await expect(bubble).toBeVisible({ timeout: 10_000 })
  await expect(bubble.locator('.omne-say-to')).toContainText('新会话')
  const words = `从桌面上说的话 ${randomUUID().slice(0, 6)}`
  const field = desk.getByRole('textbox', { name: '说一句话' })
  await field.fill(words)
  await field.press('Enter')
  await expect(bubble.locator('.omne-say-line')).toHaveText('已发送', { timeout: 30_000 })
  await expect(field).toHaveValue('')
  expect(await mainFocused(app)).toBe(false)
  await desk.getByRole('button', { name: '去对话页' }).click()
  await expect.poll(() => mainFocused(app), { timeout: 10_000 }).toBe(true)
  await expect(bubble).toHaveCount(0, { timeout: 10_000 })
  await expect(desk.locator('main.desk[data-mode=rest] .omne-figure-ink')).toHaveCount(1)
  await expect(page.locator('.omne-message[data-role=user]')).toContainText(words, {
    timeout: 30_000,
  })
  await expect(page.locator('.omne-message[data-role=assistant]')).toContainText(REPLY, {
    timeout: 30_000,
  })
})

test('形在桌面上时开始一轮、让它问一个问题：桌面层的形写出在做事，口外写出 1', async ({
  launchApp,
}) => {
  const { app, page } = await launchApp()
  await signUp(page)
  await page.getByRole('button', { name: '新建会话' }).click()
  await liftOut(page)
  const desk = await onDesk(app)
  await page.getByRole('textbox', { name: '输入消息' }).fill(`${ASK_MARKER}: which port?`)
  await page.getByRole('button', { name: '发送' }).click()
  const figure = desk.locator('main.desk')
  await expect.poll(() => figure.getAttribute('data-doing'), { timeout: 15_000 }).not.toBe('idle')
  await expect(figure).toHaveAttribute('data-waiting', '1', { timeout: 30_000 })
  await expect(figure).toHaveAttribute('data-mode', 'rest')
})

test('回来：按空座、桌面层没了、主窗口重新加载、退出登录；最小化不动它；刚回来就再拿出去；关掉主窗口应用退出', async ({
  launchApp,
}) => {
  test.setTimeout(300_000)
  const { app, page } = await launchApp()
  const name = await signUp(page)

  await liftOut(page)
  await onDesk(app)
  await recall(page).click()
  await seated(app, page)

  await liftOut(page)
  const desk = await onDesk(app)
  await mainWindow(app, 'minimize')
  await expect.poll(async () => (await deskWindow(app))?.visible).toBe(true)
  await expect(desk.locator('main.desk[data-mode=rest] .omne-figure-ink')).toHaveCount(1)
  await mainWindow(app, 'restore')

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find(each => each.webContents.getURL().includes('/desk.html'))
      ?.webContents.forcefullyCrashRenderer()
  })
  await expect(recall(page)).toHaveCount(0, { timeout: 15_000 })
  await expect(inkOnPage(page)).toHaveCount(1)
  await expect.poll(() => deskWindow(app)).toBeNull()

  await liftOut(page)
  await onDesk(app)
  await page.reload()
  await expect.poll(async () => (await deskWindow(app))?.visible).toBe(false)
  await expect(page.getByRole('button', { name: '新建会话' })).toBeEnabled({ timeout: 30_000 })
  await expect(inkOnPage(page)).toHaveCount(1)
  await expect(recall(page)).toHaveCount(0)

  await liftOut(page)
  await onDesk(app)
  await page.locator('.identity-account-control').click()
  await page.getByRole('menuitem', { name: '退出登录' }).click()
  await expect(page.locator('input[name=loginIdentifier]')).toBeVisible({ timeout: 30_000 })
  await seated(app, page)

  await signIn(page, name)
  await liftOut(page)
  await onDesk(app)
  await recall(page).click()
  await expect(recall(page)).toHaveCount(0, { timeout: 15_000 })
  await liftOut(page)
  await onDesk(app)

  const launched = app.process()
  await mainWindow(app, 'close')
  await expect
    .poll(() => launched.exitCode ?? launched.signalCode, { timeout: 15_000 })
    .not.toBeNull()
})

type Rect = Readonly<{ x: number; y: number; width: number; height: number }>
type Point = Readonly<{ x: number; y: number }>
type OtherWindow = Readonly<{ bounds: Rect; title: string; stop(): Promise<void> }>

const OTHER_WINDOW = fileURLToPath(new URL('./other-window.mjs', import.meta.url))
/** The other window's app name as the window server gives it: the bundle of the Electron executable. */
const OTHER_APP = 'Electron'
const middleOf = (rect: Rect): Point => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
})

/**
 * Puts the main window on the left of its screen's work area and answers room for another window right beside it,
 * level with the middle of its content: a hand moving between the two never crosses a third window.
 */
async function besideMain(app: ElectronApplication, page: Page): Promise<Rect> {
  const room = await app.evaluate(({ BrowserWindow, screen }) => {
    const main = BrowserWindow.getAllWindows().find(
      each => !/\/(desk|shot)\.html/.test(each.webContents.getURL()),
    )!
    const area = screen.getDisplayMatching(main.getBounds()).workArea
    const was = main.getBounds()
    main.setBounds({
      x: area.x + 24,
      y: area.y + 24,
      width: Math.min(was.width, Math.floor(area.width / 2) - 120),
      height: Math.min(was.height, area.height - 48),
    })
    const placed = main.getBounds()
    const content = main.getContentBounds()
    const height = 320
    const y = Math.round(content.y + content.height / 2 - height / 2)
    const spot = { x: placed.x + placed.width, y, width: 480, height }
    const fits = spot.x + spot.width <= area.x + area.width && y + height <= area.y + area.height
    return fits ? spot : null
  })
  if (room === null) throw new Error('the screen leaves no room for another window beside omne')
  const middle = middleOf(await contentOf(app))
  // The window server reports the moved window where it was put only after a moment.
  const own = () =>
    page.evaluate(
      async where => (await fetch(`/device/figure/own?x=${where.x}&y=${where.y}`)).json(),
      middle,
    )
  await expect.poll(own, { timeout: 10_000 }).toEqual({ own: true })
  return room
}

/** Another app's window: the same Electron executable in a process of its own, so its pid is not omne's. */
async function openOtherWindow(at: Rect): Promise<OtherWindow> {
  const title = `另一个窗口 ${randomUUID().slice(0, 6)}`
  const userData = realpathSync(mkdtempSync(join(tmpdir(), 'desk-figure-other-')))
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE'),
  )
  const place = [at.x, at.y, at.width, at.height].map(String)
  const child = spawn(electronBinary(), [OTHER_WINDOW, ...place, title, '#d9d4c8', userData], {
    env,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const exited = new Promise<void>(done => child.once('exit', () => done()))
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    await exited
    rmSync(userData, { recursive: true, force: true })
  }
  try {
    const bounds = await new Promise<Rect>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('the other window did not open')), 20_000)
      let text = ''
      child.stdout.on('data', (chunk: Buffer) => {
        text += chunk.toString()
        const line = text
          .split('\n')
          .slice(0, -1)
          .find(each => each.startsWith('{'))
        if (line === undefined) return
        clearTimeout(timer)
        resolve((JSON.parse(line) as { ready: Rect }).ready)
      })
      child.once('exit', code => {
        clearTimeout(timer)
        reject(new Error(`the other window's process exited with ${code}`))
      })
    })
    return { bounds, title, stop }
  } catch (failure) {
    await stop()
    throw failure
  }
}

/**
 * Asks the main process, the way the shell does, which window is frontmost at the other window's middle, and stops
 * the test unless it is that window: nobody else's window is framed or read.
 */
async function inFront(page: Page, other: OtherWindow): Promise<void> {
  const { x, y } = middleOf(other.bounds)
  const answer = (await page.evaluate(
    async where => (await fetch(`/device/figure/window?x=${where.x}&y=${where.y}`)).json(),
    { x, y },
  )) as { kind?: string; bounds?: Rect }
  if (answer.kind !== 'other' || JSON.stringify(answer.bounds) !== JSON.stringify(other.bounds))
    throw new Error(`the other window is not the frontmost at its middle (${answer.kind})`)
}

const contentOf = (app: ElectronApplication): Promise<Rect> =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find(each => !/\/(desk|shot)\.html/.test(each.webContents.getURL()))!
      .getContentBounds(),
  )

const screenAllowed = async (app: ElectronApplication): Promise<boolean> =>
  (await app.evaluate(({ systemPreferences }) =>
    systemPreferences.getMediaAccessStatus('screen'),
  )) === 'granted'

const labelLines = (desk: Page) => desk.locator('.omne-figure-label-line')
const frameOn = (desk: Page, closed: boolean) =>
  desk.locator(`svg.omne-observation-frame[data-closed='${closed}']`)

/** Where the frame drawn on the desk layer says the framed window is, in screen points. */
async function framedAt(desk: Page, closed: boolean): Promise<Rect> {
  const box = await frameOn(desk, closed).boundingBox()
  if (box === null) throw new Error('the desk layer draws no frame')
  const [left, top] = (await desk.evaluate('[screenX, screenY]')) as [number, number]
  const PAD = 8
  return {
    x: Math.round(box.x + left + PAD),
    y: Math.round(box.y + top + PAD),
    width: Math.round(box.width - PAD * 2),
    height: Math.round(box.height - PAD * 2),
  }
}

/** Presses the figure resting on the desk layer and carries it to a point of the screen, without letting go. */
async function carryOnDesk(desk: Page, to: Point): Promise<void> {
  const box = await deskFigure(desk).boundingBox()
  if (box === null) throw new Error('the desk layer draws no figure')
  const [left, top] = (await desk.evaluate('[screenX, screenY]')) as [number, number]
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await desk.mouse.move(from.x, from.y)
  await desk.mouse.down()
  await desk.mouse.move(from.x + 12, from.y + 12, { steps: 3 })
  await desk.mouse.move(to.x - left, to.y - top, { steps: 12 })
}

const NO_SCREEN = '需要在系统设置里允许 omne 录制屏幕，才能看这个窗口'
const userMessage = (page: Page, words: string) =>
  page.locator('.omne-message[data-role=user]').filter({ hasText: words })

/** Writes words in the open note, sends them, and follows the note to the conversation page. */
async function sayAndOpen(app: ElectronApplication, page: Page, desk: Page): Promise<string> {
  const bubble = desk.locator('.omne-say-bubble')
  const words = `看这个窗口 ${randomUUID().slice(0, 6)}`
  const field = desk.getByRole('textbox', { name: '说一句话' })
  await field.fill(words)
  await field.press('Enter')
  await expect(bubble.locator('.omne-say-line')).toHaveText('已发送', { timeout: 30_000 })
  await desk.getByRole('button', { name: '去对话页' }).click()
  await expect.poll(() => mainFocused(app), { timeout: 10_000 }).toBe(true)
  await expect(bubble).toHaveCount(0, { timeout: 10_000 })
  await expect(userMessage(page, words)).toHaveCount(1, { timeout: 30_000 })
  await expect(page.locator('.omne-message[data-role=assistant]')).toContainText(REPLY, {
    timeout: 30_000,
  })
  return words
}

/** Pointer on the page, Command held: the frame and label over the other window; letting go reads it. */
async function lookFromPage(
  app: ElectronApplication,
  page: Page,
  other: OtherWindow,
  name: string,
) {
  const content = await contentOf(app)
  const centre = middleOf(other.bounds)
  await liftOut(page, false)
  await expect.poll(async () => (await deskWindow(app))?.visible).toBe(true)
  const desk = deskPage(app)
  await page.keyboard.down('Meta')
  await page.mouse.move(content.width / 2, content.height / 2, { steps: 8 })
  await expect(labelLines(desk)).toHaveText(['这里没有可看的窗口', '松手回去'])
  await expect(frameOn(desk, false)).toHaveCount(0)
  await page.mouse.move(centre.x - content.x, centre.y - content.y, { steps: 12 })
  await expect(frameOn(desk, false)).toHaveCount(1)
  await expect.poll(() => framedAt(desk, false)).toEqual(other.bounds)
  await expect(labelLines(desk)).toHaveText([name, '松手放进说话笺 · 加按 ⇧ 直接发送'])
  await page.mouse.up()
  await page.keyboard.up('Meta')
  return desk
}

test('按住 ⌘ 看一个窗口：观测框框住另一个进程的窗口、签上有它的应用名；⌘ 松手，有许可时两张图随一句话发出去，没有许可时笺里是说明与打开系统设置；⌘⇧ 从桌面层拿起再松手', async ({
  launchApp,
}) => {
  test.setTimeout(300_000)
  const { app, page } = await launchApp()
  await signUp(page)
  const other = await openOtherWindow(await besideMain(app, page))
  try {
    await inFront(page, other)
    const granted = await screenAllowed(app)
    test.info().annotations.push({ type: 'screen recording', description: String(granted) })
    const name = granted ? `${OTHER_APP} · ${other.title}` : OTHER_APP
    const desk = await lookFromPage(app, page, other, name)
    const bubble = desk.locator('.omne-say-bubble')
    await expect(bubble).toBeVisible({ timeout: 15_000 })
    await expect(desk.locator('main.desk[data-mode=rest] .omne-figure-ink')).toHaveCount(1)
    const thumbs = bubble.locator('.omne-say-thumb')
    if (granted) {
      await expect(thumbs).toHaveCount(2, { timeout: 15_000 })
      const names = await thumbs.evaluateAll(all => all.map(each => each.getAttribute('alt')))
      expect(names).toEqual([
        expect.stringMatching(/^窗口 \d\d\.\d\d\.\d\d\.png$/),
        expect.stringMatching(/^近看 \d\d\.\d\d\.\d\d\.png$/),
      ])
    } else {
      await expect(bubble.locator('.omne-say-line')).toHaveText(NO_SCREEN)
      await expect(bubble.getByRole('button', { name: '打开系统设置' })).toBeVisible()
      await expect(bubble.locator('.omne-say-picture')).toHaveCount(0)
    }
    const words = await sayAndOpen(app, page, desk)
    const shown = userMessage(page, words).locator('.omne-media-picture')
    await expect(shown).toHaveCount(granted ? 2 : 0, { timeout: 30_000 })

    await desk.keyboard.down('Meta')
    await desk.keyboard.down('Shift')
    const centre = middleOf(other.bounds)
    await carryOnDesk(desk, { x: centre.x + 60, y: centre.y + 40 })
    await expect(frameOn(desk, true)).toHaveCount(1)
    await expect.poll(() => framedAt(desk, true)).toEqual(other.bounds)
    await expect(labelLines(desk)).toHaveText([name, '松手直接发送'])
    await expect(desk.locator(".omne-figure-label-line[data-tone='hint']")).toHaveText(
      '松手直接发送',
    )
    await desk.mouse.up()
    await desk.keyboard.up('Shift')
    await desk.keyboard.up('Meta')
    if (granted) {
      await seated(app, page)
      const pictures = page.locator('.omne-message[data-role=user] .omne-media-picture')
      await expect(pictures).toHaveCount(4, { timeout: 30_000 })
    } else {
      await expect(bubble.locator('.omne-say-line')).toHaveText(NO_SCREEN, { timeout: 15_000 })
      await expect(desk.locator('main.desk[data-mode=rest] .omne-figure-ink')).toHaveCount(1)
      expect(await deskWindow(app)).toMatchObject({ visible: true })
    }
  } finally {
    await other.stop()
  }
})

test('不按 ⌘ 拖到另一个进程的窗口上松手、再拖回主窗口：页面没有问过 window 与 read，own 至多一次；按着 ⌘ 移过去时问了 window', async ({
  launchApp,
}) => {
  test.setTimeout(300_000)
  const { app, page } = await launchApp()
  await signUp(page)
  const other = await openOtherWindow(await besideMain(app, page))
  try {
    await inFront(page, other)
    const asked: string[] = []
    page.on('request', request => {
      const path = new URL(request.url()).pathname
      if (path.startsWith('/device/figure/')) asked.push(path)
    })
    const content = await contentOf(app)
    const centre = middleOf(other.bounds)
    await liftOut(page, false)
    await expect.poll(async () => (await deskWindow(app))?.visible).toBe(true)
    await expect(labelLines(deskPage(app)).last()).toHaveText('按住 ⌘ 让它看一个窗口')
    await page.mouse.move(centre.x - content.x, centre.y - content.y, { steps: 12 })
    await page.mouse.up()
    const desk = await onDesk(app)
    await expect(desk.locator('svg.omne-observation-frame')).toHaveCount(0)
    await dragOnDesk(desk, middleOf(content))
    await seated(app, page)
    const reads = (list: readonly string[]) =>
      list.filter(each => each === '/device/figure/window' || each === '/device/figure/read')
    expect(reads(asked)).toEqual([])
    expect(asked.filter(each => each === '/device/figure/own').length).toBeLessThanOrEqual(1)

    await liftOut(page, false)
    await page.keyboard.down('Meta')
    await page.mouse.move(centre.x - content.x, centre.y - content.y, { steps: 12 })
    await expect(frameOn(deskPage(app), false)).toHaveCount(1)
    expect(asked).toContain('/device/figure/window')
    await page.keyboard.up('Meta')
    await page.mouse.move(centre.x - content.x + 20, centre.y - content.y, { steps: 3 })
    await page.mouse.up()
    await expect(deskPage(app).locator('main.desk[data-mode=rest] .omne-figure-ink')).toHaveCount(1)
    expect(asked).not.toContain('/device/figure/read')
  } finally {
    await other.stop()
  }
})
