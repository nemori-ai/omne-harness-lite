// Binding management of the local custody (docs/cordis.md「绑定管理」): bind, unbind and describe,
// the time of a binding, the empty deployment default, and the managed plugin handle. Every case
// scans its visible results for the secret sentinel.
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import type { CredentialId } from '@omne-harness/model-contract'
import {
  MODEL_SEND,
  decodeCredentialId,
  type CredentialReference,
  type QualifiedCredentialQuery,
} from '@omne-harness/model-contract/provider'
import { ModelCredentialService } from '@omne-harness/model-cordis-contract/cordis'
import { describe, expect, it } from 'vitest'
import { createLocalCredentialPlugin } from '../src/cordis.ts'
import { createLocalCustodian } from '../src/index.ts'

const SENTINEL = 'sk-sentinel-tenant-7f3a'
const ROTATED = 'sk-sentinel-rotated-91c2'
const FACTORY = 'sk-sentinel-factory-55d0'
const AT = '2026-11-04T08:00:00Z'
const LATER = '2026-11-04T09:30:00Z'

function identity(suffix: string): TenantId {
  const account = accountCodec.parse(`acc_abcdefghjkmnpqrstvwxyz234${suffix}`)
  const organization = organizationCodec.parse(`org_abcdefghjkmnpqrstvwxyz234${suffix}`)
  if (!account.ok || !organization.ok) throw new Error('fixture identity')
  return tenant(organization.value, account.value)
}
const tenantA = identity('5')
const tenantB = identity('6')

function credentialId(text: string): CredentialId {
  const decoded = decodeCredentialId(text)
  if (!('ok' in decoded)) throw new Error(`fixture credential id ${text}`)
  return decoded.ok
}
const ownId = credentialId('tenant-a-send')
const factoryId = credentialId('factory-openrouter')
const ref = (overrides: Partial<CredentialReference> = {}): CredentialReference => ({
  id: ownId,
  tenant: tenantA,
  purpose: MODEL_SEND,
  ...overrides,
})
const query = (
  id: CredentialId,
  who: TenantId = tenantA,
  official = true,
): QualifiedCredentialQuery<unknown> => ({
  id,
  purpose: MODEL_SEND,
  official,
  access: { tenant: who, principal: null },
})

