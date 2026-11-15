import type { TenantSettingsPort } from '@omne-harness/assets-access'
import { describe, expect, it } from 'vitest'
import { unifySettings } from '../../../src/rows/assets-access/settings.ts'
import type { SecretSettings, SecretView, SettingView } from '../../../src/rows/settings/ports.ts'
import { fixtureTenant } from '../../entry/support.ts'

const A = fixtureTenant('a')
const principal = {} as never
const declaration = { title: 't', purpose: 'p', appliesAt: 'a', clearEffect: 'c' }
const WEB = { category: 'tool', name: 'Web' }
const SHELL = { category: 'tool', name: 'Shell' }

function secret(item: string): SecretView {
  return {
    asset: WEB,
    item,
    revision: '0',
    declaration,
    kind: 'secret',
    own: 'unset',
    official: 'unset',
    editable: { kind: 'yes' },
  }
}
function ordinary(item: string, asset = SHELL): SettingView {
  return {
    asset,
    item,
    revision: '3',
    declaration,
    kind: 'ordinary',
    valueSchema: { type: 'integer' },
    default: { kind: 'unset' },
    own: { kind: 'unset' },
    effective: { value: { kind: 'unset' }, source: null },
    lockedBy: null,
    editable: { kind: 'yes' },
  }
}

type Refused = Readonly<{ kind: 'denied' | 'unavailable' | 'conflict' | 'not-visible' }>
type Calls = string[]

function secretFace(
  items: readonly SecretView[],
  calls: Calls,
  refuse: Partial<Record<keyof SecretSettings, Refused>> = {},
): SecretSettings {
  const find = (asset: { name: string }, item: string) =>
    items.find(view => view.asset.name === asset.name && view.item === item)
  return {
    list: async input => {
      calls.push('secret.list')
      if (refuse.list !== undefined) return refuse.list as never
      return {
        kind: 'listed',
        items: items.filter(
          view => input.asset === undefined || view.asset.name === input.asset.name,
        ),
      }
    },
    describe: async input => {
      calls.push('secret.describe')
      if (refuse.describe !== undefined) return refuse.describe
      const found = find(input.asset, input.item)
      return found === undefined ? { kind: 'not-visible' } : { kind: 'described', item: found }
    },
    set: async input => {
      calls.push(`secret.set:${input.secret}`)
      return find(input.asset, input.item) === undefined
        ? { kind: 'not-visible' }
        : { kind: 'written', revision: '0' }
    },
    clear: async input => {
      calls.push('secret.clear')
      return find(input.asset, input.item) === undefined
        ? { kind: 'not-visible' }
        : { kind: 'written', revision: '0' }
    },
  }
}

function catalogFace(
  items: readonly SettingView[],
  calls: Calls,
  refuse: Refused | null = null,
): TenantSettingsPort {
  const find = (asset: { name: string }, item: string) =>
    items.find(view => view.asset.name === asset.name && view.item === item)
  return {
    list: async input => {
      calls.push(`catalog.list:${String(input.after)}:${String(input.limit)}`)
      if (refuse !== null) return refuse
      if (input.after !== null && !/^\d+$/.test(input.after)) return { kind: 'unavailable' }
      const selected = items.filter(
        view => input.asset === undefined || view.asset.name === input.asset.name,
      )
      if (input.asset !== undefined && selected.length === 0) return { kind: 'not-visible' }
      const offset = input.after === null ? 0 : Number(input.after)
      return {
        kind: 'listed',
        items: selected.slice(offset, offset + input.limit),
        next: offset + input.limit < selected.length ? String(offset + input.limit) : null,
        completeness: 'complete',
      }
    },
    describe: async input => {
      calls.push('catalog.describe')
      if (refuse !== null) return refuse
      const found = find(input.asset, input.item)
      return found === undefined ? { kind: 'not-visible' } : { kind: 'described', item: found }
    },
    set: async input => {
      calls.push(`catalog.set:${input.value.kind}`)
      if (refuse !== null) return refuse
      return find(input.asset, input.item) === undefined
        ? { kind: 'not-visible' }
        : { kind: 'written', revision: '4' }
    },
    clear: async input => {
      calls.push('catalog.clear')
      if (refuse !== null) return refuse
      return find(input.asset, input.item) === undefined
        ? { kind: 'not-visible' }
        : { kind: 'written', revision: '4' }
    },
  }
}

