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
  expect(await page.evaluate('[typeof require, typeof process]')).toEqual(['undefined', 'undefined'])
  await signUp(page)
  await page.getByRole('button', { name: '新建会话' }).click()
  await page.getByRole('textbox', { name: '输入消息' }).fill('say hello')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.locator('.omne-message[data-role=assistant]')).toContainText(REPLY, {
    timeout: 30_000,
  })
  expect(await page.evaluate('document.cookie')).toBe('')
})

/** Per stored cookie of the app: whether its value is on disk in plain text, or only encrypted. */
function storedCookies(userData: string): string[] {
  const store = new DatabaseSync(join(userData, 'Partitions', 'omne', 'Cookies'), { readOnly: true })
  try {
    const rows = store
      .prepare('select length(value) as plain, length(encrypted_value) as sealed from cookies')
      .all() as { plain: number; sealed: number }[]
    return rows.map(({ plain, sealed }) => (plain > 0 ? 'plain' : sealed > 0 ? 'encrypted' : 'empty'))
  } finally {
    store.close()
  }
}

test('退出应用再打开，凭 cookie 直接进工作区；只有发行档把 cookie 加密落盘', async ({
  launchApp,
  target,
  userData,
}) => {
  const first = await launchApp()
  await signUp(first.page)
  await quit(first)
  const stored = storedCookies(userData)
  expect(stored.length).toBeGreaterThan(0)
  expect(new Set(stored)).toEqual(new Set([target === 'release' ? 'encrypted' : 'plain']))
  const { page } = await launchApp()
  await expect(page.getByRole('button', { name: '新建会话' })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('input[name=loginIdentifier]')).toHaveCount(0)
})
