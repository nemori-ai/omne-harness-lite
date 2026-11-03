import { describe, expect, it, vi } from 'vitest'
import {
  calendarResolveSchema,
  calendarResolveResultSchema,
  calendarSnapshotSchema,
  calendarIdSchema,
} from '@omne-harness/calendar-contract'
import {
  createCalendarQueries,
  DEFAULT_SCAN_BUDGET,
  classifyDay,
  countWorkingDays,
  shiftWorkingDays,
  listWorkingDays,
  selectNthWorkingDay,
} from '../../src/index.ts'
import type { CalendarAuthorityReader, CalendarEnvironmentReader } from '../../src/index.ts'
import { context, snapshot, request, repository, directory, entry } from './fixture.ts'

function setup() {
  const store = repository()
  const authority = {
    check: vi.fn<CalendarAuthorityReader['check']>().mockResolvedValue({ kind: 'allowed' }),
  }
  const environment = {
    read: vi.fn<CalendarEnvironmentReader['read']>().mockResolvedValue({
      kind: 'found',
      value: {
        owner: context.owner,
        revision: 'rev-a',
        timezone: 'Asia/Tokyo',
        calendarId: snapshot.calendarId,
      },
    }),
  }
  const clock = { now: vi.fn(() => 1793664000000) }
  const queries = createCalendarQueries({
    repository: store,
    authority,
    environment,
    clock,
    catalog: [
      {
        calendarId: calendarIdSchema.parse('unpublished'),
        timezone: 'UTC',
        semanticBoundary: 'configured',
      },
    ],
  })
  return { store, authority, environment, clock, queries }
}

