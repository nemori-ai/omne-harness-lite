import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assetsProtocol } from '@omne-harness/assets-protocol'
import { identityProtocol } from '@omne-harness/identity-protocol'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { createClient, createHttpProtocolTransport } from '@omne-harness/sdk/core'
import type { Page } from '@playwright/test'
import { PASSWORD } from './desk.ts'
import { expect } from './desktop.ts'

// Publishing as a tenant does, over the assets protocol, and wearing a look on the assets page.
const FIXTURES = fileURLToPath(new URL('./fixtures/tenant-plugins', import.meta.url))

export type Assets = ReturnType<typeof createClient<typeof assetsProtocol>>

export const BUILTIN = '自带的样子'

export async function assetsOf(origin: string, name: string) {
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
export async function publish(assets: Assets, tenant: TenantId, category: string, name: string) {
  const dir = join(FIXTURES, name)
  const encoder = new TextEncoder()
  const paths = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter(path =>
    statSync(join(dir, path)).isFile(),
  )
  const files = paths.map(path => ({
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

/** Wears a skin, or the built-in look, where a person does: the skin category of the assets page. */
export async function wear(page: Page, choice: string): Promise<void> {
  await page.getByRole('link', { name: '资产' }).click()
  await page.getByRole('tab', { name: '皮肤' }).click()
  const radio = page.getByRole('radio', { name: choice })
  await expect(radio).toBeEnabled({ timeout: 30_000 })
  await radio.click()
  await expect(page.locator('label.plugin-skin', { has: radio })).toContainText('在用', {
    timeout: 30_000,
  })
}
