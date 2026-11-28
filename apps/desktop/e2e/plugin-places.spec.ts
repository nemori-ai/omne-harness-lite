import type { Page } from '@playwright/test'
import { signUp } from './desk.ts'
import { expect, test } from './desktop.ts'
import { assetsOf, BUILTIN, publish, wear } from './tenant-publish.ts'

// C27: what a tenant's plugin puts beside a conversation, in the actions and in the keys works in the real app,
// and a skin colours the part that plugin declares.
const RED = 'rgb(185, 28, 28)'

/** Opens the session again and its side area, folded until asked for. */
async function backToTheSession(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /未命名的会话/u })
    .first()
    .click()
  const figure = page.locator('button.omne-session-figure[aria-controls]')
  if ((await figure.getAttribute('aria-expanded', { timeout: 30_000 })) !== 'true')
    await figure.click()
  await chooseExtras(page)
}

/** The side area shows one tab at a time; with others beside it, the plugin's is chosen as a person does. */
const chooseExtras = (page: Page) =>
  page.locator('.omne-session-side-bar').getByText('Extras', { exact: true }).click()

test('a tab beside the conversation, an action and its key from a tenant plugin work, and a skin colours the part the plugin declares', async ({
  launchApp,
  server,
}) => {
  const { page } = await launchApp()
  const name = await signUp(page)
  const { tenant, assets } = await assetsOf(server, name)
  await publish(assets, tenant, 'plugin', 'desk-extras')
  await publish(assets, tenant, 'skin', 'extras-skin')

  await test.step('the tab the plugin puts beside a conversation shows in the side area of a session', async () => {
    await page.getByRole('button', { name: '新建会话' }).click()
    // The side area is folded until asked for; the figure in the header opens it once there is something in it.
    await page.locator('button.omne-session-figure[aria-controls]').click({ timeout: 60_000 })
    await chooseExtras(page)
    const panel = page.locator('[data-omne-part="desk-extras.panel"]')
    await expect(panel).toHaveText('Extras for this conversation', { timeout: 60_000 })
  })

  await test.step('the key the plugin gives its action runs that action', async () => {
    await page.locator('body').click()
    await expect
      .poll(
        async () => {
          await page.keyboard.press('Meta+Shift+J')
          return page.locator('body').getAttribute('data-desk-extras')
        },
        { timeout: 30_000 },
      )
      .toBe('hello')
  })

  await test.step('a skin worn on the assets page colours the part the plugin declared; the built-in look does not', async () => {
    const panel = page.locator('[data-omne-part="desk-extras.panel"]')
    const colour = () =>
      panel.evaluate(node => node.ownerDocument.defaultView?.getComputedStyle(node).color)
    await wear(page, BUILTIN)
    await backToTheSession(page)
    await expect.poll(colour, { timeout: 30_000 }).not.toBe(RED)
    await wear(page, 'extras-skin')
    await backToTheSession(page)
    await expect.poll(colour, { timeout: 30_000 }).toBe(RED)
  })
})
