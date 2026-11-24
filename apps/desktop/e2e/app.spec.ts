import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Page } from '@playwright/test'
import { REPLY, expect, quit, test } from './desktop.ts'

// The tests share one server: each signs up a name of its own.
async function signUp(page: Page): Promise<void> {
  await page.getByRole('button', { name: '第一次使用' }).click()
  await page.locator('input[name=loginIdentifier]').fill(`e2e-${randomUUID().slice(0, 8)}`)
  await page.locator('input[name=credential]').fill('alice-pw-e2e')
  await page.getByRole('button', { name: '注册并登录' }).click()
  await expect(page.getByRole('button', { name: '新建会话' })).toBeEnabled({ timeout: 30_000 })
}

test('注册、发一条消息、看到回复；页面读不到登录 cookie，也没有 Node', async ({ launchApp }) => {
  const { page } = await launchApp()
  await expect(page.locator('input[name=loginIdentifier]')).toBeVisible({ timeout: 30_000 })
  // Strings, not functions: this file is checked without the DOM's types.
  expect(await page.evaluate('[typeof require, typeof process]')).toEqual([
    'undefined',
    'undefined',
  ])
  await signUp(page)
  await page.getByRole('button', { name: '新建会话' }).click()
  await page.getByRole('textbox', { name: '输入消息' }).fill('say hello')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.locator('.omne-message[data-role=assistant]')).toContainText(REPLY, {
    timeout: 30_000,
  })
  expect(await page.evaluate('document.cookie')).toBe('')
})

// The button shows only once the main process has loaded the screen backend: in the packaged app that proves the
// binary it carries loads. On macOS the packaged test app is a bundle of its own, which the system would ask about
// on every run, so there the test stops before the capture; the unpackaged app is Electron's bundle, allowed once.
test('输入框的截图钮：每块屏上铺一层遮罩，框一块画上标注再确定、双击取整块、右键取消', async ({
  launchApp,
  target,
}) => {
  const { app, page } = await launchApp()
  await expect(page.locator('input[name=loginIdentifier]')).toBeVisible({ timeout: 30_000 })
  await signUp(page)
  await page.getByRole('button', { name: '新建会话' }).click()
  const button = page.getByRole('button', { name: '截一张屏幕，作为图片附件' })
  await expect(button).toBeVisible({ timeout: 30_000 })
  if (process.platform === 'darwin' && target === 'packaged') return
  const screens = await app.evaluate(({ screen }) => screen.getAllDisplays().length)
  const shown = () => app.windows().filter(each => each.url().includes('/shot.html'))
  const overlayErrors: string[] = []
  // A person can act once the overlay is on screen with its frozen frame.
  const drawn =
    'document.visibilityState === "visible" && [...document.images].some(image => image.naturalWidth > 0)'
  const overlay = async (): Promise<Page> => {
    await button.click()
    await expect.poll(() => shown().length, { timeout: 30_000 }).toBe(screens)
    const [first] = shown()
    first!.on('console', message => {
      if (message.type() === 'error') overlayErrors.push(message.text())
    })
    await first!.waitForFunction(drawn, undefined, { timeout: 30_000 })
    return first!
  }
  const closed = async () => {
    await expect.poll(() => shown().length, { timeout: 30_000 }).toBe(0)
    await expect(button).toBeEnabled({ timeout: 30_000 })
  }
  const previews = page.locator('img[alt$="的预览"]')
  const sizes = async () =>
    (await page.evaluate(
      `[...document.querySelectorAll('img[alt$="的预览"]')].map(image => [image.naturalWidth, image.naturalHeight])`,
    )) as number[][]

  const framed = await overlay()
  const ratio = (await framed.evaluate('devicePixelRatio')) as number
  await framed.mouse.move(100, 100)
  await framed.mouse.down()
  await framed.mouse.move(500, 400, { steps: 8 })
  await framed.mouse.up()
  await framed.locator('[title="矩形"]').click()
  await framed.mouse.move(200, 180)
  await framed.mouse.down()
  await framed.mouse.move(380, 300, { steps: 6 })
  await framed.mouse.up()
  await framed.locator('[title="确定"]').click()
  await closed()
  await expect(previews).toHaveCount(1, { timeout: 30_000 })
  await expect.poll(sizes).toEqual([[400 * ratio, 300 * ratio]])

  const whole = await overlay()
  const screenPixels = (await whole.evaluate(
    '[Math.round(innerWidth * devicePixelRatio), Math.round(innerHeight * devicePixelRatio)]',
  )) as number[]
  await whole.mouse.dblclick(300, 300)
  await closed()
  await expect(previews).toHaveCount(2, { timeout: 30_000 })
  await expect.poll(sizes).toEqual([[400 * ratio, 300 * ratio], screenPixels])

  await (await overlay()).mouse.click(300, 300, { button: 'right' })
  await closed()
  await expect(previews).toHaveCount(2)
  await expect(page.getByText('已备好')).toHaveCount(2)
  expect(overlayErrors).toEqual([])
})

/** Per stored cookie of the app: whether its value is on disk in plain text, or only encrypted. */
function storedCookies(userData: string): string[] {
  const store = new DatabaseSync(join(userData, 'Partitions', 'omne', 'Cookies'), {
    readOnly: true,
  })
  try {
    const rows = store
      .prepare('select length(value) as plain, length(encrypted_value) as sealed from cookies')
      .all() as { plain: number; sealed: number }[]
    return rows.map(({ plain, sealed }) =>
      plain > 0 ? 'plain' : sealed > 0 ? 'encrypted' : 'empty',
    )
  } finally {
    store.close()
  }
}

test('退出应用再打开，凭 cookie 直接进工作区；打包的应用把 cookie 加密落盘', async ({
  launchApp,
  target,
  userDataDir,
}) => {
  const first = await launchApp()
  await signUp(first.page)
  await quit(first)
  const stored = storedCookies(userDataDir)
  expect(stored.length).toBeGreaterThan(0)
  expect(new Set(stored)).toEqual(new Set([target === 'packaged' ? 'encrypted' : 'plain']))
  const { page } = await launchApp()
  await expect(page.getByRole('button', { name: '新建会话' })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('input[name=loginIdentifier]')).toHaveCount(0)
})