describe('calendar queries', () => {
  it('lists and gets without environment; separates empty, failure and unpublished metadata', async () => {
    const { queries, store, environment, clock } = setup()
    environment.read.mockResolvedValue({ kind: 'missing' })
    const result = await queries.list(context)
    expect(store.listVersions).toHaveBeenLastCalledWith({
      calendarId: 'cn',
      after: null,
      limit: 20,
    })
    expect(result).toMatchObject({
      kind: 'ok',
      value: {
        items: [{ calendarId: 'cn', publishedVersionId: 'v1', supplyStanding: null }],
        nextCursor: 'c:0',
        observedAt: '2026-11-03T00:00:00.000Z',
      },
    })
    expect(await queries.list(context, { after: 'c:0' })).toMatchObject({
      kind: 'ok',
      value: {
        items: [
          {
            calendarId: 'unpublished',
            publishedVersionId: null,
            versions: { items: [], nextCursor: null },
          },
        ],
        nextCursor: null,
      },
    })
    expect(await queries.get(context, { calendarId: snapshot.calendarId })).toMatchObject({
      kind: 'ok',
      value: { versions: { items: [{ isPublished: true }] } },
    })
    expect(environment.read).not.toHaveBeenCalled()
    expect(store.getSnapshot).not.toHaveBeenCalled()
    expect(clock.now).toHaveBeenCalledTimes(3)
    store.listCalendars.mockResolvedValue({ kind: 'unavailable', reason: 'secret' })
    expect(await queries.list(context)).toMatchObject({
      kind: 'error',
      error: { code: 'provider_failure', details: {} },
    })
  })
  it('rejects unknown and unauthorized calendars identically and never reads rejected inputs', async () => {
    const { queries, store, authority } = setup()
    expect(
      await queries.get(context, { calendarId: calendarIdSchema.parse('missing') }),
    ).toMatchObject({ kind: 'error', error: { code: 'not_found' } })
    store.getCalendar.mockClear()
    authority.check.mockResolvedValue({ kind: 'denied' })
    expect(await queries.resolve(context, request)).toMatchObject({
      kind: 'error',
      error: { code: 'not_found' },
    })
    expect(store.getCalendar).not.toHaveBeenCalled()
    expect(store.getSnapshot).not.toHaveBeenCalled()
    authority.check.mockResolvedValue({ kind: 'unauthenticated' })
    expect(await queries.list(context)).toMatchObject({
      kind: 'error',
      error: { code: 'unauthenticated' },
    })
    authority.check.mockRejectedValue(new Error('secret'))
    expect(await queries.get(context, { calendarId: snapshot.calendarId })).toMatchObject({
      kind: 'error',
      error: { code: 'authority_unavailable' },
    })
    expect(await queries.list(context, { limit: 0 })).toMatchObject({
      kind: 'error',
      error: { code: 'invalid_input' },
    })
    expect(store.listCalendars).not.toHaveBeenCalled()
  })
  it('captures one owner-matched environment bundle and never substitutes missing selection', async () => {
    const { queries, environment, store } = setup()
    expect(await queries.effective(context)).toMatchObject({
      kind: 'ok',
      value: {
        owner: context.owner,
        environmentRevision: 'rev-a',
        activeTimezone: 'Asia/Tokyo',
        calendar: { calendarId: 'cn', timezone: 'Asia/Shanghai' },
      },
    })
    expect(environment.read).toHaveBeenCalledTimes(1)
    environment.read.mockResolvedValue({
      kind: 'found',
      value: {
        owner: { kind: 'tenant', tenantId: 'other', ownerId: 'owner-a' },
        revision: 'rev-b',
        timezone: 'UTC',
        calendarId: snapshot.calendarId,
      },
    })
    store.getCalendar.mockClear()
    expect(await queries.effective(context)).toMatchObject({
      kind: 'error',
      error: { code: 'environment_incoherent' },
    })
    expect(store.getCalendar).not.toHaveBeenCalled()
    environment.read.mockResolvedValue({ kind: 'missing' })
    expect(await queries.effective(context)).toMatchObject({
      kind: 'error',
      error: { code: 'missing_environment' },
    })
    environment.read.mockRejectedValue(new Error('private settings'))
    expect(await queries.effective(context)).toMatchObject({
      kind: 'error',
      error: { code: 'provider_failure', details: {} },
    })
  })
  it('uses the exact selected snapshot across latest/pinned and explicit/effective calls', async () => {
    const { queries, store, environment } = setup()
    const next = calendarSnapshotSchema.parse({
      ...snapshot,
      versionId: 'v2',
      publicationGeneration: 2,
      weeklyDefault: Array(7).fill('holiday'),
    })
    store.getSnapshot.mockImplementation(async input => ({
      kind: 'ok',
      value: input.version.kind === 'pinned' ? snapshot : next,
    }))
    for (const selection of [{ kind: 'effective' }, { kind: 'explicit', calendarId: 'cn' }]) {
      for (const version of [{ kind: 'latest' }, { kind: 'pinned', versionId: 'v1' }]) {
        const input = calendarResolveSchema.parse({ ...request, selection, version })
        const result = await queries.resolve(context, input)
        expect(result).toMatchObject({
          kind: 'ok',
          value: {
            versionId: version.kind === 'pinned' ? 'v1' : 'v2',
            result: { kind: 'day', value: { working: version.kind === 'pinned' } },
          },
        })
        expect(
          calendarResolveResultSchema.safeParse(JSON.parse(JSON.stringify(result))).success,
        ).toBe(true)
      }
    }
    expect(store.getSnapshot).toHaveBeenCalledTimes(4)
    expect(environment.read).toHaveBeenCalledTimes(2)
  })
  it('delegates all five algorithms with complete basis and retains empty and boundary failures', async () => {
    const { queries, store } = setup()
    const cases = [
      {
        query: { kind: 'day', date: '2026-01-01' },
        expected: classifyDay({ snapshot, date: '2026-01-01' }),
      },
      {
        query: { kind: 'count', from: '2026-01-01', to: '2026-01-04' },
        expected: countWorkingDays({ snapshot, from: '2026-01-01', to: '2026-01-04' }),
      },
      {
        query: { kind: 'shift', date: '2026-01-01', offset: -0 },
        expected: shiftWorkingDays({ snapshot, date: '2026-01-01', offset: 0 }),
      },
      {
        query: { kind: 'next', after: '2026-01-01', count: 2 },
        expected: listWorkingDays({ snapshot, after: '2026-01-01', count: 2 }),
      },
      {
        query: { kind: 'nth', periodStart: '2026-01-03', periodEnd: '2026-01-04', ordinal: 1 },
        expected: selectNthWorkingDay({
          snapshot,
          periodStart: '2026-01-03',
          periodEnd: '2026-01-04',
          ordinal: 1,
        }),
      },
    ]
    for (const row of cases) {
      const result = await queries.resolve(
        context,
        calendarResolveSchema.parse({ ...request, query: row.query }),
      )
      expect(result).toMatchObject({
        kind: 'ok',
        value: { result: { kind: row.query.kind, value: row.expected } },
      })
    }
    expect(
      await queries.resolve(
        context,
        calendarResolveSchema.parse({
          ...request,
          version: { kind: 'pinned', versionId: 'absent' },
        }),
      ),
    ).toMatchObject({ kind: 'error', error: { code: 'unknown_calendar_version' } })
    const edge = calendarSnapshotSchema.parse({
      ...snapshot,
      coverageStart: '9999-12-31',
      coverageEnd: '9999-12-31',
    })
    store.getSnapshot.mockResolvedValue({ kind: 'ok', value: edge })
    expect(
      await queries.resolve(
        context,
        calendarResolveSchema.parse({
          ...request,
          query: { kind: 'shift', date: '9999-12-31', offset: 1 },
        }),
      ),
    ).toMatchObject({
      kind: 'error',
      error: {
        code: 'coverage_insufficient',
        details: {
          date: null,
          boundary: 'afterMaximum',
          coverageStart: '9999-12-31',
          coverageEnd: '9999-12-31',
        },
      },
    })
    const long = calendarSnapshotSchema.parse({
      ...snapshot,
      coverageStart: '0000-01-01',
      coverageEnd: '9999-12-31',
      weeklyDefault: Array(7).fill('holiday'),
    })
    store.getSnapshot.mockResolvedValue({ kind: 'ok', value: long })
    expect(
      await queries.resolve(
        context,
        calendarResolveSchema.parse({
          ...request,
          query: { kind: 'next', after: '0000-01-01', count: 1 },
        }),
      ),
    ).toMatchObject({
      kind: 'error',
      error: {
        code: 'search_limit',
        details: { scanBudget: DEFAULT_SCAN_BUDGET, inspectedDays: DEFAULT_SCAN_BUDGET },
      },
    })
  })
  it('rechecks current qualification after an awaited read before disclosing any facts', async () => {
    const { queries, store, authority } = setup()
    let finish: (() => void) | undefined
    const waiting = new Promise<void>(resolve => {
      finish = resolve
    })
    let started: (() => void) | undefined
    const reading = new Promise<void>(resolve => {
      started = resolve
    })
    store.getSnapshot.mockImplementation(async () => {
      started?.()
      await waiting
      return { kind: 'ok', value: snapshot }
    })
    const pending = queries.resolve(context, request)
    await reading
    authority.check.mockResolvedValue({ kind: 'denied' })
    finish?.()
    expect(await pending).toMatchObject({
      kind: 'error',
      error: { code: 'not_found', details: {} },
    })
  })
  it('preserves version cursors and bounds directory and repeated repository work', async () => {
    const { queries, store, environment } = setup()
    store.listVersions.mockResolvedValue({
      kind: 'ok',
      value: { items: [entry()], nextCursor: 'version-next' },
    })
    expect(
      await queries.get(context, {
        calendarId: snapshot.calendarId,
        versionsAfter: 'version-before',
        versionsLimit: 1,
      }),
    ).toMatchObject({ kind: 'ok', value: { versions: { nextCursor: 'version-next' } } })
    expect(store.listVersions).toHaveBeenLastCalledWith({
      calendarId: 'cn',
      after: 'version-before',
      limit: 1,
    })
    store.listCalendars.mockResolvedValue({
      kind: 'ok',
      value: { items: [directory()], nextCursor: 'repo-next' },
    })
    expect(await queries.list(context, { limit: 1 })).toMatchObject({
      kind: 'ok',
      value: { nextCursor: 'r:repo-next' },
    })
    store.getCalendar.mockClear()
    for (let index = 0; index < 100; index++) await queries.resolve(context, request)
    expect(store.getSnapshot).toHaveBeenCalledTimes(100)
    expect(store.getCalendar).toHaveBeenCalledTimes(100)
    for (let index = 0; index < 100; index++) await queries.resolve(context, request)
    expect(store.getSnapshot).toHaveBeenCalledTimes(200)
    expect(store.getCalendar).toHaveBeenCalledTimes(200)
    expect(environment.read).not.toHaveBeenCalled()
  })
})

