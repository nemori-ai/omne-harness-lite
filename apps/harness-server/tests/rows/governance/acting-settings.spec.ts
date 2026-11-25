// AS-28 on the release: the face a row uses to read and write the settings of a held asset for whoever acts for the tenant.
import { describe, expect, it } from 'vitest'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import type { TenantId } from '@omne-harness/legal-identity'
import type { SettingView, TenantSettings } from '@omne-harness/settings'
import { actingAdmit, createActingSettings } from '../../../src/rows/governance/acting-settings.ts'
import { fixtureTenant, okOf } from '../../entry/support.ts'

const A = fixtureTenant('a')
const B = fixtureTenant('b')
const authority = inProcessPrincipalAuthority()
const system = okOf(authority.issuer.issueSystem({ component: 'server-entry' }), 'system')
const acting = (tenant: TenantId, owner: string, work: string): ActingForTenantPrincipal =>
  okOf(
    authority.issuer.issueActingForTenant({ actor: system, tenant, work: { owner, work } }),
    'acting',
  )
const login = acting(A, 'identity-login', 'lgn_a')
const work = acting(A, 'session', 'ses_a')

function admitOf(over: Readonly<{ active?: boolean; member?: boolean }> = {}) {
  return actingAdmit(
    {
      verifier: authority.verifier,
      standing: {
        read: async () =>
          over.member === false
            ? ({ kind: 'not-member' } as never)
            : {
                kind: 'member',
                role: { role: 'member', model: { model: 'm', revision: '1' } },
                qualifications: [],
                evidence: { record: 'standing/test', revision: '1' },
              },
      },
    },
    () => over.active !== false,
  )
}

describe('whoever may act for the tenant', () => {
  it.each([
    ['the login of the tenant', login],
    ['the work of a session of the tenant', work],
  ] as const)('%s reads and writes', async (_who, principal) => {
    for (const action of ['list', 'describe', 'set', 'clear'] as const)
      expect(await admitOf()({ principal, tenant: A, action })).toBe('allowed')
  })

  it.each([
    ['a system principal', system, A],
    ['the work of a session of another tenant', acting(B, 'session', 'ses_b'), A],
    ['a hand-built copy of the work principal', { ...work }, A],
    [
      'a card answer wrapped around the work principal',
      { kind: 'card-answer', principal: work },
      A,
    ],
    ['nothing', null, A],
  ] as const)('%s is denied', async (_who, principal, tenant) => {
    expect(await admitOf()({ principal, tenant, action: 'set' })).toBe('denied')
  })

  it('is denied once the membership is gone, and unavailable while the row is not active', async () => {
    const asked = { principal: work, tenant: A, action: 'set' } as const
    expect(await admitOf({ member: false })(asked)).not.toBe('allowed')
    expect(await admitOf({ active: false })(asked)).toBe('unavailable')
  })
})

const DOCS = { category: 'mcp', name: 'docs' }
const head = (item: string) => ({
  owner: { kind: 'asset', ...DOCS } as const,
  item,
  revision: '4',
  declaration: {
    title: item,
    purpose: 'p',
    appliesAt: 'next',
    clearEffect: 'c',
    group: { id: 'g', title: 'G', description: 'd' },
  },
})
const ORDINARY: SettingView = {
  ...head('program-calls'),
  kind: 'ordinary',
  valueSchema: { type: 'boolean' },
  default: { kind: 'set', value: false },
  own: { kind: 'unset' },
  effective: { value: { kind: 'set', value: false }, source: 'default' },
  lockedBy: null,
  editable: { kind: 'yes' },
}
const SECRET: SettingView = {
  ...head('credential'),
  kind: 'secret',
  own: 'available',
  official: 'unset',
  editable: { kind: 'yes' },
}
const PERMISSION: SettingView = {
  ...head('invoke'),
  kind: 'permission',
  choices: [{ value: 'auto', label: '自动', description: 'd', permitsOperation: true }],
  default: 'ask',
  own: 'auto',
  effective: { kind: 'value', value: 'auto', source: 'tenant' },
  bound: null,
  editable: { kind: 'yes' },
}

type Face = TenantSettings<unknown>

