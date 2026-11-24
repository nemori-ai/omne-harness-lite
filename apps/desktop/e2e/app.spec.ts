import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
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
test('输入框的截图钮：截一张这台机器的屏幕，作为图片附件进草稿', async ({ launchApp, target }) => {
  const { page } = await launchApp()
  await expect(page.locator('input[name=loginIdentifier]')).toBeVisible({ timeout: 30_000 })
  await signUp(page)
  await page.getByRole('button', { name: '新建会话' }).click()
  const button = page.getByRole('button', { name: '截一张屏幕，作为图片附件' })
  await expect(button).toBeVisible({ timeout: 30_000 })
  if (process.platform === 'darwin' && target === 'packaged') return
  await button.click()
  await expect(page.getByText(/^屏幕截图 \d\d\.\d\d\.\d\d\.png$/u)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('已备好')).toBeVisible({ timeout: 30_000 })
  // Kept for a look: the picture should show the screen behind omne, not omne itself.
  const picture = (await page.evaluate(
    `(() => { const image = document.querySelector('img[alt$="的预览"]'); const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; canvas.getContext('2d').drawImage(image, 0, 0); return canvas.toDataURL('image/png').split(',')[1] })()`,
  )) as string
  writeFileSync(test.info().outputPath('screenshot.png'), Buffer.from(picture, 'base64'))
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
