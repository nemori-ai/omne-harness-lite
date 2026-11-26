import { describe, expect, it, vi } from 'vitest'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { SessionListItem } from '@omne-harness/session-contract'
import { SESSION_WORK_OWNER } from '../../../src/rows/authorization/principals.ts'
import {
  createBoundSessions,
  type SessionsBindingPorts,
} from '../../../src/rows/tool-bindings/sessions.ts'
import { SESSION_WORK_COMPONENT } from '../../../src/rows/tool-runtime/session-work.ts'

const tenantOf = (account: string): TenantId => {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: `org_${'a'.repeat(26)}`, account: `acc_${account.repeat(26)}` }),
  )
  if (!parsed.ok) throw new Error('fixture tenant')
  return parsed.value
}
const A = tenantOf('1')
const work = (tenant: TenantId, session = 'ses_own') => ({
  kind: 'acting-for-tenant',
  actor: { kind: 'system', component: SESSION_WORK_COMPONENT },
  tenant,
  work: { owner: SESSION_WORK_OWNER, work: session },
})
const item = (session: string): SessionListItem =>
  ({
    session,
    createdAt: '2026-11-18T09:00:00.000Z',
    lastActivityAt: '2026-11-18T10:00:00.000Z',
    lifecycle: 'open',
    title: `title of ${session}`,
    archivedAt: null,
    archivedBy: null,
    relation: { kind: 'child', parent: 'ses_parent' },
    root: 'ses_parent',
    depth: 1,
    attendance: 'unattended',
    definition: 'coding',
    toReference: null,
  }) as unknown as SessionListItem
const verifier = (principal: unknown) =>
  ({
    async verify() {
      return principal === null ? { kind: 'rejected' } : { kind: 'verified', principal }
    },
  }) as unknown as PrincipalVerifier

function world(
  over: Partial<Record<'list' | 'listArchived' | 'begin' | 'next' | 'search', unknown>> = {},
) {
  const fns = {
    list: vi.fn(async () => ({
      ok: { items: [item('ses_own')], next: null, completeness: 'complete' },
    })),
    listArchived: vi.fn(async () => ({ ok: { items: [], next: null, completeness: 'complete' } })),
    begin: vi.fn(async () => ({
      ok: {
        entries: [{ id: 'e-1', kind: 'message.user', payload: { kind: 'object', entries: [] } }],
        next: null,
        exhausted: true,
      },
    })),
    next: vi.fn(async () => ({ ok: { entries: [], next: null, exhausted: true } })),
    search: vi.fn(async () => ({
      ok: {
        hits: [
          {
            session: 'ses_b',
            position: 'e-9',
            kind: 'message.user',
            at: Date.parse('2026-11-18T10:00:00.000Z'),
            snippet: { before: '', match: 'x', after: '' },
          },
        ],
        next: null,
        complete: false,
        incomplete: { reason: 'budget', behind: 1, progress: null },
      },
    })),
    ...over,
  }
  const principal = { value: work(A) as unknown }
  const ports: SessionsBindingPorts = {
    verifier: () => verifier(principal.value),
    directory: () => ({ list: fns.list, listArchived: fns.listArchived }) as never,
    history: () => ({ begin: fns.begin, next: fns.next }) as never,
    search: () => ({ search: fns.search }) as never,
  }
  const bound = createBoundSessions(
    { principal: work(A), tenant: A, call: 'c', request: {} } as never,
    ports,
  )
  return { bound, fns, principal, ports }
}

const ANY = { relation: null, parent: null, attendance: null, definition: null } as const

