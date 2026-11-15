import { describe, expect, it } from 'vitest'
import { createScheduleQueryApplication } from '@omne-harness/schedule'
import {
  ScheduleAgendaRequestSchema,
  ScheduleCivilSchema,
  ScheduleCandidateSchema,
  ScheduleExecutionRowSchema,
  ScheduleInstantSchema,
  type ScheduleAgendaRequest,
  type ScheduleControl,
} from '@omne-harness/schedule-contract'
import { agendaRequest, context, fixture, now } from './fixtures.ts'

function first(f: ReturnType<typeof fixture>) {
  const record = f.records[0]
  if (!record) throw new Error('Fixture requires a schedule')
  return record
}
function request(value: Partial<ScheduleAgendaRequest> = {}) {
  return ScheduleAgendaRequestSchema.parse({ ...agendaRequest, ...value })
}
function historyRow(
  f: ReturnType<typeof fixture>,
  rowRef: string,
  instant = '2026-11-05T09:00:00.000Z',
) {
  const candidate = first(f).view.nextOccurrence
  if (!candidate) throw new Error('Expected candidate')
  return ScheduleExecutionRowSchema.parse({
    rowRef,
    scheduleId: first(f).view.scheduleId,
    occurrenceKey: rowRef,
    originalScheduledAt: instant,
    candidate: {
      ...candidate,
      scheduledAt: instant,
      basis: { ...candidate.basis, ruleEngineVersion: 'historical' },
    },
    preparation: null,
    receipt: null,
    job: null,
    notification: null,
  })
}