it('keeps captured publication facts when publication changes during a read', async () => {
  const { queries, store, authority } = setup()
  const mutable = directory()
  store.getCalendar.mockResolvedValue({ kind: 'ok', value: mutable })
  store.listVersions.mockImplementation(async () => {
    mutable.current.versionId = calendarSnapshotSchema.parse({
      ...snapshot,
      versionId: 'v2',
    }).versionId
    mutable.current.publicationGeneration = 2
    return { kind: 'ok', value: { items: [entry()], nextCursor: null } }
  })
  expect(await queries.get(context, { calendarId: snapshot.calendarId })).toMatchObject({
    kind: 'ok',
    value: {
      publishedVersionId: 'v1',
      publicationGeneration: 1,
      versions: { items: [{ versionId: 'v1', isPublished: true }] },
    },
  })
  authority.check.mockImplementation(async () => {
    store.getSnapshot.mockResolvedValue({
      kind: 'ok',
      value: calendarSnapshotSchema.parse({ ...snapshot, versionId: 'v3' }),
    })
    return { kind: 'allowed' }
  })
  store.getSnapshot.mockResolvedValueOnce({ kind: 'ok', value: snapshot })
  expect(await queries.resolve(context, request)).toMatchObject({
    kind: 'ok',
    value: { versionId: 'v1', result: { value: { basis: { versionId: 'v1' } } } },
  })
  expect(store.getSnapshot).toHaveBeenCalledTimes(1)
})

