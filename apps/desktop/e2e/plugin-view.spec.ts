import { signUp } from './desk.ts'
import { expect, test } from './desktop.ts'
import { assetsOf, publish } from './tenant-publish.ts'

// C36: the page of one plugin in the assets is its home. What it brought is listed by where it works; its
// permission is changed here; the tool it brought is in the tools only to see, with a way back; it is disabled
// whole, after what goes with it is listed.
test('a plugin has its own page in the assets: what it brought, its permission, the brought tool only seen with a way back, and disabling it whole', async ({
  launchApp,
  server,
}) => {
  const { page } = await launchApp()
  const name = await signUp(page)
  const { tenant, assets } = await assetsOf(server, name)
  await publish(assets, tenant, 'plugin', 'tool-kit')
  const view = page.getByRole('region', { name: 'tool-kit' })

  await test.step('the plugin tab lists it; its page tells what it brought by where it works', async () => {
    await page.getByRole('link', { name: '资产' }).click()
    await page.getByRole('tab', { name: 'Plugin' }).click()
    await page
      .getByRole('button', { name: /tool-kit/u })
      .first()
      .click()
    await expect(view.getByRole('heading', { name: '它带来了什么' })).toBeVisible()
    await expect(view.getByRole('heading', { name: '给 agent 用的' })).toBeVisible({
      timeout: 30_000,
    })
    await expect(view.getByText('wordcount', { exact: true })).toBeVisible()
    await expect(view.getByRole('heading', { name: '在服务端' })).toBeVisible()
    await expect(view.getByText('kit__', { exact: true })).toBeVisible()
  })

  await test.step('its permission is set here', async () => {
    await expect(view.getByRole('heading', { name: '设置与权限' })).toBeVisible()
    await expect(view.getByText('调用这份 Plugin 的工具').first()).toBeVisible({ timeout: 30_000 })
  })

  await test.step('the tool it brought is in the tools only to see, and the way back opens this page', async () => {
    await view
      .getByRole('button', { name: /里看/u })
      .first()
      .click()
    const row = page.getByRole('listitem', { name: 'wordcount' })
    await expect(row).toContainText('来自 Plugin「tool-kit」', { timeout: 30_000 })
    await row.getByRole('button').first().click()
    const card = page.getByRole('region', { name: 'wordcount' })
    await expect(card).toContainText('启用、禁用、移除与设置都在那一份里')
    await expect(card.getByRole('switch')).toHaveCount(0)
    await card.getByRole('button', { name: '去 Plugin「tool-kit」' }).click()
    await expect(view.getByRole('heading', { name: '它带来了什么' })).toBeVisible({
      timeout: 30_000,
    })
  })

  await test.step('disabling lists what goes with it first, then disables it whole', async () => {
    await view.getByRole('switch').click()
    const panel = page.getByRole('dialog')
    await expect(panel).toContainText('禁用「tool-kit」会一起收回这些')
    await expect(panel).toContainText('wordcount')
    await expect(panel).toContainText('kit__')
    await panel.getByRole('button', { name: '禁用整份' }).click()
    await expect(view).toContainText('已禁用', { timeout: 30_000 })
    await expect(view.getByText('wordcount', { exact: true })).toBeVisible()
    await expect(view.getByText('没有生效')).toHaveCount(0)
  })
})
