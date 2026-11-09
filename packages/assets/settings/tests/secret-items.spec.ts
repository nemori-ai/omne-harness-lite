// The secret-item entry (SPEC「秘密设置项」): which items it lets through to the custody, how it derives
// the binding key from the holding and the item, and that no answer carries the secret. The custody
// is an in-memory double of `SecretCustodyManagement`; it proves the mapping, not a vault file.
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { parseInstant, type Instant } from '@omne-harness/utc-instant'
import { describe, expect, it, vi } from 'vitest'
import {
  createSettingsRegistry,
  createSettingsSecretItems,
  parseSecretText,
  type SecretBindingKey,
  type SecretCustodyManagement,
  type SecretPresence,
  type SecretRemoveResult,
  type SecretScope,
  type SecretText,
  type SecretWriteResult,
  type SettingDefinitions,
  type SettingsHoldingRef,
} from '../src/index.ts'

const presentation = {
  title: 'Exa API key',
  description: 'The key search sends to Exa.',
  impact: 'The next search uses the new key.',
  clear: 'search is unconfigured until a key is set again.',
  adoption: 'next-read',
} as const

function definition(providerId: string, definitionId: string, version = '1'): SettingDefinitions {
  return {
    providerId,
    definitionId,
    version,
    groups: [{ id: 'tool', parentId: null, title: 'Tool', description: 'Tool settings', order: 0 }],
    items: [
      {
        id: 'exa.apiKey',
        groupId: 'tool',
        category: 'binding',
        presentation,
        valueSchema: { type: 'string' },
        default: { kind: 'absent' },
        merge: 'override',
        sensitivity: 'secret',
      },
      {
        id: 'limits.lines',
        groupId: 'tool',
        category: 'preference',
        presentation: { ...presentation, title: 'Lines', unit: 'lines' },
        valueSchema: { type: 'integer' },
        default: { kind: 'value', value: 10 },
        merge: 'override',
        sensitivity: 'ordinary',
      },
    ],
  }
}

function tenant(account: string): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: `org_${'0'.repeat(26)}`,
      account: `acc_${account.repeat(26)}`,
    }),
  )
  if (!parsed.ok) throw new Error('tenant fixture')
  return parsed.value
}
const tenantA: SecretScope = { layer: 'tenant', tenant: tenant('a') }
const tenantB: SecretScope = { layer: 'tenant', tenant: tenant('b') }
const official: SecretScope = { layer: 'official' }

function secret(text: string): SecretText {
  const parsed = parseSecretText(text)
  if (!parsed.ok) throw new Error('secret fixture')
  return parsed.value
}
const SENTINEL = 'exa-SENTINEL-0123456789'

const scopeText = (scope: SecretScope) => {
  if (scope.layer === 'official') return 'official'
  const encoded = tenantCodec.encode(scope.tenant)
  if (!encoded.ok) throw new Error('tenant fixture')
  return `tenant:${encoded.value}`
}
const keyText = (key: SecretBindingKey) =>
  JSON.stringify([scopeText(key.scope), key.target.owner, key.target.key, key.purpose])

/** An in-memory custody: a map from the key text to the presence. No value is kept. */
function memoryCustody(answers: Partial<{ bind: SecretWriteResult }> = {}) {
  const bindings = new Map<string, SecretPresence>()
  const custody: SecretCustodyManagement = {
    bind: vi.fn(
      (
        key: SecretBindingKey,
        _secret: SecretText,
        configuredAt: Instant | null,
      ): SecretWriteResult => {
        if (answers.bind !== undefined && answers.bind !== 'written') return answers.bind
        bindings.set(keyText(key), { kind: 'bound', life: 'active', configuredAt })
        return 'written'
      },
    ),
    unbind: vi.fn((key: SecretBindingKey): SecretRemoveResult =>
      bindings.delete(keyText(key)) ? 'removed' : 'absent',
    ),
    describe: vi.fn(
      (key: SecretBindingKey): SecretPresence | 'denied' | 'unavailable' =>
        bindings.get(keyText(key)) ?? { kind: 'unbound' },
    ),
    list: vi.fn(() => ({ entries: [], next: null })),
  }
  return { custody, bindings }
}

const webHolding = { providerId: 'tool:web-owner', definitionId: 'Web' }
const web: SettingsHoldingRef = { asset: { category: 'tool', name: 'Web' }, holding: webHolding }