it('filters directory entries by current authority and checks failures before returning data', async () => {
  const { queries, store, authority } = setup()
  authority.check.mockImplementation(async ({ calendarId }) => ({
    kind: calendarId === null ? 'allowed' : 'denied',
  }))
  expect(await queries.list(context)).toMatchObject({ kind: 'ok', value: { items: [] } })
  expect(store.listVersions).not.toHaveBeenCalled()
  authority.check.mockResolvedValue({ kind: 'allowed' })
  store.getSnapshot.mockImplementation(async () => {
    authority.check.mockResolvedValue({ kind: 'denied' })
    return { kind: 'ok', value: null }
  })
  expect(await queries.resolve(context, request)).toMatchObject({
    kind: 'error',
    error: { code: 'not_found', details: {} },
  })
})

it('rejects malformed host context, missing authority, invalid cursors and provider corruption', async () => {
  const { queries, store, environment, authority } = setup()
  expect(
    await Reflect.apply(queries.resolve, queries, [{ ...context, permission: true }, request]),
  ).toMatchObject({ kind: 'error', error: { code: 'invalid_input' } })
  expect(store.getCalendar).not.toHaveBeenCalled()
  expect(authority.check).not.toHaveBeenCalled()
  expect(await queries.list(context, { after: 'bad-cursor' })).toMatchObject({
    kind: 'error',
    error: { code: 'invalid_input' },
  })
  expect(store.listCalendars).not.toHaveBeenCalled()
  authority.check.mockResolvedValue({ kind: 'unavailable' })
  expect(await queries.resolve(context, request)).toMatchObject({
    kind: 'error',
    error: { code: 'authority_unavailable' },
  })
  authority.check.mockResolvedValue({ kind: 'allowed' })
  environment.read.mockResolvedValue({
    kind: 'found',
    value: {
      owner: context.owner,
      revision: 'r1',
      timezone: 'bad/zone',
      calendarId: snapshot.calendarId,
    },
  })
  expect(await queries.effective(context)).toMatchObject({
    kind: 'error',
    error: { code: 'invalid_timezone' },
  })
  environment.read.mockResolvedValue({
    kind: 'found',
    value: { owner: context.owner, revision: 'r1', timezone: 'UTC', calendarId: null },
  })
  expect(await queries.effective(context)).toMatchObject({
    kind: 'error',
    error: { code: 'missing_environment' },
  })
  store.getSnapshot.mockResolvedValue({
    kind: 'ok',
    value: calendarSnapshotSchema.parse({ ...snapshot, calendarId: 'other' }),
  })
  expect(await queries.resolve(context, request)).toMatchObject({
    kind: 'error',
    error: { code: 'provider_failure', details: {} },
  })
  store.getSnapshot.mockRejectedValue(new Error('secret credentials'))
  expect(await queries.resolve(context, request)).toMatchObject({
    kind: 'error',
    error: { code: 'provider_failure', details: {} },
  })
})

