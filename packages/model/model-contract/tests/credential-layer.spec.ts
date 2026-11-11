// The layer rule of a supplier's credential (SPEC「凭据引用与解析端口」): one layer, whole or failing,
// never items of two layers; a tenant that holds any item never falls back to the official layer.
import {
  readCredentialLayer,
  selectCredentialLayer,
  type CredentialItemState,
  type CredentialLayerReading,
} from '@omne-harness/model-contract/provider'
import { describe, expect, it } from 'vitest'

const ITEMS = ['apiKey', 'organization'] as const
const STATES: readonly CredentialItemState[] = ['unbound', 'active', 'revoked', 'unreadable']

const reading = (apiKey: CredentialItemState, organization: CredentialItemState = apiKey) =>
  new Map<string, CredentialItemState>([
    ['apiKey', apiKey],
    ['organization', organization],
  ])
const NONE: CredentialLayerReading = new Map()

describe('selectCredentialLayer', () => {
  it.each([
    [
      'no item declared',
      { items: [], tenant: NONE, official: null, profileOfficial: false },
      { ok: { layer: 'none' } },
    ],
    [
      'the tenant holds every item',
      {
        items: ITEMS,
        tenant: reading('active'),
        official: reading('active'),
        profileOfficial: true,
      },
      { ok: { layer: 'tenant' } },
    ],
    [
      'only the official layer, official profile',
      { items: ITEMS, tenant: NONE, official: reading('active'), profileOfficial: true },
      { ok: { layer: 'official' } },
    ],
    [
      'only the official layer, tenant profile',
      { items: ITEMS, tenant: NONE, official: reading('active'), profileOfficial: false },
      { failure: { kind: 'missing' } },
    ],
    [
      'the release does not hold the provider',
      { items: ITEMS, tenant: NONE, official: null, profileOfficial: true },
      { failure: { kind: 'missing' } },
    ],
    [
      'nothing bound anywhere',
      { items: ITEMS, tenant: NONE, official: NONE, profileOfficial: true },
      { failure: { kind: 'missing' } },
    ],
    [
      'the tenant holds one of two items',
      {
        items: ITEMS,
        tenant: reading('active', 'unbound'),
        official: reading('active'),
        profileOfficial: true,
      },
      { failure: { kind: 'incomplete', missing: ['organization'] } },
    ],
    [
      'a revoked tenant item',
      {
        items: ITEMS,
        tenant: reading('active', 'revoked'),
        official: reading('active'),
        profileOfficial: true,
      },
      { failure: { kind: 'revoked' } },
    ],
    [
      'an unreadable tenant item',
      {
        items: ITEMS,
        tenant: reading('unreadable', 'active'),
        official: reading('active'),
        profileOfficial: true,
      },
      { failure: { kind: 'unreadable' } },
    ],
    [
      'a revoked and an unreadable item',
      {
        items: ITEMS,
        tenant: reading('unreadable', 'revoked'),
        official: NONE,
        profileOfficial: true,
      },
      { failure: { kind: 'revoked' } },
    ],
    [
      'an incomplete official layer',
      { items: ITEMS, tenant: NONE, official: reading('unbound', 'active'), profileOfficial: true },
      { failure: { kind: 'incomplete', missing: ['apiKey'] } },
    ],
  ] as const)('%s', (_case, input, expected) => {
    expect(selectCredentialLayer(input)).toEqual(expected)
  })

  // Every state of two items in both layers, with and without an official profile and holding.
  const cases = STATES.flatMap(t1 =>
    STATES.flatMap(t2 =>
      STATES.flatMap(o1 =>
        STATES.flatMap(o2 =>
          [true, false].flatMap(profileOfficial =>
            [true, false].map(held => ({
              tenant: reading(t1, t2),
              official: held ? reading(o1, o2) : null,
              profileOfficial,
            })),
          ),
        ),
      ),
    ),
  )

  it('never serves a layer unless every item of it is active', () => {
    for (const input of cases) {
      const result = selectCredentialLayer({ items: ITEMS, ...input })
      if (!('ok' in result)) continue
      const chosen = result.ok.layer === 'tenant' ? input.tenant : input.official
      expect(ITEMS.map(item => chosen?.get(item))).toEqual(['active', 'active'])
    }
  })

  it('never falls back to the official layer when the tenant holds any item (I-3)', () => {
    for (const input of cases) {
      const holds = ITEMS.some(item => input.tenant.get(item) !== 'unbound')
      const result = selectCredentialLayer({ items: ITEMS, ...input })
      if (holds) expect(result).not.toEqual({ ok: { layer: 'official' } })
    }
  })

  it('serves the official layer only to an official profile of a held provider', () => {
    for (const input of cases) {
      const result = selectCredentialLayer({ items: ITEMS, ...input })
      if ('ok' in result && result.ok.layer === 'official') {
        expect(input.profileOfficial).toBe(true)
        expect(input.official).not.toBeNull()
      }
    }
  })

  it('answers the failure of the layer it judged', () => {
    for (const input of cases) {
      const result = selectCredentialLayer({ items: ITEMS, ...input })
      if ('ok' in result) continue
      const holds = ITEMS.some(item => input.tenant.get(item) !== 'unbound')
      const judged = holds
        ? readCredentialLayer(ITEMS, input.tenant)
        : input.profileOfficial && input.official !== null
          ? readCredentialLayer(ITEMS, input.official)
          : { failure: { kind: 'missing' } }
      expect(result).toEqual(judged)
    }
  })
})

describe('readCredentialLayer', () => {
  it('reads an item the reading does not name as unbound', () => {
    expect(readCredentialLayer(ITEMS, new Map([['apiKey', 'active']]))).toEqual({
      failure: { kind: 'incomplete', missing: ['organization'] },
    })
  })
})