function store(factorySecret = FACTORY) {
  const path = join(realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-mgmt-'))), 'store.json')
  return { path, custodian: createLocalCustodian({ path, factorySecret }) }
}

const shown = (value: unknown) => JSON.stringify(value)

describe('bind', () => {
  it('a bound tenant secret is what the next send resolves, and the time is kept', () => {
    const { custodian } = store()
    expect(custodian.bind({ reference: ref(), secret: SENTINEL, configuredAt: AT })).toEqual({
      kind: 'written',
    })
    expect(custodian.presentFor(query(ownId))).toMatchObject({ kind: 'known', present: true })
    expect(custodian.resolveFor(query(ownId))).toEqual({
      kind: 'value',
      scope: 'tenant',
      value: SENTINEL,
    })
    const view = custodian.describe({ reference: ref() })
    expect(view).toEqual({ kind: 'bound', life: 'active', configuredAt: AT })
    expect(shown(view)).not.toContain(SENTINEL)
  })

  it('a text that is not a secret text is denied without a throw, and the file keeps its bytes', () => {
    const { path, custodian } = store()
    const before = readFileSync(path, 'utf8')
    for (const text of ['', '   ', 'a\u0007b', 'k'.repeat(4097)]) {
      expect(
        custodian.bind({ reference: ref(), secret: text, configuredAt: AT }),
        JSON.stringify(text.slice(0, 16)),
      ).toEqual({ kind: 'denied' })
    }
    expect(readFileSync(path, 'utf8')).toBe(before)
    expect(custodian.describe({ reference: ref() })).toEqual({ kind: 'unbound' })
    // The whitespace around a secret text is not part of it: the binding holds the trimmed text.
    expect(
      custodian.bind({ reference: ref(), secret: ` ${SENTINEL}\t`, configuredAt: AT }),
    ).toEqual({ kind: 'written' })
    expect(custodian.resolveFor(query(ownId))).toMatchObject({ value: SENTINEL })
  })

  it('binding again replaces the secret and the time', () => {
    const { custodian } = store()
    custodian.bind({ reference: ref(), secret: SENTINEL, configuredAt: AT })
    custodian.bind({ reference: ref(), secret: ROTATED, configuredAt: LATER })
    expect(custodian.resolveFor(query(ownId))).toMatchObject({ value: ROTATED })
    expect(custodian.describe({ reference: ref() })).toEqual({
      kind: 'bound',
      life: 'active',
      configuredAt: LATER,
    })
  })

  it('a bound tenant no longer gets the deployment default for an official profile', () => {
    const { custodian } = store()
    expect(custodian.resolveFor(query(factoryId))).toMatchObject({ scope: 'factory' })
    custodian.bind({ reference: ref(), secret: SENTINEL, configuredAt: AT })
    expect(custodian.resolveFor(query(factoryId))).toEqual({ kind: 'absent' })
  })

  it('an id that another tenant holds is denied and that binding stays as it was', () => {
    const { custodian, path } = store()
    custodian.bind({ reference: ref({ tenant: tenantB }), secret: ROTATED, configuredAt: AT })
    const before = readFileSync(path, 'utf8')
    expect(custodian.bind({ reference: ref(), secret: SENTINEL, configuredAt: LATER })).toEqual({
      kind: 'denied',
    })
    expect(custodian.unbind({ reference: ref() })).toEqual({ kind: 'denied' })
    expect(custodian.describe({ reference: ref() })).toEqual({ kind: 'denied' })
    expect(readFileSync(path, 'utf8')).toBe(before)
    expect(custodian.resolveFor(query(ownId, tenantB, false))).toMatchObject({ value: ROTATED })
  })

  it('an unminted tenant is denied before the store is read', () => {
    const { custodian, path } = store()
    const copied = { ...tenantA } as TenantId
    const before = readFileSync(path, 'utf8')
    expect(
      custodian.bind({ reference: ref({ tenant: copied }), secret: SENTINEL, configuredAt: AT }),
    ).toEqual({ kind: 'denied' })
    expect(custodian.describe({ reference: ref({ tenant: copied }) })).toEqual({ kind: 'denied' })
    expect(readFileSync(path, 'utf8')).toBe(before)
  })

  it('an unreadable store is not-written and keeps its bytes; describe is unavailable', () => {
    const { custodian, path } = store()
    writeFileSync(path, 'not-json')
    expect(custodian.bind({ reference: ref(), secret: SENTINEL, configuredAt: AT })).toEqual({
      kind: 'not-written',
    })
    expect(custodian.unbind({ reference: ref() })).toEqual({ kind: 'not-written' })
    expect(custodian.describe({ reference: ref() })).toEqual({ kind: 'unavailable' })
    expect(readFileSync(path, 'utf8')).toBe('not-json')
  })
})

describe('unbind', () => {
  it('after unbind the tenant is missing: no tenant secret, and the default applies again', () => {
    const { custodian } = store()
    custodian.bind({ reference: ref(), secret: SENTINEL, configuredAt: AT })
    expect(custodian.unbind({ reference: ref() })).toEqual({ kind: 'written' })
    expect(custodian.presentFor(query(ownId))).toMatchObject({ kind: 'known', present: false })
    expect(custodian.resolveFor(query(ownId, tenantA, false))).toEqual({ kind: 'absent' })
    expect(custodian.resolveFor(query(factoryId))).toEqual({
      kind: 'value',
      scope: 'factory',
      value: FACTORY,
    })
    expect(custodian.describe({ reference: ref() })).toEqual({ kind: 'unbound' })
    expect(custodian.unbind({ reference: ref() })).toEqual({ kind: 'absent' })
  })

  it('with an empty deployment default, a tenant without a binding has no credential at all', () => {
    const { custodian } = store('')
    expect(custodian.resolveFor(query(factoryId))).toEqual({ kind: 'absent' })
    expect(custodian.resolve(ref({ id: factoryId }), { authorized: true, official: true })).toEqual(
      { kind: 'absent' },
    )
    custodian.bind({ reference: ref(), secret: SENTINEL, configuredAt: AT })
    custodian.unbind({ reference: ref() })
    expect(custodian.resolveFor(query(factoryId))).toEqual({ kind: 'absent' })
    expect(custodian.diagnostics().at(-1)).toMatchObject({ stage: 'resolve', outcome: 'absent' })
  })

  it('an unreadable binding answers unreadable and does not fall back to the default', () => {
    const { custodian } = store()
    custodian.bind({ reference: ref(), secret: SENTINEL, configuredAt: AT })
    custodian.markUnreadable(ref())
    expect(custodian.resolveFor(query(ownId))).toEqual({ kind: 'unreadable' })
    expect(custodian.resolveFor(query(factoryId))).toEqual({ kind: 'absent' })
    const view = custodian.describe({ reference: ref() })
    expect(view).toEqual({ kind: 'bound', life: 'unreadable', configuredAt: AT })
    expect(shown(view)).not.toContain(SENTINEL)
    expect(shown(custodian.diagnostics())).not.toContain(SENTINEL)
    expect(shown(custodian.diagnostics())).not.toContain(FACTORY)
  })
})

describe('snapshots', () => {
  it('a snapshot written before the time field loads, and shows no time', () => {
    const { custodian, path } = store()
    custodian.put(ref(), SENTINEL)
    const stored = JSON.parse(readFileSync(path, 'utf8'))
    expect(stored.bindings[0]).not.toHaveProperty('configuredAt')
    expect(custodian.describe({ reference: ref() })).toEqual({ kind: 'bound', life: 'active' })
  })

  it('a time that is not text makes the snapshot corrupt', () => {
    const { custodian, path } = store()
    custodian.bind({ reference: ref(), secret: SENTINEL, configuredAt: AT })
    const stored = JSON.parse(readFileSync(path, 'utf8'))
    stored.bindings[0].configuredAt = 42
    writeFileSync(path, JSON.stringify(stored))
    expect(custodian.describe({ reference: ref() })).toEqual({ kind: 'unavailable' })
    expect(custodian.resolveFor(query(ownId))).toEqual({ kind: 'unavailable' })
  })
})

describe('the managed plugin', () => {
  it('reaches the live custodian only while the plugin lives', async () => {
    const { plugin, custody } = createLocalCredentialPlugin()
    const path = join(realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-plugin-'))), 's.json')
    const input = { reference: ref(), secret: SENTINEL, configuredAt: AT }
    expect(custody.bind(input)).toEqual({ kind: 'not-written' })
    expect(custody.describe({ reference: ref() })).toEqual({ kind: 'unavailable' })

    const ctx = new Context()
    const fiber = await ctx.plugin(plugin, { path, factorySecret: '' })
    const service = ctx.modelCredential
    expect(service).toBeInstanceOf(ModelCredentialService)
    expect(Object.keys(service ?? {})).not.toContain('bind')
    expect(custody.bind(input)).toEqual({ kind: 'written' })
    expect(service?.resolveFor?.(query(ownId))).toMatchObject({ kind: 'value', value: SENTINEL })
    expect(custody.describe({ reference: ref() })).toMatchObject({ kind: 'bound' })

    await fiber.dispose()
    expect(custody.bind(input)).toEqual({ kind: 'not-written' })
    expect(custody.unbind({ reference: ref() })).toEqual({ kind: 'not-written' })
    expect(custody.describe({ reference: ref() })).toEqual({ kind: 'unavailable' })
  })

  it('a store that cannot be opened leaves the handle not-written', async () => {
    const { plugin, custody } = createLocalCredentialPlugin()
    const path = join(realpathSync(mkdtempSync(join(tmpdir(), 'model-cred-plugin-'))), 's.json')
    writeFileSync(path, 'not-json')
    const ctx = new Context()
    const fiber = await ctx.plugin(plugin, { path, factorySecret: '' })
    expect(custody.bind({ reference: ref(), secret: SENTINEL, configuredAt: AT })).toEqual({
      kind: 'not-written',
    })
    expect(readFileSync(path, 'utf8')).toBe('not-json')
    await fiber.dispose()
  })
})
