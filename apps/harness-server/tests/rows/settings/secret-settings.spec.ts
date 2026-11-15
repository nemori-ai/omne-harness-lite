import type {
  SecretItemView,
  SecretPresence,
  SecretScope,
  SettingsSecretItems,
} from '@omne-harness/settings'
import { describe, expect, it } from 'vitest'
import type { SystemInstant } from '../../../src/entry/session-clock.ts'
import type { SettingsVerdict } from '../../../src/rows/authorization/settings-access.ts'
import { createSecretSettings } from '../../../src/rows/settings/secret-settings.ts'
import { fixtureTenant } from '../../entry/support.ts'

const A = fixtureTenant('a')
const WEB = { category: 'tool', name: 'Web' }
const ITEM = 'exa.apiKey'
const SENTINEL = 'exa-sentinel-face-41c7d9'
const principal = {} as never
const at = { principal, tenant: A, asset: WEB, item: ITEM }

const TEXT = {
  title: 'Exa API key',
  purpose: 'The key search sends to Exa.',
  appliesAt: 'Applies from the next read of the item.',
  clearEffect: 'Search is unconfigured until a key is set again.',
}

function secretView(itemId: string, presence: SecretPresence): SecretItemView {
  return { asset: WEB, itemId, ...TEXT, sensitivity: 'secret', presence }
}
const ordinaryView: SecretItemView = {
  asset: WEB,
  itemId: 'limits.lines',
  ...TEXT,
  sensitivity: 'ordinary',
}

type Answers = {
  verdict: SettingsVerdict['kind']
  clock: boolean
  set: ReturnType<SettingsSecretItems['set']>
  clear: ReturnType<SettingsSecretItems['clear']>
  tenant: ReturnType<SettingsSecretItems['items']>
  official: ReturnType<SettingsSecretItems['items']>
}

function world(given: Partial<Answers> = {}) {
  const answers: Answers = {
    verdict: 'allowed',
    clock: true,
    set: 'written',
    clear: 'removed',
    tenant: [secretView(ITEM, { kind: 'unbound' }), ordinaryView],
    official: [secretView(ITEM, { kind: 'unbound' }), ordinaryView],
    ...given,
  }
  const scopes: SecretScope[] = []
  const secrets: string[] = []
  const items: SettingsSecretItems = {
    set: input => {
      scopes.push(input.scope)
      secrets.push(input.secret)
      return answers.set
    },
    clear: input => {
      scopes.push(input.scope)
      return answers.clear
    },
    describe: () => {
      throw new Error('the face reads presence through items()')
    },
    items: input => (input.scope.layer === 'official' ? answers.official : answers.tenant),
  }
  const face = createSecretSettings({
    items,
    qualify: async () => ({ kind: answers.verdict }),
    now: (): SystemInstant =>
      answers.clock
        ? { ok: true, text: '2026-11-15T00:00:00.000Z' }
        : { ok: false, failure: 'unreadable' as never },
  })
  return { face, scopes, secrets }
}

const allFour = (face: ReturnType<typeof world>['face']) =>
  Promise.all([
    face.list({ principal, tenant: A }),
    face.describe(at),
    face.set({ ...at, secret: SENTINEL }),
    face.clear(at),
  ])