describe('the Sessions binding of the release', () => {
  it('reads with the call principal and tenant, never with anything the model gave', async () => {
    const { bound, fns } = world()
    await bound.list({ ...ANY, archived: false, title: null, cursor: 'c-1', limit: 5 })
    expect(fns.list).toHaveBeenCalledWith({
      principal: work(A),
      tenant: A,
      after: 'c-1',
      limit: 5,
      filter: {},
    })
    await bound.list({ ...ANY, archived: true, title: 'trip', cursor: null, limit: 5 })
    expect(fns.listArchived).toHaveBeenCalledWith(
      expect.objectContaining({ principal: work(A), tenant: A, titleContains: 'trip' }),
    )
    await bound.read({ session: 'ses_b', cursor: null, direction: 'backward', pageBytes: 100 })
    expect(fns.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        principal: work(A),
        tenant: A,
        session: 'ses_b',
        direction: 'backward',
        pageBytes: 100,
      }),
    )
    await bound.read({ session: 'ses_b', cursor: 'k-2', direction: 'forward', pageBytes: 100 })
    expect(fns.next).toHaveBeenCalledWith({
      principal: work(A),
      tenant: A,
      session: 'ses_b',
      cursor: 'k-2',
    })
  })

  it('reads after a position the call gives: forward from that entry, and a position Session refuses is refused as `after`', async () => {
    const { bound, fns } = world()
    const ask = { session: 'ses_b', cursor: null, direction: 'forward', pageBytes: 100 } as const
    await bound.read(ask)
    expect(fns.begin).toHaveBeenLastCalledWith(expect.objectContaining({ from: null }))
    await bound.read({ ...ask, after: '94' })
    expect(fns.begin).toHaveBeenLastCalledWith(
      expect.objectContaining({ session: 'ses_b', from: '94', direction: 'forward' }),
    )
    const refused = { kind: 'invalid', field: 'from', reason: 'not an entry of this session' }
    const strict = world({ begin: async () => ({ failure: refused }) })
    expect(await strict.bound.read({ ...ask, after: 'nope' })).toEqual({
      failure: { ...refused, field: 'after' },
    })
    expect(await strict.bound.read(ask)).toEqual({ failure: refused })
    const other = { kind: 'invalid', field: 'pageBytes', reason: 'too small' }
    const small = world({ begin: async () => ({ failure: other }) })
    expect(await small.bound.read({ ...ask, after: '94' })).toEqual({ failure: other })
  })

  it('asks for the prefix of a forked session only when the call does, and hands on whose entries a page holds', async () => {
    const page = { entries: [], next: 'k-2', exhausted: false, from: 'ses_parent' }
    const begin = vi.fn(async (input: { inherited?: true }) => ({
      ok: input.inherited === true ? page : { entries: [], next: null, exhausted: true },
    }))
    const { bound } = world({ begin })
    const ask = { session: 'ses_b', cursor: null, direction: 'forward', pageBytes: 100 } as const
    const plain = await bound.read(ask)
    expect(begin.mock.calls[0]?.[0]).not.toHaveProperty('inherited')
    expect(plain).toEqual({ ok: { entries: [], next: null, exhausted: true } })
    const inherited = await bound.read({ ...ask, inherited: true })
    expect(begin.mock.calls[1]?.[0]).toMatchObject({ inherited: true, direction: 'forward' })
    expect(inherited).toEqual({ ok: page })
  })

  it('narrows both lists by what the call gives, and gives each session what it is to others', async () => {
    const { bound, fns } = world()
    const given = {
      relation: 'child',
      parent: 'ses_a',
      attendance: 'unattended',
      definition: 'coding',
    } as const
    const filter = {
      kind: 'child',
      parent: 'ses_a',
      attendance: 'unattended',
      definition: 'coding',
    }
    await bound.list({ ...given, archived: false, title: null, cursor: null, limit: 5 })
    expect(fns.list).toHaveBeenLastCalledWith(expect.objectContaining({ filter }))
    await bound.list({
      ...ANY,
      relation: 'handoff',
      archived: true,
      title: null,
      cursor: null,
      limit: 5,
    })
    expect(fns.listArchived).toHaveBeenLastCalledWith(
      expect.objectContaining({ filter: { kind: 'handoff' } }),
    )
    const page = await bound.list({ ...ANY, archived: false, title: null, cursor: null, limit: 5 })
    if (!('ok' in page)) throw new Error('the list failed')
    expect(page.ok.items[0]).toMatchObject({
      relation: 'child',
      parent: 'ses_parent',
      origin: null,
      depth: 1,
      attendance: 'unattended',
      definition: 'coding',
    })
  })

  it('denies before any read when the principal is not a verified work principal of the tenant', async () => {
    const { bound, fns, principal } = world()
    principal.value = null
    expect(
      await bound.list({ ...ANY, archived: false, title: null, cursor: null, limit: 5 }),
    ).toEqual({
      failure: { kind: 'denied' },
    })
    expect(
      await bound.read({ session: 's', cursor: null, direction: 'forward', pageBytes: 1 }),
    ).toEqual({
      failure: { kind: 'denied' },
    })
    expect(fns.list).not.toHaveBeenCalled()
    expect(fns.begin).not.toHaveBeenCalled()
  })

  it('maps what the session answers into one failure each', async () => {
    const cases = [
      [{ kind: 'denied', action: 'x' }, { kind: 'denied' }],
      [{ kind: 'not-found' }, { kind: 'not-found' }],
      [
        { kind: 'invalid', field: 'cursor', reason: 'stale' },
        { kind: 'invalid', field: 'cursor', reason: 'stale' },
      ],
      [
        { kind: 'unavailable', owner: 's', diagnostic: 'down' },
        { kind: 'unavailable', diagnostic: 'down' },
      ],
      [
        { kind: 'quarantined', diagnostic: 'q' },
        { kind: 'unavailable', diagnostic: 'the session answered quarantined' },
      ],
    ] as const
    for (const [given, answer] of cases) {
      const { bound } = world({ begin: async () => ({ failure: given }) })
      expect(
        await bound.read({ session: 's', cursor: null, direction: 'forward', pageBytes: 1 }),
      ).toEqual({
        failure: answer,
      })
    }
  })

  it('shows one session by walking the open list and then the archived one', async () => {
    const { bound, fns } = world({
      list: vi.fn(async ({ after }: { after: string | null }) => ({
        ok:
          after === null
            ? { items: [item('ses_1')], next: 'p-2', completeness: 'complete' }
            : { items: [item('ses_2')], next: null, completeness: 'complete' },
      })),
      listArchived: vi.fn(async () => ({
        ok: { items: [item('ses_old')], next: null, completeness: 'complete' },
      })),
    })
    expect(await bound.show('ses_2')).toMatchObject({
      ok: { session: 'ses_2', title: 'title of ses_2' },
    })
    expect(await bound.show('ses_old')).toMatchObject({ ok: { session: 'ses_old' } })
    expect(await bound.show('ses_none')).toEqual({ failure: { kind: 'not-found' } })
    expect(fns.listArchived).toHaveBeenCalled()
  })

  it('stops walking after its page budget and says so', async () => {
    const { bound } = world({
      list: async () => ({
        ok: { items: [item('ses_x')], next: 'more', completeness: 'complete' },
      }),
    })
    expect(await bound.show('ses_none')).toEqual({ failure: { kind: 'limited' } })
  })

  it('reads the payload as plain JSON and searches the tenant with instants in and out', async () => {
    const { bound, fns } = world()
    expect(
      await bound.read({ session: 's', cursor: null, direction: 'forward', pageBytes: 1 }),
    ).toEqual({
      ok: {
        entries: [{ position: 'e-1', kind: 'message.user', payload: {} }],
        next: null,
        exhausted: true,
      },
    })
    const found = await bound.search({
      content: { kind: 'literals', all: ['x'], caseSensitive: false },
      sessions: null,
      archived: 'all',
      from: '2026-11-18T00:00:00Z',
      to: null,
      kinds: [],
      cursor: null,
      limit: 20,
    })
    expect(fns.search).toHaveBeenCalledWith(
      expect.objectContaining({
        principal: work(A),
        tenant: A,
        pageSize: 20,
        query: expect.objectContaining({
          scope: { kind: 'tenant' },
          from: Date.parse('2026-11-18T00:00:00Z'),
          to: null,
          modelReadable: 'only',
        }),
      }),
    )
    expect(found).toEqual({
      ok: {
        hits: [
          {
            session: 'ses_b',
            position: 'e-9',
            kind: 'message.user',
            at: '2026-11-18T10:00:00.000Z',
            snippet: { before: '', match: 'x', after: '' },
          },
        ],
        next: null,
        complete: false,
        incomplete: 'budget',
      },
    })
  })

  it('answers unavailable when a read face is not there', async () => {
    const { ports } = world()
    const bound = createBoundSessions(
      { principal: work(A), tenant: A, call: 'c', request: {} } as never,
      {
        ...ports,
        directory: () => undefined,
        search: () => undefined,
      },
    )
    expect(
      await bound.list({ ...ANY, archived: false, title: null, cursor: null, limit: 1 }),
    ).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(
      await bound.search({
        content: { kind: 'regex', pattern: 'x', caseSensitive: true },
        sessions: ['s'],
        archived: 'all',
        from: null,
        to: null,
        kinds: [],
        cursor: null,
        limit: 1,
      }),
    ).toMatchObject({ failure: { kind: 'unavailable' } })
  })
})