function world(over: Partial<Face> = {}) {
  const calls: unknown[] = []
  const pages: Readonly<Record<string, readonly SettingView[]>> = {
    first: [ORDINARY, SECRET],
    second: [PERMISSION],
  }
  const face: Face = {
    async list(input) {
      calls.push(['list', input])
      const page = input.after ?? 'first'
      return {
        kind: 'listed',
        items: pages[page] ?? [],
        next: page === 'first' ? 'second' : null,
        completeness: 'complete',
      }
    },
    async describe(input) {
      calls.push(['describe', input.item])
      const item = [ORDINARY, SECRET, PERMISSION].find(one => one.item === input.item)
      return item === undefined ? { kind: 'not-visible' } : { kind: 'described', item }
    },
    async set(input) {
      calls.push(['set', input])
      return { kind: 'written', revision: '5' }
    },
    async clear(input) {
      calls.push(['clear', input])
      return { kind: 'written', revision: '5' }
    },
    ...over,
  }
  return { calls, settings: createActingSettings(face) }
}

const asked = { principal: work, tenant: A, asset: DOCS }

describe('the settings of a held asset, for a row', () => {
  it('lists every page, an ordinary item whole, a secret and a permission by name only', async () => {
    const { settings, calls } = world()
    const listed = await settings.list(asked)
    expect(listed).toEqual([
      ORDINARY,
      { ...head('credential'), kind: 'secret' },
      { ...head('invoke'), kind: 'permission' },
    ])
    expect(JSON.stringify(listed)).not.toMatch(/auto|available|choices/u)
    expect(calls.map(call => (call as [string, { after: unknown }])[1].after)).toEqual([
      null,
      'second',
    ])
    expect(calls[0]).toEqual([
      'list',
      {
        principal: work,
        tenant: A,
        scope: { kind: 'asset', asset: DOCS },
        after: null,
        limit: 100,
      },
    ])
  })

  it.each([
    ['denied', { kind: 'denied' }, 'denied'],
    ['not visible', { kind: 'not-visible' }, 'not-visible'],
    ['a conflict', { kind: 'conflict' }, 'unavailable'],
    ['unavailable', { kind: 'unavailable' }, 'unavailable'],
    [
      'a list that is not whole',
      { kind: 'listed', items: [ORDINARY], next: null, completeness: 'partial' },
      'unavailable',
    ],
  ] as const)('a read that is %s answers so, never a part', async (_case, answer, expected) => {
    const { settings } = world({ list: async () => answer as never })
    expect(await settings.list(asked)).toBe(expected)
  })

  it('a read that throws is unavailable', async () => {
    const { settings } = world({
      list: async () => {
        throw new Error('down')
      },
    })
    expect(await settings.list(asked)).toBe('unavailable')
  })

  it('writes an ordinary item as an ordinary value, and clears it', async () => {
    const { settings, calls } = world()
    const write = { ...asked, item: 'program-calls', operation: 'op-1', expectedRevision: '4' }
    expect(await settings.write({ ...write, change: { kind: 'set', value: true } })).toEqual({
      kind: 'written',
      revision: '5',
    })
    expect(calls.at(-1)).toEqual([
      'set',
      {
        principal: work,
        tenant: A,
        owner: { kind: 'asset', ...DOCS },
        item: 'program-calls',
        operation: 'op-1',
        expectedRevision: '4',
        value: { kind: 'ordinary', value: true },
      },
    ])
    expect(await settings.write({ ...write, change: { kind: 'clear' } })).toMatchObject({
      kind: 'written',
    })
    expect((calls.at(-1) as [string])[0]).toBe('clear')
  })

  it.each(['credential', 'invoke'])('does not write %s: it is not an ordinary item', async item => {
    const { settings, calls } = world()
    const write = { ...asked, item, operation: 'op-2', expectedRevision: '4' }
    for (const change of [{ kind: 'set', value: 'auto' }, { kind: 'clear' }] as const)
      expect(await settings.write({ ...write, change })).toEqual({
        kind: 'not-writable',
        reason: 'not-a-source',
      })
    expect(calls.filter(call => ['set', 'clear'].includes((call as [string])[0]))).toEqual([])
  })

  it('answers what the read before the write answered when the item cannot be read, and unknown when the write throws', async () => {
    const write = {
      ...asked,
      item: 'colour',
      operation: 'op-3',
      expectedRevision: '4',
      change: { kind: 'set', value: 1 },
    } as const
    expect(await world().settings.write(write)).toEqual({ kind: 'not-visible' })
    const denied = world({ describe: async () => ({ kind: 'denied' }) })
    expect(await denied.settings.write(write)).toEqual({ kind: 'denied' })
    const lost = world({
      set: async () => {
        throw new Error('the reply was lost')
      },
    })
    expect(await lost.settings.write({ ...write, item: 'program-calls' })).toEqual({
      kind: 'unknown',
    })
    const unread = world({
      describe: async () => {
        throw new Error('down')
      },
    })
    expect(await unread.settings.write(write)).toEqual({ kind: 'unavailable' })
  })
})
