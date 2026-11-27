import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assetsProtocol } from '@omne-harness/assets-protocol'
import { identityProtocol } from '@omne-harness/identity-protocol'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { createClient, createHttpProtocolTransport } from '@omne-harness/sdk/core'
import { PASSWORD, signUp } from './desk.ts'
import type { Page } from '@playwright/test'
import { expect, test } from './desktop.ts'

// C27: what a tenant's plugin puts beside a conversation, in the actions and in the keys works in the real app,
// and a skin colours the part that plugin declares.
const FIXTURES = fileURLToPath(new URL('./fixtures/tenant-plugins', import.meta.url))
const RED = 'rgb(185, 28, 28)'

type Assets = ReturnType<typeof createClient<typeof assetsProtocol>>

const BUILTIN = '自带的样子'

/** Wears a skin, or the built-in look, where a person does: the skin category of the assets page. */
async function wear(page: Page, choice: string): Promise<void> {
  await page.getByRole('link', { name: '资产' }).click()
  await page.getByRole('tab', { name: '皮肤' }).click()
  const radio = page.getByRole('radio', { name: choice })
  await expect(radio).toBeEnabled({ timeout: 30_000 })
  await radio.click()
  await expect(page.locator('label.plugin-skin', { has: radio })).toContainText('在用', {
    timeout: 30_000,
  })
}

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

async function assetsOf(origin: string, name: string) {
  const identity = createClient(identityProtocol, createHttpProtocolTransport({ origin }))
  const issued = await identity['issue-login']({ loginIdentifier: name, credential: PASSWORD })
  if (issued.outcome !== 'succeeded') throw new Error(`issue-login: ${issued.outcome}`)
  const { loginProof, tenantId } = issued.body
  const tenant = tenantCodec.encode(tenantId)
  if (!tenant.ok) throw new Error('the tenant does not encode')
  const credentials = () => ({ proof: loginProof, tenant: tenant.value })
  const assets = createClient(assetsProtocol, createHttpProtocolTransport({ origin, credentials }))
  return { tenant: tenantId, assets }
}

/** Publishes one fixture directory file by file, as an upload does. */
async function publish(assets: Assets, tenant: TenantId, category: string, name: string) {
  const dir = join(FIXTURES, name)
  const encoder = new TextEncoder()
  const files = readdirSync(dir).map(path => ({
    path,
    bytes: encoder.encode(readFileSync(join(dir, path), 'utf8')),
  }))
  const operation = `e2e-${name}`
  const manifest = files.map(({ path, bytes }) => ({ path, bytes: bytes.length }))
  const begun = await assets['begin-asset-upload']({ tenant, operation, category, name, manifest })
  if (begun.outcome !== 'succeeded') throw new Error(`begin ${name}: ${begun.outcome}`)
  for (const { path, bytes } of files) {
    const sent = await assets['append-asset-upload']({
      tenant,
      upload: operation,
      path,
      offset: 0,
      bytes,
    })
    if (sent.outcome !== 'succeeded') throw new Error(`append ${path}: ${sent.outcome}`)
  }
  const made = await assets['commit-asset-upload']({ tenant, upload: operation })
  if (made.outcome !== 'succeeded') throw new Error(`commit ${name}: ${made.outcome}`)
}

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
