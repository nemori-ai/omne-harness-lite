import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { REPLY, expect, quit, secondInstance, test } from './desktop.ts'
import { BROKEN_FLAG, bundleKey, CANDIDATE_WROTE, pageBundle } from './page-bundle.ts'

const env = {
  OMNE_PAGE_PUBLISHER_KEY: bundleKey.publicKey,
  OMNE_PAGE_MOUNT_MS: '6000',
  OMNE_PAGE_STABLE_MS: '1500',
}
const install = (directory: string): string[] => [`--install-page-bundle=${directory}`]
const MARK = 'document.documentElement.dataset.pageBundle ?? null'
const POLICY = "fetch('/').then(answer => answer.headers.get('content-security-policy'))"
const pointerOf = (userDataDir: string): unknown => {
  const file = join(userDataDir, 'page-versions', 'current.json')
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
}

// What the main process wrote in this test: shown when the test fails, read by the first test.
let output: string[] = []
test.beforeEach(() => {
  output = []
})
// oxlint-disable-next-line no-empty-pattern -- Playwright fixtures destructure their dependencies
test.afterEach(({}, info) => {
  if (info.status === info.expectedStatus) return
  const lines = output.join('').split('\n')
  process.stderr.write(`${lines.filter(line => line.includes('page version')).join('\n')}\n`)
})

/** The told note is written stroke by stroke: a picture of it waits until the writing is done. */
const written = (page: Page): Promise<void> => page.waitForTimeout(4_000)

async function signUp(page: Page): Promise<void> {
  await page.getByRole('button', { name: '第一次使用' }).click()
  await page.locator('input[name=loginIdentifier]').fill(`e2e-${randomUUID().slice(0, 8)}`)
  await page.locator('input[name=credential]').fill('alice-pw-e2e')
  await page.getByRole('button', { name: '注册并登录' }).click()
  await expect(page.getByRole('button', { name: '新建会话' })).toBeEnabled({ timeout: 30_000 })
}

test('装一版新的页面包并切过去：先在不显示的窗口里起一遍；切过去之后登录与会话都在；删掉版本目录后用自带的那一版', async ({
  launchApp,
  target,
  userDataDir,
}) => {
  test.setTimeout(240_000)
  const first = await launchApp({ env, output })
  const { page } = first
  await expect(page.locator('input[name=loginIdentifier]')).toBeVisible({ timeout: 30_000 })
  await signUp(page)
  await page.getByRole('button', { name: '新建会话' }).click()
  await page.getByRole('textbox', { name: '输入消息' }).fill('say hello')
  // Enter, not the button: the figure's motes can lie over the button in a small window.
  await page.getByRole('textbox', { name: '输入消息' }).press('Enter')
  await expect(page.locator('.omne-message[data-role=assistant]')).toContainText(REPLY, {
    timeout: 30_000,
  })
  expect(await page.evaluate(MARK)).toBeNull()
  const policy = await page.evaluate(POLICY)
  expect(policy).toEqual(expect.stringContaining("script-src 'self'"))

  secondInstance(target, userDataDir, install(pageBundle('good', 'second')))
  await expect.poll(() => page.evaluate(MARK).catch(() => null), { timeout: 60_000 }).toBe('second')
  // The login and the session are on the server and in the cookie: the new version of the page shows them.
  await expect(page.getByRole('button', { name: '新建会话' })).toBeEnabled({ timeout: 30_000 })
  await expect(page.locator('input[name=loginIdentifier]')).toHaveCount(0)
  await expect(page.getByText('say hello').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/页面已换到版本 [0-9a-f]{6}/)).toBeVisible({ timeout: 30_000 })
  await written(page)
  await page.screenshot({ path: test.info().outputPath('switched.png') })
  expect(await page.evaluate(POLICY)).toBe(policy)

  const said = output.join('')
  const tried = said.indexOf('page version: the candidate came up out of sight')
  const switched = said.indexOf('"kind":"switched"')
  expect(tried).toBeGreaterThan(-1)
  expect(switched).toBeGreaterThan(tried)
  await expect
    .poll(() => pointerOf(userDataDir), { timeout: 30_000 })
    .toMatchObject({ settled: true, current: expect.stringMatching(/^page-[0-9a-f]{12}$/) })

  await quit(first)
  rmSync(join(userDataDir, 'page-versions', 'versions'), { recursive: true })
  const again = await launchApp({ env })
  await expect(again.page.getByRole('button', { name: '新建会话' })).toBeEnabled({
    timeout: 30_000,
  })
  expect(await again.page.evaluate(MARK)).toBeNull()
  await expect(again.page.getByText('页面这次用自带版本')).toBeVisible({ timeout: 30_000 })
  await written(again.page)
  await again.page.screenshot({ path: test.info().outputPath('shipped.png') })
})

test('装一版一起来就崩的、没签名的：都没有被切上去，写明原因；它试起时写的本地数据不在现在这一版里', async ({
  launchApp,
  target,
  userDataDir,
}) => {
  test.setTimeout(180_000)
  const { page } = await launchApp({ env, output })
  await expect(page.locator('input[name=loginIdentifier]')).toBeVisible({ timeout: 30_000 })
  await signUp(page)

  secondInstance(target, userDataDir, install(pageBundle('broken', 'broken')))
  await expect(page.getByText('新版页面没换上')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('试起时没显示')).toBeVisible()
  await written(page)
  await page.screenshot({ path: test.info().outputPath('refused.png') })
  expect(await page.evaluate(MARK)).toBeNull()
  expect(await page.evaluate(`localStorage.getItem(${JSON.stringify(CANDIDATE_WROTE)})`)).toBeNull()
  expect(pointerOf(userDataDir)).toBeNull()

  secondInstance(target, userDataDir, install(pageBundle('good', 'unsigned', false)))
  await expect(page.getByText('没有签名')).toBeVisible({ timeout: 60_000 })
  expect(await page.evaluate(MARK)).toBeNull()
  expect(pointerOf(userDataDir)).toBeNull()
  await expect(page.getByRole('button', { name: '新建会话' })).toBeEnabled()
})

test('切上去之后连着起不来：到上限退回上一版，界面上写明退回了哪一版；应用照常能用', async ({
  launchApp,
  target,
  userDataDir,
}) => {
  test.setTimeout(240_000)
  const { page } = await launchApp({ env, output })
  await expect(page.locator('input[name=loginIdentifier]')).toBeVisible({ timeout: 30_000 })
  await signUp(page)
  // Only the window in use has this: out of sight the bundle comes up, in the window it does not.
  await page.evaluate(`localStorage.setItem(${JSON.stringify(BROKEN_FLAG)}, '1')`)

  secondInstance(target, userDataDir, install(pageBundle('breaks-when-flagged', 'flagged')))
  await expect(page.getByText('页面已退回自带版本')).toBeVisible({ timeout: 120_000 })
  await expect(page.getByText('新版起不来')).toBeVisible()
  await written(page)
  await page.screenshot({ path: test.info().outputPath('went-back.png') })
  expect(await page.evaluate(MARK)).toBeNull()
  expect(pointerOf(userDataDir)).toEqual({ current: 'builtin', previous: 'builtin', settled: true })
  await expect(page.getByRole('button', { name: '新建会话' })).toBeEnabled()
  await expect(page.locator('input[name=loginIdentifier]')).toHaveCount(0)
})
