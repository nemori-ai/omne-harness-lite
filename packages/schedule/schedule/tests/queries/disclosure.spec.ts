import { describe, expect, it } from 'vitest'
import { createScheduleQueryApplication } from '@omne-harness/schedule'
import {
  ScheduleCallContextSchema,
  ScheduleExecutionRowSchema,
  ScheduleInstantSchema,
  SchedulePreviewRequestSchema,
  type ScheduleDomainError,
} from '@omne-harness/schedule-contract'
import { context, fixture, listRequest, now } from './fixtures.ts'

const error: ScheduleDomainError = {
  code: 'forbidden',
  message: 'No read right',
  retryable: false,
  requestId: context.requestId,
  details: {},
}
function first(f: ReturnType<typeof fixture>) {
  const record = f.records[0]
  if (!record) throw new Error('Fixture requires a schedule')
  return record
}

describe('current permission and provider boundaries', () => {
  it.each(['owner', 'principal', 'visibility', 'author'] as const)(
    'rejects mismatched %s without disclosing a schedule',
    async mismatch => {
      const f = fixture()
      if (mismatch === 'owner')
        f.state.access = {
          ...f.state.access,
          owner: { kind: 'tenant', tenantId: 't1', ownerId: 'bob' },
        }
      if (mismatch === 'principal') f.state.access = { ...f.state.access, principalRef: 'bob' }
      if (mismatch === 'visibility')
        f.state.access = { ...f.state.access, visibility: { kind: 'grantedIds', scheduleIds: [] } }
      if (mismatch === 'author')
        f.state.access = {
          ...f.state.access,
          visibility: {
            kind: 'authoredIds',
            scheduleIds: [first(f).view.scheduleId],
            author: { kind: 'human', actorRef: 'bob' },
          },
        }
      const result = await createScheduleQueryApplication(f.dependencies).queries.get(context, {
        scheduleId: first(f).view.scheduleId,
      })
      expect(result).toMatchObject({
        kind: 'error',
        error: { code: mismatch === 'author' ? 'provider_failure' : 'forbidden' },
      })
      expect(result).not.toHaveProperty('value')
    },
  )
  it('does not accept a reader label as authority or call storage after denial', async () => {
    const f = fixture()
    f.dependencies.authorizer.observe = async () => ({ kind: 'unavailable', error })
    expect(
      await createScheduleQueryApplication(f.dependencies).queries.list(context, listRequest),
    ).toEqual({ kind: 'error', error })
    expect(f.calls).toEqual([])
  })
  it.each(['list', 'get', 'revisions', 'executions', 'preview'] as const)(
    'confirms current authority before returning %s',
    async method => {
      const f = fixture()
      f.dependencies.authorizer.confirm = async () => ({ kind: 'unavailable', error })
      const queries = createScheduleQueryApplication(f.dependencies).queries
      const scheduleId = first(f).view.scheduleId
      const result =
        method === 'list'
          ? await queries.list(context, listRequest)
          : method === 'get'
            ? await queries.get(context, { scheduleId })
            : method === 'revisions'
              ? await queries.revisions(context, { scheduleId, cursor: null, limit: 50 })
              : method === 'executions'
                ? await queries.executions(context, {
                    scheduleId,
                    cursor: null,
                    limit: 50,
                    from: null,
                    to: null,
                  })
                : await queries.preview(context, {
                    source: { kind: 'schedule', scheduleId },
                    after: now,
                    count: 1,
                  })
      expect(result).toEqual({ kind: 'error', error })
    },
  )
  it('compares the full returned access rather than only its revision', async () => {
    const f = fixture()
    f.dependencies.authorizer.confirm = async () => ({
      kind: 'ok',
      value: { ...f.state.access, visibility: { kind: 'grantedIds', scheduleIds: [] } },
    })
    expect(
      await createScheduleQueryApplication(f.dependencies).queries.list(context, listRequest),
    ).toMatchObject({ kind: 'error', error: { code: 'stale_cursor' } })
  })
  it('rejects malformed provider envelopes and provider throws', async () => {
    for (const malformed of [null, { kind: 'ok' }, { kind: 'absent', secret: 'extra' }]) {
      const f = fixture()
      Object.assign(f.dependencies.store, { listSchedules: async () => malformed })
      expect(
        await createScheduleQueryApplication(f.dependencies).queries.list(context, listRequest),
      ).toMatchObject({ kind: 'error', error: { code: 'provider_failure' } })
    }
    const f = fixture()
    f.dependencies.authorizer.observe = async () => {
      throw new Error('provider offline')
    }
    expect(
      await createScheduleQueryApplication(f.dependencies).queries.list(context, listRequest),
    ).toMatchObject({ kind: 'error', error: { code: 'provider_failure' } })
  })
  it('validates all inputs before provider calls', async () => {
    const f = fixture()
    const result = await createScheduleQueryApplication(f.dependencies).queries.list(context, {
      ...listRequest,
      limit: 201,
    })
    expect(result).toMatchObject({ kind: 'error', error: { code: 'invalid_input' } })
    expect(f.calls).toEqual([])
  })
  it('does not expose another owner returned by the store', async () => {
    const f = fixture()
    first(f).view.owner = { kind: 'tenant', tenantId: 't1', ownerId: 'bob' }
    expect(
      await createScheduleQueryApplication(f.dependencies).queries.list(context, listRequest),
    ).toMatchObject({ kind: 'error', error: { code: 'provider_failure' } })
  })
})