type Setup = Readonly<{
  secrets?: readonly SecretView[] | null
  catalog?: readonly SettingView[] | null
  secretRefuse?: Partial<Record<keyof SecretSettings, Refused>>
  catalogRefuse?: Refused | null
}>

function port(setup: Setup = {}) {
  const calls: Calls = []
  const secrets = setup.secrets === undefined ? [secret('exa.apiKey')] : setup.secrets
  const catalog = setup.catalog === undefined ? [ordinary('limits.lines')] : setup.catalog
  const s = secrets === null ? undefined : secretFace(secrets, calls, setup.secretRefuse)
  const c = catalog === null ? undefined : catalogFace(catalog, calls, setup.catalogRefuse ?? null)
  return { calls, port: unifySettings({ secrets: () => s, catalog: () => c }) }
}

const item = (asset: typeof WEB, name: string) => ({ principal, tenant: A, asset, item: name })
const write = (asset: typeof WEB, name: string, expectedRevision: string) => ({
  ...item(asset, name),
  operation: 'op-1',
  expectedRevision,
})
const listOf = (after: string | null, limit: number, asset?: { name: string }) => ({
  principal,
  tenant: A,
  after,
  limit,
  ...(asset === undefined ? {} : { asset }),
})
const names = (answer: Awaited<ReturnType<TenantSettingsPort['list']>>) =>
  answer.kind === 'listed' ? answer.items.map(view => view.item) : answer.kind

describe('the unified settings port: describe', () => {
  it('answers the secret face when it describes the item, without asking the catalog', async () => {
    const p = port()
    expect(await p.port.describe(item(WEB, 'exa.apiKey'))).toEqual({
      kind: 'described',
      item: secret('exa.apiKey'),
    })
    expect(p.calls).toEqual(['secret.describe'])
  })

  it('asks the catalog when the secret face does not see the item', async () => {
    const p = port()
    expect(await p.port.describe(item(SHELL, 'limits.lines'))).toEqual({
      kind: 'described',
      item: ordinary('limits.lines'),
    })
    expect(p.calls).toEqual(['secret.describe', 'catalog.describe'])
  })

  it('answers any other refusal of the secret face as it is', async () => {
    const p = port({ secretRefuse: { describe: { kind: 'denied' } } })
    expect(await p.port.describe(item(SHELL, 'limits.lines'))).toEqual({ kind: 'denied' })
    expect(p.calls).toEqual(['secret.describe'])
  })
})

describe('the unified settings port: set', () => {
  const secretValue = { kind: 'secret', secret: 'sentinel-unify' } as const
  const ordinaryValue = { kind: 'ordinary', value: 5 } as const

  it('a secret value to a secret item at revision 0 is written by the secret face', async () => {
    const p = port()
    expect(await p.port.set({ ...write(WEB, 'exa.apiKey', '0'), value: secretValue })).toEqual({
      kind: 'written',
      revision: '0',
    })
    expect(p.calls).toEqual(['secret.set:sentinel-unify'])
  })

  it('a secret value with a revision other than 0 is a conflict, before any face', async () => {
    const p = port()
    expect(await p.port.set({ ...write(WEB, 'exa.apiKey', '1'), value: secretValue })).toEqual({
      kind: 'conflict',
    })
    expect(p.calls).toEqual([])
  })

  it('a secret value to an item the catalog knows is invalid', async () => {
    const p = port()
    expect(await p.port.set({ ...write(SHELL, 'limits.lines', '0'), value: secretValue })).toEqual({
      kind: 'invalid',
    })
    expect(p.calls).toEqual(['secret.set:sentinel-unify', 'catalog.describe'])
  })

  it('a secret value to an item no face knows is not-visible', async () => {
    const p = port()
    expect(await p.port.set({ ...write(SHELL, 'nothing', '0'), value: secretValue })).toEqual({
      kind: 'not-visible',
    })
  })

  it('another value goes to the catalog face', async () => {
    const p = port()
    expect(
      await p.port.set({ ...write(SHELL, 'limits.lines', '3'), value: ordinaryValue }),
    ).toEqual({ kind: 'written', revision: '4' })
    expect(p.calls).toEqual(['catalog.set:ordinary'])
  })

  it('another value to a secret item is invalid; to an item no face knows is not-visible', async () => {
    const p = port()
    expect(await p.port.set({ ...write(WEB, 'exa.apiKey', '0'), value: ordinaryValue })).toEqual({
      kind: 'invalid',
    })
    expect(p.calls).toEqual(['catalog.set:ordinary', 'secret.describe'])
    expect(await p.port.set({ ...write(SHELL, 'nothing', '0'), value: ordinaryValue })).toEqual({
      kind: 'not-visible',
    })
  })
})