function fixture(input: {
  definitions?: readonly SettingDefinitions[]
  holdings?: readonly SettingsHoldingRef[]
  bind?: SecretWriteResult
}) {
  const registry = createSettingsRegistry({ capacity: 8 })
  for (const entry of input.definitions ?? [definition(webHolding.providerId, 'Web')]) {
    const registered = registry.registerContribution(entry)
    if (registered.kind !== 'registered') throw new Error(registered.kind)
  }
  const { custody, bindings } = memoryCustody(input.bind === undefined ? {} : { bind: input.bind })
  const holdings = input.holdings ?? [web]
  const items = createSettingsSecretItems({
    declarations: registry,
    custody,
    resolve: asset =>
      holdings.filter(
        candidate =>
          asset === undefined ||
          (candidate.asset.name === asset.name &&
            (asset.category === undefined || candidate.asset.category === asset.category)),
      ),
  })
  return { items, custody, bindings, registry }
}
const exaKey = { asset: { category: 'tool', name: 'Web' }, itemId: 'exa.apiKey' }
const lines = { asset: { category: 'tool', name: 'Web' }, itemId: 'limits.lines' }

describe('createSettingsSecretItems: set', () => {
  it('hands a declared secret item to the custody as (scope, target, setting) and passes the result through', () => {
    const at = parseInstant('2026-11-10T10:00:00Z')
    if (!at.ok) throw new Error('instant fixture')
    const { items, custody } = fixture({})
    expect(
      items.set({ scope: tenantA, item: exaKey, secret: secret(SENTINEL), at: at.value }),
    ).toBe('written')
    expect(custody.bind).toHaveBeenCalledTimes(1)
    const [key, value, configuredAt] = vi.mocked(custody.bind).mock.calls[0]!
    expect(key.scope).toBe(tenantA)
    expect(key.purpose).toBe('setting')
    expect(key.target.owner).toBe('setting')
    expect(value).toBe(SENTINEL)
    expect(configuredAt).toBe(at.value)
    expect(items.describe({ scope: tenantA, item: exaKey })).toEqual({
      kind: 'bound',
      life: 'active',
      configuredAt: at.value,
    })
  })

  it.each(['not-written', 'unconfirmed', 'denied'] as const)(
    'passes %s through unchanged',
    bind => {
      const { items } = fixture({ bind })
      expect(items.set({ scope: tenantA, item: exaKey, secret: secret(SENTINEL), at: null })).toBe(
        bind,
      )
    },
  )

  it('answers undeclared for an unknown asset or item, not-secret for an ordinary item, and does not call the custody', () => {
    const { items, custody } = fixture({})
    const unknownAsset = { asset: { category: 'tool', name: 'Shell' }, itemId: 'exa.apiKey' }
    const unknownItem = { asset: { category: 'tool', name: 'Web' }, itemId: 'exa.endpoint' }
    const value = secret(SENTINEL)
    expect(items.set({ scope: tenantA, item: unknownAsset, secret: value, at: null })).toBe(
      'undeclared',
    )
    expect(items.set({ scope: tenantA, item: unknownItem, secret: value, at: null })).toBe(
      'undeclared',
    )
    expect(items.set({ scope: tenantA, item: lines, secret: value, at: null })).toBe('not-secret')
    expect(items.clear({ scope: tenantA, item: unknownAsset })).toBe('undeclared')
    expect(items.clear({ scope: tenantA, item: lines })).toBe('not-secret')
    expect(items.describe({ scope: tenantA, item: unknownItem })).toBe('undeclared')
    expect(items.describe({ scope: tenantA, item: lines })).toBe('not-secret')
    expect(custody.bind).not.toHaveBeenCalled()
    expect(custody.unbind).not.toHaveBeenCalled()
    expect(custody.describe).not.toHaveBeenCalled()
  })

  it('answers conflict when the asset reference names more than one holding', () => {
    const other: SettingsHoldingRef = {
      asset: { category: 'skill', name: 'Web' },
      holding: { providerId: 'skill-owner', definitionId: 'Web' },
    }
    const { items, custody } = fixture({
      definitions: [definition(webHolding.providerId, 'Web'), definition('skill-owner', 'Web')],
      holdings: [web, other],
    })
    const ambiguous = { asset: { name: 'Web' }, itemId: 'exa.apiKey' }
    expect(items.set({ scope: tenantA, item: ambiguous, secret: secret(SENTINEL), at: null })).toBe(
      'conflict',
    )
    expect(items.clear({ scope: tenantA, item: ambiguous })).toBe('conflict')
    expect(items.describe({ scope: tenantA, item: ambiguous })).toBe('conflict')
    expect(items.items({ scope: tenantA, asset: { name: 'Web' } })).toBe('conflict')
    expect(items.set({ scope: tenantA, item: exaKey, secret: secret(SENTINEL), at: null })).toBe(
      'written',
    )
    expect(custody.bind).toHaveBeenCalledTimes(1)
  })
})