it('keeps system and tenant owners distinct and forwards the exact authorization action', async () => {
  const { queries, environment, authority, store } = setup()
  const system = {
    ...context,
    owner: { kind: 'system', systemScopeRef: 'maintenance' },
  } satisfies typeof context
  environment.read.mockResolvedValue({
    kind: 'found',
    value: {
      owner: system.owner,
      revision: 'system-r1',
      timezone: 'UTC',
      calendarId: snapshot.calendarId,
    },
  })
  expect(await queries.effective(system)).toMatchObject({
    kind: 'ok',
    value: { owner: system.owner },
  })
  for (const owner of [{ kind: 'system', systemScopeRef: 'other' }, context.owner] as const) {
    environment.read.mockResolvedValue({
      kind: 'found',
      value: { owner, revision: 'r1', timezone: 'UTC', calendarId: snapshot.calendarId },
    })
    expect(await queries.effective(system)).toMatchObject({
      kind: 'error',
      error: { code: 'environment_incoherent' },
    })
  }
  environment.read.mockResolvedValue({
    kind: 'found',
    value: {
      owner: system.owner,
      revision: 'r1',
      timezone: 'UTC',
      calendarId: snapshot.calendarId,
    },
  })
  expect(await queries.effective(context)).toMatchObject({
    kind: 'error',
    error: { code: 'environment_incoherent' },
  })
  environment.read.mockResolvedValue({
    kind: 'found',
    value: {
      owner: { kind: 'tenant', tenantId: 'tenant-a', ownerId: 'other' },
      revision: 'r1',
      timezone: 'UTC',
      calendarId: snapshot.calendarId,
    },
  })
  expect(await queries.effective(context)).toMatchObject({
    kind: 'error',
    error: { code: 'environment_incoherent' },
  })
  authority.check.mockClear()
  await queries.list(context)
  expect(
    authority.check.mock.calls.every(
      ([input]) => input.action === 'list' && input.context.authContextRef === 'auth-a',
    ),
  ).toBe(true)
  authority.check.mockClear()
  await queries.get(context, { calendarId: snapshot.calendarId })
  expect(authority.check.mock.calls.every(([input]) => input.action === 'get')).toBe(true)
  authority.check.mockClear()
  await queries.resolve(context, request)
  expect(authority.check.mock.calls.every(([input]) => input.action === 'resolve')).toBe(true)
  authority.check.mockClear()
  environment.read.mockResolvedValue({ kind: 'unavailable' })
  expect(await queries.effective(context)).toMatchObject({
    kind: 'error',
    error: { code: 'provider_failure', retryable: true, requestId: context.requestId },
  })
  expect(authority.check.mock.calls.every(([input]) => input.action === 'effective')).toBe(true)
  environment.read.mockResolvedValue({
    kind: 'found',
    value: { owner: context.owner, revision: '', timezone: 'UTC', calendarId: snapshot.calendarId },
  })
  expect(await queries.effective(context)).toMatchObject({
    kind: 'error',
    error: { code: 'environment_incoherent', retryable: false },
  })
  authority.check.mockResolvedValue({ kind: 'denied' })
  expect(await queries.list(context)).toMatchObject({
    kind: 'error',
    error: { code: 'forbidden', retryable: false },
  })
  authority.check.mockResolvedValue({ kind: 'allowed' })
  store.listCalendars.mockImplementation(async () => {
    authority.check.mockResolvedValue({ kind: 'denied' })
    return { kind: 'ok', value: { items: [], nextCursor: null } }
  })
  expect(await queries.list(context)).toMatchObject({ kind: 'error', error: { code: 'forbidden' } })
})

it('continues directory and catalog pages without duplicates or unauthorized definitions', async () => {
  const { store, authority, environment, clock } = setup()
  const catalog = [
    { calendarId: snapshot.calendarId, timezone: 'UTC', semanticBoundary: 'must-use-stored' },
    {
      calendarId: calendarIdSchema.parse('unpublished-a'),
      timezone: 'UTC',
      semanticBoundary: 'configured-a',
    },
    {
      calendarId: calendarIdSchema.parse('unpublished-b'),
      timezone: 'UTC',
      semanticBoundary: 'configured-b',
    },
  ]
  const queries = createCalendarQueries({
    repository: store,
    authority,
    environment,
    clock,
    catalog,
  })
  expect(await queries.list(context, { after: 'r:opaque', limit: 1 })).toMatchObject({ kind: 'ok' })
  expect(store.listCalendars).toHaveBeenLastCalledWith({ after: 'opaque', limit: 1 })
  expect(await queries.list(context, { after: 'c:0', limit: 1 })).toMatchObject({
    kind: 'ok',
    value: { items: [], nextCursor: 'c:1' },
  })
  expect(await queries.list(context, { after: 'c:1', limit: 1 })).toMatchObject({
    kind: 'ok',
    value: { items: [{ calendarId: 'unpublished-a' }], nextCursor: 'c:2' },
  })
  authority.check.mockImplementation(async ({ calendarId }) => ({
    kind: calendarId === catalog[2]?.calendarId ? 'denied' : 'allowed',
  }))
  expect(await queries.list(context, { after: 'c:2', limit: 1 })).toMatchObject({
    kind: 'ok',
    value: { items: [], nextCursor: null },
  })
  expect(await queries.list(context, { after: 'c:3', limit: 1 })).toMatchObject({
    kind: 'ok',
    value: { items: [], nextCursor: null },
  })
  expect(
    await queries.get(context, { calendarId: calendarIdSchema.parse('unpublished-a') }),
  ).toMatchObject({
    kind: 'ok',
    value: { publishedVersionId: null, semanticBoundary: 'configured-a' },
  })
  for (const after of [
    'r:',
    'xc:0',
    'c:0x',
    'c:00',
    'c:-1',
    'c:4',
    'c:101',
    'c:9007199254740992',
  ]) {
    expect(await queries.list(context, { after })).toMatchObject({
      kind: 'error',
      error: { code: 'invalid_input' },
    })
  }
  const withoutCatalog = createCalendarQueries({
    repository: store,
    authority,
    environment,
    clock,
    catalog: [],
  })
  expect(await withoutCatalog.list(context)).toMatchObject({
    kind: 'ok',
    value: { nextCursor: null },
  })
  expect(() =>
    createCalendarQueries({
      repository: store,
      authority,
      environment,
      clock,
      catalog: [
        { calendarId: snapshot.calendarId, timezone: 'UTC', semanticBoundary: 'one' },
        { calendarId: snapshot.calendarId, timezone: 'UTC', semanticBoundary: 'two' },
      ],
    }),
  ).toThrow()
})