describe('the unified settings port: clear', () => {
  it('clears a secret item at revision 0 through the secret face', async () => {
    const p = port()
    expect(await p.port.clear(write(WEB, 'exa.apiKey', '0'))).toEqual({
      kind: 'written',
      revision: '0',
    })
    expect(p.calls).toEqual(['secret.clear'])
  })

  it('a secret item with a revision other than 0 is a conflict, and nothing is cleared', async () => {
    const p = port()
    expect(await p.port.clear(write(WEB, 'exa.apiKey', '2'))).toEqual({ kind: 'conflict' })
    expect(p.calls).toEqual(['secret.describe'])
  })

  it('an item the secret face does not see is cleared by the catalog, at any revision', async () => {
    for (const revision of ['0', '3']) {
      const p = port()
      expect(await p.port.clear(write(SHELL, 'limits.lines', revision))).toEqual({
        kind: 'written',
        revision: '4',
      })
      expect(p.calls.at(-1)).toBe('catalog.clear')
    }
  })
})

describe('the unified settings port: a source that is not there', () => {
  it('without the catalog face, secret items are still described, set and cleared; the rest is unavailable', async () => {
    const p = port({ catalog: null })
    expect((await p.port.describe(item(WEB, 'exa.apiKey'))).kind).toBe('described')
    expect(
      await p.port.set({
        ...write(WEB, 'exa.apiKey', '0'),
        value: { kind: 'secret', secret: 'sentinel-unify' },
      }),
    ).toEqual({ kind: 'written', revision: '0' })
    expect(await p.port.clear(write(WEB, 'exa.apiKey', '0'))).toEqual({
      kind: 'written',
      revision: '0',
    })
    expect(await p.port.describe(item(SHELL, 'limits.lines'))).toEqual({ kind: 'unavailable' })
    expect(
      await p.port.set({
        ...write(SHELL, 'limits.lines', '3'),
        value: { kind: 'ordinary', value: 1 },
      }),
    ).toEqual({ kind: 'unavailable' })
    expect(await p.port.clear(write(SHELL, 'limits.lines', '3'))).toEqual({ kind: 'unavailable' })
    expect(await p.port.list(listOf(null, 10))).toEqual({ kind: 'unavailable' })
  })

  it('without the secret face, every step that needs it is unavailable', async () => {
    const p = port({ secrets: null })
    expect(await p.port.describe(item(SHELL, 'limits.lines'))).toEqual({ kind: 'unavailable' })
    expect(await p.port.list(listOf(null, 10))).toEqual({ kind: 'unavailable' })
    expect(await p.port.clear(write(SHELL, 'limits.lines', '3'))).toEqual({ kind: 'unavailable' })
    expect(
      await p.port.set({ ...write(SHELL, 'nothing', '0'), value: { kind: 'ordinary', value: 1 } }),
    ).toEqual({ kind: 'unavailable' })
  })
})