describe('createSettingsSecretItems: target derivation', () => {
  function targetOf(holdings: readonly SettingsHoldingRef[], definitions: SettingDefinitions[]) {
    const { items, custody } = fixture({ definitions, holdings })
    expect(items.set({ scope: tenantA, item: exaKey, secret: secret(SENTINEL), at: null })).toBe(
      'written',
    )
    return vi.mocked(custody.bind).mock.calls[0]![0]
  }

  it('gives the same asset name under two holdings two targets, and the same holding one target', () => {
    const first = targetOf([web], [definition(webHolding.providerId, 'Web')])
    const again = targetOf([web], [definition(webHolding.providerId, 'Web', '2')])
    const replaced = targetOf(
      [{ asset: web.asset, holding: { providerId: 'tool:other-owner', definitionId: 'Web' } }],
      [definition('tool:other-owner', 'Web')],
    )
    expect(again.target).toEqual(first.target)
    expect(replaced.target).not.toEqual(first.target)
    expect([first, again, replaced].map(key => key.purpose)).toEqual([
      'setting',
      'setting',
      'setting',
    ])
  })

  it('does not let values that share a boundary collide, and keeps the three parts apart', () => {
    // A Settings id may hold `.`, `:`, `/` and `-`; none of them is a boundary of the encoding.
    const left = targetOf(
      [{ asset: web.asset, holding: { providerId: 'p:x', definitionId: 'd' } }],
      [definition('p:x', 'd')],
    )
    const right = targetOf(
      [{ asset: web.asset, holding: { providerId: 'p', definitionId: 'x:d' } }],
      [definition('p', 'x:d')],
    )
    expect(left.target).not.toEqual(right.target)
    expect(left.target).toEqual({
      owner: 'setting',
      key: JSON.stringify(['p:x', 'd', 'exa.apiKey']),
    })
    expect(JSON.parse(right.target.key)).toEqual(['p', 'x:d', 'exa.apiKey'])
  })
})

describe('createSettingsSecretItems: describe and items', () => {
  it('reads the custody now, keeps tenants apart, and shows no value', () => {
    const { items, bindings } = fixture({})
    expect(items.describe({ scope: tenantA, item: exaKey })).toEqual({ kind: 'unbound' })
    expect(items.set({ scope: tenantA, item: exaKey, secret: secret(SENTINEL), at: null })).toBe(
      'written',
    )
    expect(items.describe({ scope: tenantA, item: exaKey })).toMatchObject({ kind: 'bound' })
    expect(items.describe({ scope: tenantB, item: exaKey })).toEqual({ kind: 'unbound' })
    expect(items.describe({ scope: official, item: exaKey })).toEqual({ kind: 'unbound' })
    expect(JSON.stringify(items.describe({ scope: tenantA, item: exaKey }))).not.toContain(SENTINEL)
    expect(JSON.stringify(items.items({ scope: tenantA }))).not.toContain(SENTINEL)
    // The custody is the one fact: a binding removed behind the entry is unbound at once.
    bindings.clear()
    expect(items.describe({ scope: tenantA, item: exaKey })).toEqual({ kind: 'unbound' })
  })

  it('passes the custody answers of describe through', () => {
    const { items, custody } = fixture({})
    vi.mocked(custody.describe).mockReturnValueOnce('denied').mockReturnValueOnce('unavailable')
    expect(items.describe({ scope: tenantA, item: exaKey })).toBe('denied')
    expect(items.describe({ scope: tenantA, item: exaKey })).toBe('unavailable')
    vi.mocked(custody.describe).mockReturnValueOnce('unavailable')
    expect(items.items({ scope: tenantA })).toBe('unavailable')
  })

  it('clears through the custody and answers absent for a second clear', () => {
    const { items } = fixture({})
    expect(items.set({ scope: tenantA, item: exaKey, secret: secret(SENTINEL), at: null })).toBe(
      'written',
    )
    expect(items.clear({ scope: tenantA, item: exaKey })).toBe('removed')
    expect(items.clear({ scope: tenantA, item: exaKey })).toBe('absent')
    expect(items.describe({ scope: tenantA, item: exaKey })).toEqual({ kind: 'unbound' })
  })

  it('lists every item of the registered definitions, with the presence of the secret ones only', () => {
    const { items } = fixture({})
    expect(items.set({ scope: tenantA, item: exaKey, secret: secret(SENTINEL), at: null })).toBe(
      'written',
    )
    expect(items.items({ scope: tenantA })).toEqual([
      {
        asset: { category: 'tool', name: 'Web' },
        itemId: 'exa.apiKey',
        title: 'Exa API key',
        sensitivity: 'secret',
        presence: { kind: 'bound', life: 'active', configuredAt: null },
      },
      {
        asset: { category: 'tool', name: 'Web' },
        itemId: 'limits.lines',
        title: 'Lines',
        sensitivity: 'ordinary',
      },
    ])
    expect(items.items({ scope: tenantB })).toMatchObject([
      { itemId: 'exa.apiKey', presence: { kind: 'unbound' } },
      { itemId: 'limits.lines' },
    ])
    expect(items.items({ scope: tenantA, asset: { category: 'tool', name: 'Shell' } })).toEqual([])
  })

  it('answers undeclared for a holding whose definition is no longer registered', () => {
    const { items, registry } = fixture({})
    registry.close()
    expect(items.describe({ scope: tenantA, item: exaKey })).toBe('undeclared')
    expect(items.items({ scope: tenantA })).toEqual([])
  })
})