describe('stable simple reads', () => {
  it.each(['query', 'owner', 'principal', 'authority', 'data'] as const)(
    'rejects list cursor changes to %s',
    async change => {
      const f = fixture(2)
      const queries = createScheduleQueryApplication(f.dependencies).queries
      const request = { ...listRequest, limit: 1 }
      const initial = await queries.list(context, request)
      if (initial.kind !== 'ok') throw new Error('Expected page')
      let nextContext = context
      if (change === 'owner') {
        nextContext = ScheduleCallContextSchema.parse({
          ...context,
          owner: { kind: 'tenant', tenantId: 't1', ownerId: 'bob' },
        })
        f.state.access = { ...f.state.access, owner: nextContext.owner }
      }
      if (change === 'principal') {
        nextContext = ScheduleCallContextSchema.parse({ ...context, principalRef: 'bob' })
        f.state.access = { ...f.state.access, principalRef: 'bob' }
      }
      if (change === 'authority')
        f.state.access = { ...f.state.access, authorityRevision: 'auth:2' }
      if (change === 'data') f.state.dataRevision = 'data:2'
      expect(
        await queries.list(nextContext, {
          ...request,
          limit: change === 'query' ? 2 : 1,
          cursor: initial.value.nextCursor,
        }),
      ).toMatchObject({ kind: 'error', error: { code: 'stale_cursor' } })
    },
  )
  it('passes all list filters and a decoded provider cursor without recalculating totals', async () => {
    const f = fixture(3)
    const queries = createScheduleQueryApplication(f.dependencies).queries
    const page = await queries.list(context, { ...listRequest, control: 'active', limit: 2 })
    if (page.kind !== 'ok') throw new Error('Expected first page')
    const second = await queries.list(context, {
      ...listRequest,
      control: 'active',
      limit: 2,
      cursor: page.value.nextCursor,
    })
    expect(second).toMatchObject({
      kind: 'ok',
      value: { total: { kind: 'exact', value: 3 }, nextCursor: null },
    })
    if (second.kind === 'ok')
      expect(second.value.items.map(row => row.scheduleId)).toEqual([f.records[2]?.view.scheduleId])
  })
  it('requires an authoritative history observation even for an empty ledger', async () => {
    const f = fixture()
    const queries = createScheduleQueryApplication(f.dependencies).queries
    const request = {
      scheduleId: first(f).view.scheduleId,
      cursor: null,
      limit: 50,
      from: null,
      to: null,
    }
    expect(await queries.executions(context, request)).toMatchObject({
      kind: 'ok',
      value: { items: [], total: { kind: 'exact', value: 0 } },
    })
    f.dependencies.history.observe = async () => ({ kind: 'absent' })
    expect(await queries.executions(context, request)).toMatchObject({
      kind: 'error',
      error: { code: 'dependency_blocked' },
    })
    f.dependencies.history.observe = async () => ({ kind: 'unavailable', error })
    expect(await queries.executions(context, request)).toEqual({ kind: 'error', error })
  })
  it('preserves original history and rejects a changed history confirmation', async () => {
    const f = fixture()
    const candidate = first(f).view.nextOccurrence
    if (!candidate) throw new Error('Expected candidate')
    const row = ScheduleExecutionRowSchema.parse({
      rowRef: 'row:1',
      scheduleId: first(f).view.scheduleId,
      occurrenceKey: 'occ:1',
      originalScheduledAt: candidate.scheduledAt,
      candidate,
      preparation: null,
      receipt: null,
      job: null,
      notification: null,
    })
    f.state.rows = [row]
    const request = {
      scheduleId: first(f).view.scheduleId,
      cursor: null,
      limit: 50,
      from: ScheduleInstantSchema.parse('2026-11-05T00:00:00.000Z'),
      to: ScheduleInstantSchema.parse('2026-11-06T00:00:00.000Z'),
    }
    const queries = createScheduleQueryApplication(f.dependencies).queries
    expect(await queries.executions(context, request)).toMatchObject({
      kind: 'ok',
      value: { items: [row] },
    })
    f.dependencies.history.confirm = async () => ({
      kind: 'ok',
      value: { observationRevision: 'history:2' },
    })
    expect(await queries.executions(context, request)).toMatchObject({
      kind: 'error',
      error: { code: 'stale_cursor' },
    })
  })
})

