// The credential port of this package over a real settings-local secret vault: the credential
// conformance suite of model-contract, and the Cordis service that serves the port.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { access, accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import { checkCredentialPortConformance } from '@omne-harness/model-contract/conformance'
import type { CredentialTarget } from '@omne-harness/model-contract/conformance'
import { MODEL_SEND, type CredentialPort } from '@omne-harness/model-contract/provider'
import { ModelCredentialService } from '@omne-harness/model-cordis-contract/cordis'
import { parseSecretText, type SecretCustodyUse, type SecretScope } from '@omne-harness/settings'
import { createSecretVault, type SecretVault } from '@omne-harness/settings-local/secrets'
import { afterAll, expect, it } from 'vitest'
import { serveModelCredential } from '../src/cordis.ts'
import { createSecretCredentialPort } from '../src/index.ts'
import { providerName, testKeyOf } from './support/credentials.ts'

const directories: string[] = []
afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
})

function vaultAt(label: string): SecretVault {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-')))
  directories.push(directory)
  const created = createSecretVault({ path: join(directory, `${label}.json`) })
  if (created.kind !== 'open') throw new Error(`test vault: ${created.kind}`)
  return created.vault
}

function identity(suffix: string) {
  const account = accountCodec.parse(`acc_abcdefghjkmnpqrstvwxyz234${suffix}`)
  const organization = organizationCodec.parse(`org_abcdefghjkmnpqrstvwxyz234${suffix}`)
  if (!account.ok || !organization.ok) throw new Error('fixture identity')
  return tenant(organization.value, account.value)
}

function secretText(secret: string) {
  const parsed = parseSecretText(secret)
  if (!parsed.ok) throw new Error('invalid test secret')
  return parsed.value
}

const PROVIDER = providerName('suite-gateway')
const BARE = providerName('suite-local')
const ITEMS = ['apiKey', 'organization'] as const

/** A fresh vault, the port over it, and the controls that write the vault as an operator would. */
function subject(label: string) {
  const vault = vaultAt(label)
  let unavailable = false
  // The use and read faces answer `unavailable` while the test says the source is down.
  const custody: Pick<SecretVault, 'describe'> & SecretCustodyUse = {
    describe: key => (unavailable ? 'unavailable' : vault.describe(key)),
    use: key => (unavailable ? 'unavailable' : vault.use(key)),
  }
  const keyOf = testKeyOf('suite-gateway')
  const port = createSecretCredentialPort<string>({
    custody,
    providers: new Map([
      [PROVIDER, { items: ITEMS, official: true, keyOf }],
      [BARE, { items: [], official: true, keyOf: testKeyOf('suite-local') }],
    ]),
  })
  const keyOfTarget = (target: CredentialTarget) => {
    const scope: SecretScope = target.scope
    return keyOf(scope, target.item)
  }
  const same =
    (target: CredentialTarget) => (record: { key: { target: unknown; scope: unknown } }) =>
      JSON.stringify(record.key) === JSON.stringify(keyOfTarget(target))
  const relife = (target: CredentialTarget, life: 'revoked' | 'unreadable') =>
    vault.revise(bindings =>
      bindings.map(record =>
        same(target)(record) && (life === 'revoked' || record.life === 'active')
          ? { ...record, life }
          : record,
      ),
    )
  return {
    port,
    access: access('principal-a', identity('5')),
    otherAccess: access('principal-b', identity('6')),
    provider: PROVIDER,
    bareProvider: BARE,
    items: ITEMS,
    secrets: ['synthetic-key-value', 'synthetic-organization-value'] as const,
    rotatedSecret: 'synthetic-rotated-value',
    controls: {
      bind: (target: CredentialTarget, secret: string) => {
        vault.bind(keyOfTarget(target), secretText(secret), null)
      },
      unbind: (target: CredentialTarget) => {
        vault.unbind(keyOfTarget(target))
      },
      rotate: (target: CredentialTarget, secret: string) => {
        vault.revise(bindings =>
          bindings.map(record =>
            same(target)(record) ? { ...record, secret: secretText(secret) } : record,
          ),
        )
      },
      revoke: (target: CredentialTarget) => {
        relife(target, 'revoked')
      },
      markUnreadable: (target: CredentialTarget) => {
        relife(target, 'unreadable')
      },
      setUnavailable: (value: boolean) => {
        unavailable = value
      },
      close: () => vault.close(),
    },
    dispose: () => vault.close(),
  }
}