describe('agenda facts and explanations', () => {
  it('keeps different history rows at the same instant and suppresses their duplicate prediction', async () => {
    const f = fixture()
    f.state.rows = [historyRow(f, 'row:b'), historyRow(f, 'row:a')]
    const queries = createScheduleQueryApplication(f.dependencies).queries
    const initial = await queries.agenda(context, request({ limit: 1 }))
    expect(initial).toMatchObject({
      kind: 'ok',
      value: {
        complete: true,
        total: { kind: 'exact', value: 2 },
        items: [{ kind: 'history', basis: { ruleEngineVersion: 'historical' } }],
      },
    })
    if (initial.kind !== 'ok') throw new Error('Expected page')
    const final = await queries.agenda(
      context,
      request({ limit: 1, cursor: initial.value.nextCursor }),
    )
    expect(final).toMatchObject({
      kind: 'ok',
      value: { nextCursor: null, items: [{ kind: 'history' }] },
    })
  })
  it('does not reconstruct past history from the current rule', async () => {
    const f = fixture()
    f.state.wall = ScheduleInstantSchema.parse('2026-11-07T00:00:00.000Z')
    const result = await createScheduleQueryApplication(f.dependencies).queries.agenda(
      context,
      request(),
    )
    expect(result).toMatchObject({ kind: 'ok', value: { items: [], complete: true } })
    expect(f.calls).not.toContain('prediction')
    expect(f.calls).toContain('history.read')
  })
  it.each<ScheduleControl>(['draft', 'paused', 'stopped', 'exhausted', 'discarded', 'superseded'])(
    'explains %s control instead of hiding its read-only predictions',
    async control => {
      const f = fixture()
      first(f).view.control = control
      first(f).view.standing = {
        kind: 'blocked',
        generation: 2,
        reasons: ['dependency:offline'],
        since: now,
        observedAt: now,
        authorityEvidence: [],
      }
      const result = await createScheduleQueryApplication(f.dependencies).queries.agenda(
        context,
        request(),
      )
      expect(result).toMatchObject({
        kind: 'ok',
        value: {
          items: [
            {
              kind: 'prediction',
              control,
              standing: { kind: 'blocked' },
              explanation: [`control:${control}`, 'standing:blocked', 'dependency:offline'],
              receiptRef: null,
              jobRef: null,
            },
          ],
        },
      })
    },
  )
  it('materializes calendar suppression at its original civil time but invents no gap or missing position instant', async () => {
    const f = fixture()
    const preview = f.dependencies.prediction.preview
    f.dependencies.prediction.preview = async (context, input) => {
      const result = await preview(context, input)
      if (result.kind !== 'ok') return result
      return {
        kind: 'ok',
        value: {
          ...result.value,
          candidates: [],
          excluded: [
            {
              sourceKeys: ['calendar'],
              originalLocals: [ScheduleAgendaRequestSchema.parse(agendaRequest).from],
              adjustedLocal: null,
              reason: 'calendarPredicate',
              dateExplanation: [],
            },
            {
              sourceKeys: ['gap'],
              originalLocals: [ScheduleAgendaRequestSchema.parse(agendaRequest).from],
              adjustedLocal: null,
              reason: 'dstGap',
              dateExplanation: [],
            },
            {
              sourceKeys: ['position'],
              originalLocals: [ScheduleAgendaRequestSchema.parse(agendaRequest).from],
              adjustedLocal: null,
              reason: 'positionAbsent',
              dateExplanation: [],
            },
          ],
        },
      }
    }
    f.state.wall = ScheduleInstantSchema.parse('2026-11-03T00:00:00.000Z')
    const result = await createScheduleQueryApplication(f.dependencies).queries.agenda(
      context,
      request(),
    )
    expect(result).toMatchObject({
      kind: 'ok',
      value: {
        total: { kind: 'exact', value: 1 },
        items: [
          {
            kind: 'prediction',
            scheduledAt: '2026-11-04T00:00:00.000Z',
            explanation: ['control:active', 'standing:ready', 'suppressed', 'calendarPredicate'],
          },
        ],
      },
    })
  })
  it('uses requested timezone for half-open history bounds and display', async () => {
    const f = fixture()
    f.state.rows = [
      historyRow(f, 'included', '2026-11-04T15:00:00.000Z'),
      historyRow(f, 'excluded', '2026-11-05T15:00:00.000Z'),
    ]
    f.state.wall = ScheduleInstantSchema.parse('2026-11-08T00:00:00.000Z')
    const result = await createScheduleQueryApplication(f.dependencies).queries.agenda(
      context,
      ScheduleAgendaRequestSchema.parse({
        ...agendaRequest,
        from: '2026-11-05T00:00:00',
        to: '2026-11-06T00:00:00',
        timezone: 'Asia/Tokyo',
      }),
    )
    expect(result).toMatchObject({
      kind: 'ok',
      value: {
        total: { kind: 'exact', value: 1 },
        items: [{ scheduledAt: '2026-11-04T15:00:00.000Z', displayLocal: '2026-11-05T00:00:00' }],
      },
    })
  })
  it('allows a compatible gap conversion to produce an empty instant range', async () => {
    const f = fixture()
    const result = await createScheduleQueryApplication(f.dependencies).queries.agenda(
      context,
      ScheduleAgendaRequestSchema.parse({
        ...agendaRequest,
        from: '2026-03-08T02:30:00',
        to: '2026-03-08T03:30:00',
        timezone: 'America/New_York',
      }),
    )
    expect(result).toMatchObject({
      kind: 'ok',
      value: { items: [], complete: true, scannedScheduleCount: 0 },
    })
    expect(f.calls).not.toContain('history.read')
  })
})

