// The two-layer reads of the settings governance (rows/settings/governance.ts) over a scripted
// secret-item entry: a read that fails in either layer answers `basis-unavailable`, and the writes
// reach the tenant scope only (I-7, I-8).
import type { SecretItemView, SecretScope, SettingsSecretItems } from '@omne-harness/settings'
import { describe, expect, it } from 'vitest'
import { createSettingsGovernance } from '../../../src/rows/settings/governance.ts'
import { fixtureTenant } from '../../entry/support.ts'

const A = fixtureTenant('a')
const WEB = { category: 'tool', name: 'Web' }
const ITEM = 'exa.apiKey'
const access = { principal: {} as never, tenant: A }

const view = (presence: Extract<SecretItemView, { sensitivity: 'secret' }>['presence']) =>
  ({ asset: WEB, itemId: ITEM, title: 'Exa API key', sensitivity: 'secret', presence }) as const

/** An entry that answers by layer; `fail` names the layer whose reads fail. */
function entry(
  fail: 'tenant' | 'official' | null,
  scopes: SecretScope[] = [],
): SettingsSecretItems {
  const failing = (scope: SecretScope) => scope.layer === fail
  return {
    set: input => {
      scopes.push(input.scope)
      return 'written'
    },
    clear: input => {
      scopes.push(input.scope)
      return 'removed'
    },
    describe: input =>
      failing(input.scope)
        ? 'unavailable'
        : input.scope.layer === 'official'
          ? { kind: 'bound', life: 'active', configuredAt: null }
          : { kind: 'unbound' },
    items: input =>
      failing(input.scope)
        ? 'unavailable'
        : [
            input.scope.layer === 'official'
              ? view({ kind: 'bound', life: 'revoked', configuredAt: null })
              : view({ kind: 'unbound' }),
          ],
  }
}

function governance(items: SettingsSecretItems) {
  return createSettingsGovernance({
    items,
    qualify: async () => ({ kind: 'allowed' }),
    now: () => ({ ok: true, text: '2026-11-10T00:00:00.000Z' }),
  })
}

describe('settings governance: the two layers', () => {
  it('describes and lists a secret item in the own and the official layer', async () => {
    const port = governance(entry(null))
    expect(await port.describe({ access, asset: WEB, item: ITEM })).toEqual({
      kind: 'succeeded',
      setting: { own: { state: 'unbound' }, official: { state: 'usable' } },
    })
    expect(await port.list({ access })).toEqual({
      kind: 'succeeded',
      items: [
        {
          asset: WEB,
          item: ITEM,
          title: 'Exa API key',
          sensitivity: 'secret',
          state: { state: 'unbound' },
          official: { state: 'revoked' },
        },
      ],
    })
  })

  it.each(['tenant', 'official'] as const)(
    'answers basis-unavailable when the %s layer cannot be read',
    async layer => {
      const port = governance(entry(layer))
      expect(await port.describe({ access, asset: WEB, item: ITEM })).toEqual({
        kind: 'basis-unavailable',
      })
      expect(await port.list({ access })).toEqual({ kind: 'basis-unavailable' })
    },
  )

  it('writes and clears the tenant scope only', async () => {
    const scopes: SecretScope[] = []
    const port = governance(entry(null, scopes))
    await port.set({ access, asset: WEB, item: ITEM, secret: 'test-secret' })
    await port.clear({ access, asset: WEB, item: ITEM })
    expect(scopes).toEqual([
      { layer: 'tenant', tenant: A },
      { layer: 'tenant', tenant: A },
    ])
  })
})