describe('the secret face: answers mapped from the custody and the qualification', () => {
  it('a denied qualification answers denied for all four, before the vault', async () => {
    const w = world({ verdict: 'denied' })
    expect((await allFour(w.face)).map(answer => answer.kind)).toEqual([
      'denied',
      'denied',
      'denied',
      'denied',
    ])
    expect(w.scopes).toEqual([])
  })

  it('an unavailable qualification answers unavailable for all four, before the vault', async () => {
    const w = world({ verdict: 'unavailable' })
    expect((await allFour(w.face)).map(answer => answer.kind)).toEqual([
      'unavailable',
      'unavailable',
      'unavailable',
      'unavailable',
    ])
    expect(w.scopes).toEqual([])
  })

  it('a custody that cannot be read answers unavailable for list and describe', async () => {
    for (const layer of ['tenant', 'official'] as const) {
      const w = world({ [layer]: 'unavailable' })
      expect(await w.face.list({ principal, tenant: A })).toEqual({ kind: 'unavailable' })
      expect(await w.face.describe(at)).toEqual({ kind: 'unavailable' })
    }
    const noSecret = world({ tenant: [ordinaryView], official: 'unavailable' })
    expect(await noSecret.face.list({ principal, tenant: A })).toEqual({ kind: 'unavailable' })
  })

  it('a custody that refuses the tenant layer answers denied for list and describe', async () => {
    const w = world({ tenant: 'denied' })
    expect(await w.face.list({ principal, tenant: A })).toEqual({ kind: 'denied' })
    expect(await w.face.describe(at)).toEqual({ kind: 'denied' })
  })

  it('an official layer that does not hold the item as a secret answers unavailable', async () => {
    const w = world({ official: [ordinaryView] })
    expect(await w.face.list({ principal, tenant: A })).toEqual({ kind: 'unavailable' })
    expect(await w.face.describe(at)).toEqual({ kind: 'unavailable' })
  })

  it('a custody that did not write answers unavailable for set and clear', async () => {
    const w = world({ set: 'not-written', clear: 'not-written' })
    expect(await w.face.set({ ...at, secret: SENTINEL })).toEqual({ kind: 'unavailable' })
    expect(await w.face.clear(at)).toEqual({ kind: 'unavailable' })
  })

  it('a clock that cannot be read answers unavailable for set, before the vault', async () => {
    const w = world({ clock: false })
    expect(await w.face.set({ ...at, secret: SENTINEL })).toEqual({ kind: 'unavailable' })
    expect(w.scopes).toEqual([])
  })

  it('an undeclared item answers not-visible', async () => {
    const w = world({ set: 'undeclared', clear: 'undeclared' })
    expect(await w.face.set({ ...at, secret: SENTINEL })).toEqual({ kind: 'not-visible' })
    expect(await w.face.clear(at)).toEqual({ kind: 'not-visible' })
    expect(await w.face.describe({ ...at, item: 'exa.other' })).toEqual({ kind: 'not-visible' })
  })

  it('an item declared but not secret answers not-visible: it belongs to the catalog face', async () => {
    const w = world({ set: 'not-secret', clear: 'not-secret' })
    expect(await w.face.set({ ...at, item: 'limits.lines', secret: SENTINEL })).toEqual({
      kind: 'not-visible',
    })
    expect(await w.face.clear({ ...at, item: 'limits.lines' })).toEqual({ kind: 'not-visible' })
    expect(await w.face.describe({ ...at, item: 'limits.lines' })).toEqual({
      kind: 'not-visible',
    })
  })

  it('a conflict answers conflict for describe, set and clear, and unavailable for list', async () => {
    const w = world({ set: 'conflict', clear: 'conflict', tenant: 'conflict' })
    expect(await w.face.set({ ...at, secret: SENTINEL })).toEqual({ kind: 'conflict' })
    expect(await w.face.clear(at)).toEqual({ kind: 'conflict' })
    expect(await w.face.describe(at)).toEqual({ kind: 'conflict' })
    expect(await w.face.list({ principal, tenant: A })).toEqual({ kind: 'unavailable' })
  })

  it('a text that is not a secret text answers invalid, before the vault', async () => {
    const w = world()
    expect(await w.face.set({ ...at, secret: 'bad\u0007text' })).toEqual({ kind: 'invalid' })
    expect(w.scopes).toEqual([])
  })

  it('an unconfirmed custody write answers unknown', async () => {
    const w = world({ set: 'unconfirmed', clear: 'unconfirmed' })
    expect(await w.face.set({ ...at, secret: SENTINEL })).toEqual({ kind: 'unknown' })
    expect(await w.face.clear(at)).toEqual({ kind: 'unknown' })
  })

  it('a custody that refuses the write answers denied', async () => {
    const w = world({ set: 'denied', clear: 'denied' })
    expect(await w.face.set({ ...at, secret: SENTINEL })).toEqual({ kind: 'denied' })
    expect(await w.face.clear(at)).toEqual({ kind: 'denied' })
  })

  it('written and removed answer written at revision 0, in the tenant scope only; absent answers no-change', async () => {
    const w = world()
    expect(await w.face.set({ ...at, secret: ` ${SENTINEL} ` })).toEqual({
      kind: 'written',
      revision: '0',
    })
    expect(await w.face.clear(at)).toEqual({ kind: 'written', revision: '0' })
    expect(w.scopes).toEqual([
      { layer: 'tenant', tenant: A },
      { layer: 'tenant', tenant: A },
    ])
    expect(w.secrets).toEqual([SENTINEL])
    expect(await world({ clear: 'absent' }).face.clear(at)).toEqual({ kind: 'no-change' })
  })
})

describe('the secret face: the view', () => {
  it('lists the secret items only, in the custody order, with the declaration text and no time', async () => {
    const second = 'exa.other'
    const w = world({
      tenant: [
        secretView(ITEM, { kind: 'bound', life: 'active', configuredAt: null }),
        ordinaryView,
        secretView(second, { kind: 'unbound' }),
      ],
      official: [
        secretView(ITEM, { kind: 'bound', life: 'revoked', configuredAt: null }),
        ordinaryView,
        secretView(second, { kind: 'bound', life: 'unreadable', configuredAt: null }),
      ],
    })
    const listed = await w.face.list({ principal, tenant: A, asset: { name: 'Web' } })
    const declaration = TEXT
    expect(listed).toEqual({
      kind: 'listed',
      items: [
        {
          asset: WEB,
          item: ITEM,
          revision: '0',
          declaration,
          kind: 'secret',
          own: 'available',
          official: 'revoked',
          editable: { kind: 'yes' },
        },
        {
          asset: WEB,
          item: second,
          revision: '0',
          declaration,
          kind: 'secret',
          own: 'unset',
          official: 'unreadable',
          editable: { kind: 'yes' },
        },
      ],
    })
  })

  it('maps each presence of the own and the official layer', async () => {
    const cases: readonly [SecretPresence, string][] = [
      [{ kind: 'unbound' }, 'unset'],
      [{ kind: 'bound', life: 'active', configuredAt: null }, 'available'],
      [{ kind: 'bound', life: 'revoked', configuredAt: null }, 'revoked'],
      [{ kind: 'bound', life: 'unreadable', configuredAt: null }, 'unreadable'],
    ]
    for (const [presence, state] of cases) {
      const own = world({ tenant: [secretView(ITEM, presence)] })
      expect(await own.face.describe(at)).toMatchObject({ kind: 'described', item: { own: state } })
      const official = world({ official: [secretView(ITEM, presence)] })
      expect(await official.face.describe(at)).toMatchObject({
        kind: 'described',
        item: { official: state },
      })
    }
  })
})
