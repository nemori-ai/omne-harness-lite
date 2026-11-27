import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import type { EndpointHolding } from '@omne-harness/mcp-contract'
import { parseSecretText } from '@omne-harness/settings'
import { createSecretVault } from '@omne-harness/settings-local/secrets'
import { credentialKey } from '../../../src/rows/mcp/credential.ts'
import { createGrantSecrets, grantSecretKey } from '../../../src/rows/mcp/grant-secrets.ts'

function tenantOf(last: string): TenantId {
  const organization = organizationCodec.parse(`org_0123456789abcdefghjkmnpqr${last}`)
  const account = accountCodec.parse(`acc_0123456789abcdefghjkmnpqr${last}`)
  if (!organization.ok || !account.ok) throw new TypeError('bad tenant sample')
  return tenant(organization.value, account.value)
}

function vault() {
  const created = createSecretVault({
    path: join(realpathSync(mkdtempSync(join(tmpdir(), 'grant-secrets-'))), 'vault.json'),
  })
  if (created.kind !== 'open') throw new Error(`vault: ${created.kind}`)
  return created.vault
}

const key = { tenant: tenantOf('s'), holding: 'held-desk' as EndpointHolding, endpoint: 'desk' }

it('the bindings MCP writes as a custodian and the one the person writes share a target and never see each other', async () => {
  const custody = vault()
  const secrets = createGrantSecrets(() => custody)
  const personal = parseSecretText('person-typed-key')
  if (!personal.ok) throw new Error('sample')
  expect(custody.bind(credentialKey(key.tenant, 'desk'), personal.value, null)).toBe('written')
  expect(await secrets.read({ kind: 'access', key })).toEqual({ ok: 'absent' })
  expect(await secrets.write({ kind: 'access', key }, 'at-1')).toEqual({ ok: true })
  expect(await secrets.write({ kind: 'refresh', key }, 'rt-1')).toEqual({ ok: true })
  expect(await secrets.read({ kind: 'access', key })).toEqual({ ok: 'at-1' })
  expect(await secrets.read({ kind: 'refresh', key })).toEqual({ ok: 'rt-1' })
  expect(custody.use(credentialKey(key.tenant, 'desk'))).toEqual({
    kind: 'secret',
    value: 'person-typed-key',
  })
  expect(grantSecretKey({ kind: 'access', key }).target).toEqual(
    credentialKey(key.tenant, 'desk').target,
  )
  expect(await secrets.remove({ kind: 'access', key })).toEqual({ ok: true })
  expect(await secrets.read({ kind: 'access', key })).toEqual({ ok: 'absent' })
  expect(custody.use(credentialKey(key.tenant, 'desk'))).toEqual({
    kind: 'secret',
    value: 'person-typed-key',
  })
  expect(await secrets.read({ kind: 'access', key: { ...key, tenant: tenantOf('t') } })).toEqual({
    ok: 'absent',
  })
})

it('a token longer than a typed secret is kept; one past the custodian bound, or a custody that is away, is unavailable', async () => {
  const custody = vault()
  const secrets = createGrantSecrets(() => custody)
  const long = 'j'.repeat(9000)
  expect(await secrets.write({ kind: 'access', key }, long)).toEqual({ ok: true })
  expect(await secrets.read({ kind: 'access', key })).toEqual({ ok: long })
  expect(await secrets.write({ kind: 'access', key }, 'j'.repeat(16_385))).toEqual({
    failure: 'unavailable',
  })
  expect(
    await secrets.write(
      { kind: 'client', tenant: key.tenant, issuer: 'https://auth.example' },
      'cs-1',
    ),
  ).toEqual({ ok: true })
  expect(
    await secrets.read({ kind: 'client', tenant: key.tenant, issuer: 'https://auth.example' }),
  ).toEqual({ ok: 'cs-1' })
  const away = createGrantSecrets(() => undefined)
  expect(await away.read({ kind: 'access', key })).toEqual({ failure: 'unavailable' })
  expect(await away.write({ kind: 'access', key }, 'x')).toEqual({ failure: 'unavailable' })
  expect(await away.remove({ kind: 'access', key })).toEqual({ failure: 'unavailable' })
})
