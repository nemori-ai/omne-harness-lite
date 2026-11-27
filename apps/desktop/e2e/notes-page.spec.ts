import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assetsProtocol } from '@omne-harness/assets-protocol'
import { identityProtocol } from '@omne-harness/identity-protocol'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { createClient, createHttpProtocolTransport } from '@omne-harness/sdk/core'
import { PASSWORD, signUp } from './desk.ts'
import { expect, test } from './desktop.ts'

// The example of the developer handbook with a page and its own server data, published by the tenant as it is.
const EXAMPLE = fileURLToPath(
  new URL(
    '../../../packages/plugin/plugin-host-local/skills/extending-the-app/examples/notes-page',
    import.meta.url,
  ),
)

type Assets = ReturnType<typeof createClient<typeof assetsProtocol>>

/** The tenant of a person, and its assets as that person reaches them over the protocol. */
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

/** Publishes the example file by file, as an upload does; answers the holding to remove it by. */
async function publish(assets: Assets, tenant: TenantId): Promise<string> {
  const encoder = new TextEncoder()
  const files = readdirSync(EXAMPLE).map(path => ({
    path,
    bytes: encoder.encode(readFileSync(join(EXAMPLE, path), 'utf8')),
  }))
  const operation = 'e2e-notes-page'
  const manifest = files.map(({ path, bytes }) => ({ path, bytes: bytes.length }))
  const begun = await assets['begin-asset-upload']({
    tenant,
    operation,
    category: 'plugin',
    name: 'notes-page',
    manifest,
  })
  if (begun.outcome !== 'succeeded') throw new Error(`begin: ${begun.outcome}`)
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
  if (made.outcome !== 'succeeded') throw new Error(`commit: ${made.outcome}`)
  return made.body.holding
}

test('a plugin with a page and its own server data installs, its page shows what its server side answers, and it goes when it is removed', async ({
  launchApp,
  server,
}) => {
  const { page } = await launchApp()
  const name = await signUp(page)
  const { tenant, assets } = await assetsOf(server, name)
  const holding = await publish(assets, tenant)
  const entry = page.locator('a[data-page="notes"]')
  await expect(entry).toBeVisible({ timeout: 60_000 })
  await entry.click()
  await expect(page.getByText('Buy milk')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Call the plumber')).toBeVisible()
  const removed = await assets['remove-asset']({ tenant, operation: 'e2e-notes-page-rm', holding })
  expect(removed.outcome).toBe('succeeded')
  await expect(entry).toBeHidden({ timeout: 60_000 })
  await expect(page.getByRole('button', { name: '新建会话' })).toBeEnabled()
})
