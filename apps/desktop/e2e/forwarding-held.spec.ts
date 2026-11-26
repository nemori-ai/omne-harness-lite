import { randomUUID } from 'node:crypto'
import type { ElectronApplication, Page } from '@playwright/test'
import { expect, test } from './desktop.ts'

const FALL_LIMIT = 5

async function signUp(page: Page): Promise<void> {
  await page.getByRole('button', { name: '第一次使用' }).click()
  await page.locator('input[name=loginIdentifier]').fill(`e2e-${randomUUID().slice(0, 8)}`)
  await page.locator('input[name=credential]').fill('alice-pw-e2e')
  await page.getByRole('button', { name: '注册并登录' }).click()
  await expect(page.getByRole('button', { name: '新建会话' })).toBeEnabled({ timeout: 30_000 })
}

/** The forwarding process of the app, by the name the main process gives it. */
const forwarding = (app: ElectronApplication): Promise<number[]> =>
  app.evaluate(({ app: electronApp }) =>
    electronApp
      .getAppMetrics()
      .filter(metric => metric.type === 'Utility' && metric.name === 'omne-forwarding')
      .map(metric => metric.pid),
  )

type Asked = Readonly<{ message: string; detail: string; buttons: string[] }>
const asked = (app: ElectronApplication): Promise<Asked[]> =>
  app.evaluate(() => (globalThis as unknown as { asked: Asked[] }).asked)

test('转发层连着倒下到上限：不再重启，界面上写明；人选再试一次，它起来，页面回来；起稳之后再倒一次照常重启', async ({
  launchApp,
}) => {
  test.setTimeout(240_000)
  const { app, page } = await launchApp()
  await expect(page.locator('input[name=loginIdentifier]')).toBeVisible({ timeout: 30_000 })
  await signUp(page)
  // The native question cannot be seen from here: what it would show is kept, and the test answers it when it chooses.
  await app.evaluate(({ dialog }) => {
    const world = globalThis as unknown as { asked: unknown[]; answer: (response: number) => void }
    world.asked = []
    dialog.showMessageBox = ((_window: unknown, options: unknown) => {
      world.asked.push(options)
      return new Promise(resolve => {
        world.answer = response => resolve({ response, checkboxChecked: false })
      })
    }) as never
  })

  const killed: number[] = []
  for (let fall = 1; fall <= FALL_LIMIT; fall += 1) {
    await expect
      .poll(async () => (await forwarding(app)).filter(pid => !killed.includes(pid)).length, {
        timeout: 30_000,
      })
      .toBe(1)
    const [pid] = (await forwarding(app)).filter(each => !killed.includes(each))
    killed.push(pid!)
    process.kill(pid!, 'SIGKILL')
  }
  await expect.poll(() => asked(app), { timeout: 30_000 }).toHaveLength(1)
  expect((await asked(app))[0]).toMatchObject({
    message: '连接服务的部件停了',
    detail: '它连着 5 次没有起来，应用不再自动重试。页面里的操作现在都会失败。',
    buttons: ['再试一次', '关闭窗口'],
  })

  // Nobody answered yet: no process is started in the meantime.
  await page.waitForTimeout(8_000)
  expect((await forwarding(app)).filter(pid => !killed.includes(pid))).toEqual([])

  // The person answers "one more try": a sixth process comes up, the page loads again, the login is still there.
  const reloaded = page.waitForEvent('load', { timeout: 60_000 })
  await app.evaluate(() =>
    (globalThis as unknown as { answer: (response: number) => void }).answer(0),
  )
  await reloaded
  await expect
    .poll(async () => (await forwarding(app)).filter(pid => !killed.includes(pid)).length, {
      timeout: 30_000,
    })
    .toBe(1)
  await expect(page.getByRole('button', { name: '新建会话' })).toBeEnabled({ timeout: 60_000 })
  await expect(page.locator('input[name=loginIdentifier]')).toHaveCount(0)

  // It stayed up for the stable time: one more fall is the first of a new run, and it is started again.
  await page.waitForTimeout(11_000)
  const [stable] = (await forwarding(app)).filter(pid => !killed.includes(pid))
  killed.push(stable!)
  process.kill(stable!, 'SIGKILL')
  await expect
    .poll(async () => (await forwarding(app)).filter(pid => !killed.includes(pid)).length, {
      timeout: 30_000,
    })
    .toBe(1)
  expect(await asked(app)).toHaveLength(1)
})