describe('agenda snapshots and budgets', () => {
  it.each(['history', 'data', 'basis', 'authority', 'results'] as const)(
    'rejects a cursor after %s changes',
    async change => {
      const f = fixture(2)
      const queries = createScheduleQueryApplication(f.dependencies).queries
      const initial = await queries.agenda(context, request({ limit: 1 }))
      if (initial.kind !== 'ok') throw new Error('Expected first page')
      if (change === 'history') f.state.historyRevision = 'history:2'
      if (change === 'data') f.state.dataRevision = 'data:2'
      if (change === 'authority')
        f.state.access = { ...f.state.access, authorityRevision: 'auth:2' }
      if (change === 'basis' || change === 'results') {
        const preview = f.dependencies.prediction.preview
        f.dependencies.prediction.preview = async (context, input) => {
          const result = await preview(context, input)
          if (result.kind !== 'ok') return result
          const basis = {
            ...result.value.basis,
            ruleEngineVersion:
              change === 'basis' ? 'new-engine' : result.value.basis.ruleEngineVersion,
          }
          return {
            kind: 'ok',
            value: {
              ...result.value,
              basis,
              candidates: result.value.candidates.map(candidate => ({
                ...candidate,
                basis,
                sourceKeys: change === 'results' ? ['different-source'] : candidate.sourceKeys,
              })),
            },
          }
        }
      }
      expect(
        await queries.agenda(context, request({ limit: 1, cursor: initial.value.nextCursor })),
      ).toMatchObject({ kind: 'error', error: { code: 'stale_cursor' } })
    },
  )
  it('rejects mixed store observations in the same scan before the final digest', async () => {
    const f = fixture()
    const get = f.dependencies.store.getSchedule
    f.dependencies.store.getSchedule = async input => {
      const result = await get(input)
      return result.kind === 'ok'
        ? { ...result, value: { ...result.value, observationRevision: 'different' } }
        : result
    }
    expect(
      await createScheduleQueryApplication(f.dependencies).queries.agenda(context, request()),
    ).toMatchObject({ kind: 'error', error: { code: 'stale_cursor' } })
  })
  it('rejects data changed during prediction at the final first-page confirmation', async () => {
    const f = fixture()
    const preview = f.dependencies.prediction.preview
    f.dependencies.prediction.preview = async (context, input) => {
      f.state.dataRevision = 'data:2'
      return preview(context, input)
    }
    expect(
      await createScheduleQueryApplication(f.dependencies).queries.agenda(context, request()),
    ).toMatchObject({ kind: 'error', error: { code: 'stale_cursor' } })
  })
  it.each(['schedule', 'row', 'dependency'] as const)(
    'returns incomplete with no continuation after the %s budget',
    async budget => {
      const f = fixture(4)
      const limits = {
        ...f.dependencies.limits,
        ...(budget === 'schedule'
          ? { maxAgendaSchedules: 1 }
          : budget === 'row'
            ? { maxAgendaRows: 1 }
            : { maxDependencyCalls: 8 }),
      }
      const result = await createScheduleQueryApplication({
        ...f.dependencies,
        limits,
      }).queries.agenda(context, request({ limit: 1 }))
      expect(result).toMatchObject({
        kind: 'ok',
        value: {
          complete: false,
          total: { kind: 'unknown', reason: 'budgetExceeded' },
          nextCursor: null,
          incompleteReason:
            budget === 'schedule'
              ? 'schedule_limit'
              : budget === 'row'
                ? 'row_limit'
                : 'dependency_calls',
        },
      })
      expect(f.calls.at(-1)).toBe('confirm')
    },
  )
  it('does not call page-size truncation an incomplete calculation', async () => {
    const f = fixture(3)
    const result = await createScheduleQueryApplication(f.dependencies).queries.agenda(
      context,
      request({ limit: 1 }),
    )
    expect(result).toMatchObject({
      kind: 'ok',
      value: {
        complete: true,
        total: { kind: 'exact', value: 3 },
        nextCursor: expect.any(String),
        incompleteReason: null,
      },
    })
  })
  it('shares one monotonic deadline across dependencies', async () => {
    const f = fixture()
    let elapsed = 0
    const preview = f.dependencies.prediction.preview
    f.dependencies.prediction.preview = async (context, input) => {
      elapsed = 10000
      return preview(context, input)
    }
    const result = await createScheduleQueryApplication({
      ...f.dependencies,
      monotonicClock: { now: () => elapsed },
    }).queries.agenda(context, request())
    expect(result).toMatchObject({
      kind: 'error',
      error: { code: 'search_limit', details: { reason: 'deadline_exceeded' } },
    })
    expect(f.calls.filter(call => call === 'list')).toHaveLength(1)
  })
  it('bounds a pending provider and catches its late rejection', async () => {
    const f = fixture()
    let rejectProvider: (error: Error) => void = () => {
      throw new Error('Provider was not called')
    }
    f.dependencies.history.observe = () =>
      new Promise((_, reject) => {
        rejectProvider = reject
      })
    const result = await createScheduleQueryApplication({
      ...f.dependencies,
      limits: { ...f.dependencies.limits, timeoutMs: 10 },
    }).queries.agenda(context, request())
    expect(result).toMatchObject({
      kind: 'error',
      error: { code: 'search_limit', details: { reason: 'deadline_exceeded' } },
    })
    rejectProvider(new Error('late provider failure'))
    await Promise.resolve()
  })
  it('marks an incomplete prediction as unknown total and refuses a continuation', async () => {
    const f = fixture()
    const preview = f.dependencies.prediction.preview
    f.dependencies.prediction.preview = async (context, input) => {
      const result = await preview(context, input)
      return result.kind === 'ok'
        ? { kind: 'ok', value: { ...result.value, complete: false, reason: 'search_limit' } }
        : result
    }
    expect(
      await createScheduleQueryApplication(f.dependencies).queries.agenda(context, request()),
    ).toMatchObject({
      kind: 'ok',
      value: {
        complete: false,
        total: { kind: 'unknown' },
        nextCursor: null,
        incompleteReason: 'search_limit',
      },
    })
  })
  it('rejects ranges over 92 days before observing dependencies', async () => {
    const f = fixture()
    const result = await createScheduleQueryApplication(f.dependencies).queries.agenda(context, {
      ...request(),
      to: ScheduleCivilSchema.parse('2027-02-05T00:00:00'),
    })
    expect(result).toMatchObject({ kind: 'error', error: { code: 'invalid_input' } })
    expect(f.calls).toEqual([])
  })
  it('rejects configured limits beyond the contract maximum', () => {
    const f = fixture()
    expect(() =>
      createScheduleQueryApplication({
        ...f.dependencies,
        limits: { ...f.dependencies.limits, maxAgendaSchedules: 10001 },
      }),
    ).toThrow()
    expect(() =>
      createScheduleQueryApplication({
        ...f.dependencies,
        limits: { ...f.dependencies.limits, maxAgendaRows: 5001 },
      }),
    ).toThrow()
  })
  it('uses one fixed asOf throughout cursor replay', async () => {
    const f = fixture(2)
    let wall = now
    const queries = createScheduleQueryApplication({
      ...f.dependencies,
      clock: { now: () => wall },
    }).queries
    const initial = await queries.agenda(context, request({ limit: 1 }))
    if (initial.kind !== 'ok') throw new Error('Expected page')
    wall = ScheduleInstantSchema.parse('2026-11-08T00:00:00.000Z')
    expect(
      await queries.agenda(context, request({ limit: 1, cursor: initial.value.nextCursor })),
    ).toMatchObject({ kind: 'ok', value: { items: [{ kind: 'prediction' }], nextCursor: null } })
  })
  it('requires each full prediction batch to advance and keep its basis', async () => {
    const f = fixture()
    let calls = 0
    const original = first(f).view.nextOccurrence
    if (!original) throw new Error('Expected candidate')
    f.dependencies.prediction.preview = async (_context, input) => {
      const basis = { ...original.basis, ruleEngineVersion: String(calls++) }
      const candidates = Array.from({ length: 100 }, (_, index) =>
        ScheduleCandidateSchema.parse({
          ...original,
          basis,
          scheduledAt: new Date(Date.parse(input.after) + (index + 1) * 1000).toISOString(),
          sourceKeys: [`source:${index}`],
        }),
      )
      return {
        kind: 'ok',
        value: {
          candidates,
          excluded: [],
          basis,
          complete: true,
          observedThrough: input.after,
          reason: null,
          remainingEligible: null,
          remainingJobs: null,
        },
      }
    }
    expect(
      await createScheduleQueryApplication(f.dependencies).queries.agenda(context, request()),
    ).toMatchObject({ kind: 'error', error: { code: 'stale_cursor' } })
    expect(calls).toBe(2)
  })
})