it('passes every credential conformance obligation over a real secret vault', async () => {
  let made = 0
  const report = await checkCredentialPortConformance({
    subject: () => subject(`suite-${(made += 1)}`),
  })
  expect(report.results.filter(result => result.status === 'fail')).toEqual([])
  expect(report.ok).toBe(true)
})

it('denies an unknown provider and another purpose without reading the vault', async () => {
  const { port, access: own } = subject('unknown')
  const unknown = providerName('elsewhere')
  expect(port.layerOf({ provider: unknown, official: true, access: own })).toEqual({
    failure: { kind: 'denied' },
  })
  expect(
    port.resolve({
      provider: unknown,
      layer: { layer: 'tenant' },
      purpose: MODEL_SEND,
      access: own,
    }),
  ).toEqual({ failure: { kind: 'denied' } })
})

it('answers unavailable for a binding that the vault no longer serves between read and use', () => {
  const vault = vaultAt('race')
  const keyOf = testKeyOf('suite-gateway')
  const own = access('principal-a', identity('5'))
  const scope: SecretScope = { layer: 'tenant', tenant: own.tenant }
  for (const item of ITEMS) vault.bind(keyOf(scope, item), secretText(`synthetic-${item}`), null)
  // The read face still sees the binding; the use face no longer serves it.
  const port = createSecretCredentialPort<string>({
    custody: { describe: key => vault.describe(key), use: () => 'missing' },
    providers: new Map([[PROVIDER, { items: ITEMS, official: true, keyOf }]]),
  })
  expect(
    port.resolve({
      provider: PROVIDER,
      layer: { layer: 'tenant' },
      purpose: MODEL_SEND,
      access: own,
    }),
  ).toEqual({ failure: { kind: 'unavailable' } })
})

it('does not read the official layer once the tenant holds an item', () => {
  const vault = vaultAt('tenant-only')
  const keyOf = testKeyOf('suite-gateway')
  const own = access('principal-a', identity('5'))
  const scope: SecretScope = { layer: 'tenant', tenant: own.tenant }
  for (const item of ITEMS) vault.bind(keyOf(scope, item), secretText(`synthetic-${item}`), null)
  // A custody whose official layer cannot be read: the tenant's complete layer still serves.
  const official = (key: Parameters<typeof vault.describe>[0]) => key.scope.layer === 'official'
  const port = createSecretCredentialPort<string>({
    custody: {
      describe: key => (official(key) ? 'unavailable' : vault.describe(key)),
      use: key => (official(key) ? 'unavailable' : vault.use(key)),
    },
    providers: new Map([[PROVIDER, { items: ITEMS, official: true, keyOf }]]),
  })
  expect(port.layerOf({ provider: PROVIDER, official: true, access: own })).toEqual({
    ok: { layer: 'tenant' },
  })
})

it('serves the port as modelCredential through the real Cordis proxy and withdraws it with the fiber', async () => {
  const calls: string[] = []
  const port: CredentialPort = {
    layerOf: () => {
      calls.push('layerOf')
      return { ok: { layer: 'official' } }
    },
    resolve: () => {
      calls.push('resolve')
      return { ok: new Map([['apiKey', 'synthetic']]) }
    },
  }
  const ctx = new Context()
  const fiber = await ctx.plugin({
    name: 'test-credential',
    apply: child => void serveModelCredential(child, port),
  })
  const service = ctx.modelCredential
  expect(service).toBeInstanceOf(ModelCredentialService)
  const own = access('principal-a', identity('5'))
  expect(service?.layerOf({ provider: PROVIDER, official: true, access: own })).toEqual({
    ok: { layer: 'official' },
  })
  expect(
    service?.resolve({
      provider: PROVIDER,
      layer: { layer: 'official' },
      purpose: MODEL_SEND,
      access: own,
    }),
  ).toEqual({ ok: new Map([['apiKey', 'synthetic']]) })
  expect(calls).toEqual(['layerOf', 'resolve'])
  // Besides the two members of every Cordis service, the instance exposes the two operations.
  expect(Object.keys(service ?? {}).sort()).toEqual(['ctx', 'layerOf', 'name', 'resolve'])
  await fiber.dispose()
  expect(ctx.modelCredential).toBeUndefined()
})