it('rejects provider identity, version and page bound violations without leaking diagnostics', async () => {
  const { queries, store, authority } = setup()
  const other = calendarSnapshotSchema.parse({
    ...snapshot,
    calendarId: 'other',
    versionId: 'v-other',
  })
  store.getCalendar.mockResolvedValue({ kind: 'ok', value: directory(other) })
  store.listVersions.mockResolvedValue({
    kind: 'ok',
    value: { items: [entry(other)], nextCursor: null },
  })
  expect(await queries.get(context, { calendarId: snapshot.calendarId })).toEqual({
    kind: 'error',
    error: {
      code: 'provider_failure',
      message: 'provider_failure',
      retryable: true,
      requestId: context.requestId,
      details: {},
    },
  })
  store.getCalendar.mockResolvedValue({ kind: 'ok', value: directory() })
  store.listVersions.mockResolvedValue({
    kind: 'ok',
    value: { items: [entry(other)], nextCursor: null },
  })
  expect(await queries.get(context, { calendarId: snapshot.calendarId })).toMatchObject({
    kind: 'error',
    error: { code: 'provider_failure' },
  })
  store.listVersions.mockResolvedValue({
    kind: 'ok',
    value: { items: [entry(), entry()], nextCursor: null },
  })
  expect(
    await queries.get(context, { calendarId: snapshot.calendarId, versionsLimit: 1 }),
  ).toMatchObject({ kind: 'error', error: { code: 'provider_failure' } })
  store.listCalendars.mockResolvedValue({
    kind: 'ok',
    value: { items: [directory(), directory()], nextCursor: null },
  })
  expect(await queries.list(context, { limit: 1 })).toMatchObject({
    kind: 'error',
    error: { code: 'provider_failure' },
  })
  const newer = calendarSnapshotSchema.parse({ ...snapshot, versionId: 'v2' })
  store.getSnapshot.mockResolvedValue({ kind: 'ok', value: newer })
  expect(
    await queries.resolve(
      context,
      calendarResolveSchema.parse({ ...request, version: { kind: 'pinned', versionId: 'v1' } }),
    ),
  ).toMatchObject({ kind: 'error', error: { code: 'provider_failure' } })
  store.listVersions.mockResolvedValue({
    kind: 'ok',
    value: { items: [entry(newer), entry()], nextCursor: null },
  })
  expect(await queries.get(context, { calendarId: snapshot.calendarId })).toMatchObject({
    kind: 'ok',
    value: {
      versions: {
        items: [
          { versionId: 'v2', isPublished: false },
          { versionId: 'v1', isPublished: true },
        ],
      },
    },
  })
  store.getCalendar.mockResolvedValue({ kind: 'unavailable', reason: 'secret-provider-diagnostic' })
  expect(await queries.get(context, { calendarId: snapshot.calendarId })).toMatchObject({
    kind: 'error',
    error: { code: 'provider_failure', details: {} },
  })
  authority.check.mockResolvedValue({ kind: 'unavailable' })
  expect(await queries.resolve(context, request)).toMatchObject({
    kind: 'error',
    error: { code: 'authority_unavailable', retryable: true },
  })
})
