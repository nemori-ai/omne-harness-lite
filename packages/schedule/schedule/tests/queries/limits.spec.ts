import { expect, it } from 'vitest'
import { createScheduleQueryApplication } from '@omne-harness/schedule'
import {
  ScheduleAgendaRequestSchema,
  ScheduleExecutionRowSchema,
} from '@omne-harness/schedule-contract'
import { agendaRequest, context, fixture, listRequest } from './fixtures.ts'

it('caps an actual 10001-schedule scan at 10000 and exposes unknown total', async () => {
  const f = fixture(10001)
  const preview = f.dependencies.prediction.preview
  f.dependencies.prediction.preview = async (context, input) => {
    const result = await preview(context, input)
    return result.kind === 'ok' ? { ...result, value: { ...result.value, candidates: [] } } : result
  }
  const result = await createScheduleQueryApplication({
    ...f.dependencies,
    limits: { ...f.dependencies.limits, maxDependencyCalls: 40000 },
  }).queries.agenda(context, ScheduleAgendaRequestSchema.parse(agendaRequest))
  expect(result).toMatchObject({
    kind: 'ok',
    value: {
      scannedScheduleCount: 10000,
      complete: false,
      total: { kind: 'unknown', reason: 'budgetExceeded' },
      nextCursor: null,
      incompleteReason: 'schedule_limit',
    },
  })
  expect(f.calls.filter(call => call === 'get')).toHaveLength(10000)
}, 30000)

it('returns at most 5000 rows and marks the 5001st history row as a budget sentinel', async () => {
  const f = fixture()
  const record = f.records.at(0)
  const candidate = record?.view.nextOccurrence
  if (!record || !candidate) throw new Error('Missing fixture record')
  f.state.rows = Array.from({ length: 5001 }, (_, index) =>
    ScheduleExecutionRowSchema.parse({
      rowRef: `row:${String(index).padStart(5, '0')}`,
      occurrenceKey: `occ:${index}`,
      scheduleId: record.view.scheduleId,
      originalScheduledAt: candidate.scheduledAt,
      candidate,
      preparation: null,
      receipt: null,
      job: null,
      notification: null,
    }),
  )
  const result = await createScheduleQueryApplication(f.dependencies).queries.agenda(
    context,
    ScheduleAgendaRequestSchema.parse({ ...agendaRequest, limit: 5000 }),
  )
  expect(result).toMatchObject({
    kind: 'ok',
    value: {
      complete: false,
      nextCursor: null,
      incompleteReason: 'row_limit',
      total: { kind: 'unknown' },
    },
  })
  if (result.kind !== 'ok') throw new Error('Expected bounded agenda')
  expect(result.value.items).toHaveLength(5000)
}, 15000)

it('rejects a silently truncated list even when its claimed exact total is valid', async () => {
  const f = fixture(2)
  const list = f.dependencies.store.listSchedules
  f.dependencies.store.listSchedules = async input => {
    const result = await list(input)
    return result.kind === 'ok'
      ? {
          ...result,
          value: { ...result.value, items: result.value.items.slice(0, 1), nextCursor: null },
        }
      : result
  }
  expect(
    await createScheduleQueryApplication(f.dependencies).queries.list(context, listRequest),
  ).toMatchObject({ kind: 'error', error: { code: 'provider_failure' } })
})

it('does not turn an incomplete history observation into an exact agenda total', async () => {
  const f = fixture()
  f.dependencies.history.read = async () => ({
    kind: 'ok',
    value: {
      items: [],
      complete: true,
      nextCursor: null,
      observationRevision: 'history:1',
      total: { kind: 'unknown', reason: 'sourceUnavailable' },
    },
  })
  expect(
    await createScheduleQueryApplication(f.dependencies).queries.agenda(
      context,
      ScheduleAgendaRequestSchema.parse(agendaRequest),
    ),
  ).toMatchObject({
    kind: 'ok',
    value: {
      complete: false,
      nextCursor: null,
      incompleteReason: 'history_incomplete',
      total: { kind: 'unknown' },
    },
  })
})
