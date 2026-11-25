import { randomUUID } from 'node:crypto'
import type { ElectronApplication, Page } from '@playwright/test'
import { ASK_MARKER, expect, test } from './desktop.ts'

// The desk layer is macOS only in this version (apps/desktop/SPEC.md#桌面层); elsewhere the figure stays in the page.
test.skip(process.platform !== 'darwin', '桌面层这一版只在 macOS 上有，别的系统上形出不了页面')

const PASSWORD = 'alice-pw-e2e'
const RECALL = '叫它回来'

async function signUp(page: Page): Promise<string> {
  const name = `e2e-${randomUUID().slice(0, 8)}`
  await expect(page.locator('input[name=loginIdentifier]')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '第一次使用' }).click()
  await page.locator('input[name=loginIdentifier]').fill(name)
  await page.locator('input[name=credential]').fill(PASSWORD)
  await page.getByRole('button', { name: '注册并登录' }).click()
  await expect(page.getByRole('button', { name: '新建会话' })).toBeEnabled({ timeout: 30_000 })
  return name
}

async function signIn(page: Page, name: string): Promise<void> {
  await page.locator('input[name=loginIdentifier]').fill(name)
  await page.locator('input[name=credential]').fill(PASSWORD)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('button', { name: '新建会话' })).toBeEnabled({ timeout: 30_000 })
}

/** What the main process says of the desk layer's window, or null when there is none. */
const deskWindow = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const desk = BrowserWindow.getAllWindows().find(each =>
      each.webContents.getURL().includes('/desk.html'),
    )
    return desk === undefined
      ? null
      : {
          visible: desk.isVisible(),
          top: desk.isAlwaysOnTop(),
          everywhere: desk.isVisibleOnAllWorkspaces(),
          focusable: desk.isFocusable(),
        }
  })

const deskPage = (app: ElectronApplication): Page => {
  const found = app.windows().find(each => each.url().includes('/desk.html'))
  if (found === undefined) throw new Error('no desk page')
  return found
}

const mainWindow = (app: ElectronApplication, act: 'minimize' | 'restore' | 'close') =>
  app.evaluate(({ BrowserWindow }, what) => {
    const main = BrowserWindow.getAllWindows().find(
      each => !/\/(desk|shot)\.html/.test(each.webContents.getURL()),
    )
    main?.[what]()
  }, act)

const inkOnPage = (page: Page) => page.locator('.omne-figure-carried .omne-figure-ink')
const recall = (page: Page) => page.getByRole('button', { name: RECALL })

/**
 * Presses the figure at home and drags it past the edge of the viewport with Playwright's mouse, waits until the
 * desk layer has taken it (the page shows the empty seat), then lets go out there.
 */
async function liftOut(page: Page): Promise<void> {
  const box = await page.locator('.omne-figure-carried').boundingBox()
  if (box === null) throw new Error('the figure is not on the page')
  const [width, height] = (await page.evaluate('[innerWidth, innerHeight]')) as [number, number]
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 12, y + 12, { steps: 3 })
  await page.mouse.move(width + 120, height / 2, { steps: 12 })
  await expect(recall(page)).toBeVisible({ timeout: 15_000 })
  await page.mouse.up()
}

async function onDesk(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => deskWindow(app), { timeout: 15_000 }).toMatchObject({ visible: true })
  const desk = deskPage(app)
  await expect(desk.locator('main.desk[data-mode=rest] .omne-figure-ink')).toHaveCount(1)
  return desk
}

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