describe('the unified settings port: list pages', () => {
  const three = [secret('s.a'), secret('s.b'), secret('s.c')]
  const catalog = [ordinary('c.a'), ordinary('c.b'), ordinary('c.c')]

  it('fewer secret items than a page: the rest of the page comes from the catalog', async () => {
    const p = port({ secrets: three, catalog })
    const first = await p.port.list(listOf(null, 5))
    expect(names(first)).toEqual(['s.a', 's.b', 's.c', 'c.a', 'c.b'])
    expect(first).toMatchObject({ next: 'c:2', completeness: 'complete' })
    expect(p.calls).toEqual(['secret.list', 'catalog.list:null:2'])
    const second = await p.port.list(listOf('c:2', 5))
    expect(names(second)).toEqual(['c.c'])
    expect(second).toMatchObject({ next: null, completeness: 'complete' })
  })

  it('exactly a page of secret items: the next page starts the catalog segment', async () => {
    const p = port({ secrets: three, catalog })
    const first = await p.port.list(listOf(null, 3))
    expect(names(first)).toEqual(['s.a', 's.b', 's.c'])
    expect(first).toMatchObject({ next: 'c:', completeness: 'complete' })
    expect(p.calls).toEqual(['secret.list'])
    const second = await p.port.list(listOf('c:', 3))
    expect(names(second)).toEqual(['c.a', 'c.b', 'c.c'])
    expect(second).toMatchObject({ next: null })
  })

  it('more secret items than a page: the pages walk the secret segment, then the catalog', async () => {
    const p = port({ secrets: three, catalog })
    const first = await p.port.list(listOf(null, 2))
    expect(names(first)).toEqual(['s.a', 's.b'])
    expect(first).toMatchObject({ next: 's:2', completeness: 'complete' })
    const second = await p.port.list(listOf('s:2', 2))
    expect(names(second)).toEqual(['s.c', 'c.a'])
    expect(second).toMatchObject({ next: 'c:1', completeness: 'complete' })
    const third = await p.port.list(listOf('c:1', 2))
    expect(names(third)).toEqual(['c.b', 'c.c'])
    expect(third).toMatchObject({ next: null })
  })

  it('a cursor it does not recognise answers what the catalog answers for a bad cursor', async () => {
    const p = port({ secrets: three, catalog })
    for (const after of ['5', 'x:1', 's:', 's:01', 's:3', 's:-1'])
      expect(await p.port.list(listOf(after, 2))).toEqual({ kind: 'unavailable' })
    expect(p.calls.filter(call => call.startsWith('catalog'))).toEqual([])
  })

  it('a catalog that cannot be read makes the whole list unavailable, not a page of secret items', async () => {
    const p = port({ secrets: three, catalog, catalogRefuse: { kind: 'unavailable' } })
    expect(await p.port.list(listOf(null, 10))).toEqual({ kind: 'unavailable' })
    for (const kind of ['denied', 'conflict'] as const)
      expect(
        await port({ secrets: three, catalog, catalogRefuse: { kind } }).port.list(
          listOf(null, 10),
        ),
      ).toEqual({ kind })
  })

  it('a secret face that refuses answers its refusal as it is, without the catalog', async () => {
    for (const kind of ['denied', 'unavailable'] as const) {
      const p = port({ secrets: three, catalog, secretRefuse: { list: { kind } } })
      expect(await p.port.list(listOf(null, 10))).toEqual({ kind })
      expect(p.calls).toEqual(['secret.list'])
    }
  })

  it('with an asset filter: no secret item and a catalog that does not see the asset is not-visible', async () => {
    const p = port({ secrets: three, catalog })
    expect(await p.port.list(listOf(null, 10, { name: 'Nope' }))).toEqual({ kind: 'not-visible' })
  })

  it('with an asset filter: secret items and a catalog that does not see the asset list the secret items only', async () => {
    const p = port({ secrets: three, catalog })
    expect(await p.port.list(listOf(null, 10, { name: 'Web' }))).toEqual({
      kind: 'listed',
      items: three,
      next: null,
      completeness: 'complete',
    })
  })

  it('with an asset filter: the catalog items of that asset follow its secret items', async () => {
    const p = port({ secrets: three, catalog: [...catalog, ordinary('w.a', WEB)] })
    const listed = await p.port.list(listOf(null, 10, { name: 'Web' }))
    expect(names(listed)).toEqual(['s.a', 's.b', 's.c', 'w.a'])
    expect(listed).toMatchObject({ next: null, completeness: 'complete' })
  })

  it('a limit below one or above the catalog budget is held to the same bounds as the catalog', async () => {
    const p = port({ secrets: three, catalog })
    expect(names(await p.port.list(listOf(null, 0)))).toEqual(['s.a'])
    const many = Array.from({ length: 120 }, (_, index) =>
      secret(`s.${String(index).padStart(3, '0')}`),
    )
    const q = port({ secrets: many, catalog })
    const page = await q.port.list(listOf(null, 1000))
    expect(names(page)).toHaveLength(100)
    expect(page).toMatchObject({ next: 's:100' })
  })
})