describe('read-only previews', () => {
  it('uses actual persisted counts and activation while inline uses zero and null', async () => {
    const f = fixture()
    const inputs: unknown[] = []
    const preview = f.dependencies.prediction.preview
    f.dependencies.prediction.preview = async (context, input) => {
      inputs.push(input)
      return preview(context, input)
    }
    const queries = createScheduleQueryApplication(f.dependencies).queries
    const saved = first(f)
    const before = structuredClone(f.records)
    const reference = await queries.preview(context, {
      source: { kind: 'schedule', scheduleId: saved.view.scheduleId },
      after: now,
      count: 5,
    })
    const inline = await queries.preview(
      context,
      SchedulePreviewRequestSchema.parse({
        source: { kind: 'inline', definition: saved.view.definition },
        after: now,
        count: 5,
      }),
    )
    expect(reference.kind).toBe('ok')
    expect(inline.kind).toBe('ok')
    expect(inputs[0]).toMatchObject({
      definitionRevision: 2,
      activationExclusive: saved.activationExclusive,
      eligibleConsumed: 3,
      acceptedJobCount: 2,
    })
    expect(inputs[1]).toMatchObject({
      definitionRevision: 0,
      activationExclusive: null,
      eligibleConsumed: 0,
      acceptedJobCount: 0,
    })
    expect(f.records).toEqual(before)
    if (inline.kind === 'ok' && reference.kind === 'ok')
      expect(inline.value.candidates.map(row => row.scheduledAt)).toEqual(
        reference.value.candidates.map(row => row.scheduledAt),
      )
  })
  it('rejects a record revision changed during prediction', async () => {
    const f = fixture()
    const preview = f.dependencies.prediction.preview
    f.dependencies.prediction.preview = async (context, input) => {
      const result = await preview(context, input)
      first(f).view.revision++
      return result
    }
    expect(
      await createScheduleQueryApplication(f.dependencies).queries.preview(context, {
        source: { kind: 'schedule', scheduleId: first(f).view.scheduleId },
        after: now,
        count: 1,
      }),
    ).toMatchObject({ kind: 'error', error: { code: 'stale_cursor' } })
  })
  it('allows an inline read without an imaginary schedule grant', async () => {
    const f = fixture()
    f.state.access = { ...f.state.access, visibility: { kind: 'grantedIds', scheduleIds: [] } }
    expect(
      await createScheduleQueryApplication(f.dependencies).queries.preview(context, {
        source: { kind: 'inline', definition: first(f).view.definition },
        after: now,
        count: 1,
      }),
    ).toMatchObject({ kind: 'ok' })
    expect(f.calls).toEqual(['authorize', 'prediction', 'confirm'])
  })
})

it('confirms authority before reporting an authorized absent schedule', async () => {
  const f = fixture()
  f.dependencies.store.getSchedule = async () => ({ kind: 'absent' })
  f.dependencies.authorizer.confirm = async () => ({ kind: 'unavailable', error })
  expect(
    await createScheduleQueryApplication(f.dependencies).queries.get(context, {
      scheduleId: first(f).view.scheduleId,
    }),
  ).toEqual({ kind: 'error', error })
})

it('does not let a provider mutate the authority used for disclosure', async () => {
  const f = fixture()
  const list = f.dependencies.store.listSchedules
  f.dependencies.store.listSchedules = async input => {
    Object.assign(input.access, { principalRef: 'other-principal' })
    return list(input)
  }
  expect(
    await createScheduleQueryApplication(f.dependencies).queries.list(context, listRequest),
  ).toMatchObject({ kind: 'error', error: { code: 'provider_failure' } })
})
