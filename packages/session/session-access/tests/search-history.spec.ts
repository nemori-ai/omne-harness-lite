import { describe, expect, it } from 'vitest'
import type { SessionId } from '@omne-harness/session-contract'
import { parseInstant } from '@omne-harness/utc-instant'
import { createWorld, fixtureLogin, loginIdentity, type World } from './fixtures/world.ts'

const signal = new AbortController().signal
const ALICE = fixtureLogin('a')
const BOB = fixtureLogin('b')
const as = <P>(principal: P) => ({ principal, messageId: 'm-1', signal })
const instant = (text: string) => {
  const parsed = parseInstant(text)
  if (!parsed.ok) throw new Error(text)
  return parsed.value
}
const literals = { kind: 'literals', all: ['needle'], caseSensitive: false } as const
const search = (world: World, body: object = {}, who = ALICE) =>
  world.contribution.operations['search-history'](as(loginIdentity(who)), {
    tenant: who.tenant,
    content: literals,
    cursor: null,
    ...body,
  })
const S1 = 'session-1' as SessionId
const hit = {
  session: S1,
  position: '7' as never,
  kind: 'message.user' as const,
  at: Date.parse('2026-11-19T01:02:03.004Z'),
  snippet: { before: 'a ', match: 'needle', after: ' here' },
}

describe('search-history', () => {
  it('asks the search with the principal of the login and the defaults of a search', async () => {
    const world = createWorld()
    expect(await search(world)).toEqual({
      outcome: 'succeeded',
      body: { hits: [], next: null, complete: true, incomplete: null },
    })
    expect(world.searching.calls()).toEqual([
      {
        principal: world.issue(ALICE),
        tenant: ALICE.tenant,
        cursor: null,
        pageSize: 20,
        query: {
          scope: { kind: 'tenant' },
          archived: 'all',
          from: null,
          to: null,
          kinds: [],
          modelReadable: 'only',
          content: literals,
        },
      },
    ])
  })

  it('passes on every part of the range, the type and the content, with times in milliseconds', async () => {
    const world = createWorld()
    const pattern = { kind: 'regex', pattern: 'a+', caseSensitive: true } as const
    await search(world, {
      sessions: [S1],
      archived: 'archived',
      from: instant('2026-11-01T00:00:00Z'),
      to: instant('2026-11-02T00:00:00.5Z'),
      kinds: ['message.user'],
      modelReadable: 'any',
      content: pattern,
      cursor: 'sealed',
      limit: 7,
    })
    expect(world.searching.calls()[0]).toMatchObject({
      cursor: 'sealed',
      pageSize: 7,
      query: {
        scope: { kind: 'sessions', sessions: [S1] },
        archived: 'archived',
        from: Date.parse('2026-11-01T00:00:00Z'),
        to: Date.parse('2026-11-02T00:00:00.500Z'),
        kinds: ['message.user'],
        modelReadable: 'any',
        content: pattern,
      },
    })
    await search(world, { sessions: null })
    expect(world.searching.calls()[1]?.query.scope).toEqual({ kind: 'tenant' })
  })

  it('answers the hits with their times as instants, and a page that is not through as it is', async () => {
    const world = createWorld()
    const incomplete = { reason: 'tail-budget', behind: 2, progress: null } as const
    world.searching.answer({
      ok: { hits: [hit, { ...hit, at: null }], next: 'sealed', complete: false, incomplete },
    })
    expect(await search(world)).toEqual({
      outcome: 'succeeded',
      body: {
        hits: [
          { ...hit, at: instant('2026-11-19T01:02:03.004Z') },
          { ...hit, at: null },
        ],
        next: 'sealed',
        complete: false,
        incomplete,
      },
    })
  })

  it.each([
    [{ kind: 'denied' }, { outcome: 'denied' }],
    [{ kind: 'limited' }, { outcome: 'limited', body: {} }],
    [{ kind: 'unavailable', diagnostic: 'd' }, { outcome: 'basis-unavailable' }],
    [
      { kind: 'invalid', field: 'query', reason: 'pattern-invalid' },
      { outcome: 'invalid', body: { field: 'query', reason: 'pattern-invalid' } },
    ],
    [
      { kind: 'invalid', field: 'cursor', reason: 'the index was rebuilt' },
      { outcome: 'invalid', body: { field: 'cursor', reason: 'the index was rebuilt' } },
    ],
    [
      { kind: 'invalid', field: 'pageSize', reason: 'from 1 to 100' },
      { outcome: 'invalid', body: { field: 'limit', reason: 'from 1 to 100' } },
    ],
  ] as const)('maps the failure %j of the search', async (failure, answer) => {
    const world = createWorld()
    world.searching.answer({ failure })
    expect(await search(world)).toEqual(answer)
  })

  it('answers basis-unavailable when the search throws, is not there, or gives a time out of range', async () => {
    const world = createWorld()
    world.searching.answer('throw')
    expect(await search(world)).toEqual({ outcome: 'basis-unavailable' })
    world.searching.answer({
      ok: { hits: [{ ...hit, at: 8.7e15 }], next: null, complete: true, incomplete: null },
    })
    expect(await search(world)).toEqual({ outcome: 'basis-unavailable' })
    world.remove('searching')
    expect(await search(world)).toEqual({ outcome: 'basis-unavailable' })
    expect(world.searching.calls()).toHaveLength(2)
  })

  it('does not reach the search when the login may not act for the tenant, or that is not known', async () => {
    const world = createWorld()
    expect(await search(world, { tenant: BOB.tenant })).toEqual({ outcome: 'denied' })
    world.refuseTargets('basis-unavailable')
    expect(await search(world)).toEqual({ outcome: 'basis-unavailable' })
    world.refuseTargets('throw')
    expect(await search(world)).toEqual({ outcome: 'basis-unavailable' })
    expect(world.searching.calls()).toEqual([])
  })
})
