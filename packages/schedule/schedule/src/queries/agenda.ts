import { Temporal } from '@js-temporal/polyfill'
import {
  ScheduleAgendaViewSchema,
  ScheduleCivilSchema,
  ScheduleFingerprintSchema,
  ScheduleInstantSchema,
  type ScheduleAdoptedBasis,
  type ScheduleAgendaRequest,
  type ScheduleAgendaRow,
  type ScheduleAgendaView,
  type ScheduleExcludedCandidate,
  type ScheduleExecutionRow,
  type ScheduleListRequest,
} from '@omne-harness/schedule-contract'
import type { ReadAccess, ScheduleRecord } from '../management/types.ts'
import {
  decodeCursor,
  digest,
  encodeCursor,
  equal,
  fail,
  QueryFailure,
  requireEqual,
  type QueryCursor,
} from './boundary.ts'
import { predictionInput, QueryObservation } from './observation.ts'

type KeyedRow = Readonly<{ key: string[]; row: ScheduleAgendaRow }>
type Accumulator = {
  rows: Map<string, KeyedRow>
  bases: Map<string, ScheduleAdoptedBasis>
  scanned: number
  incompleteReason: string | null
}
function compareKeys(a: readonly string[], b: readonly string[]) {
  for (let i = 0; i < a.length; i++) {
    const left = a[i] ?? ''
    const right = b[i] ?? ''
    if (left < right) return -1
    if (left > right) return 1
  }
  return 0
}
function boundary(local: string, timezone: string) {
  return ScheduleInstantSchema.parse(
    Temporal.PlainDateTime.from(local)
      .toZonedDateTime(timezone, { disambiguation: 'compatible' })
      .toInstant()
      .toString({ smallestUnit: 'millisecond' }),
  )
}
function projection(
  record: ScheduleRecord,
  scheduledAt: ScheduleAgendaRow['scheduledAt'],
  timezone: string,
  basis: ScheduleAdoptedBasis,
) {
  const { view } = record
  return {
    scheduleId: view.scheduleId,
    owner: view.owner,
    purpose: view.definition.purpose.kind,
    scheduledAt,
    displayLocal: ScheduleCivilSchema.parse(
      Temporal.Instant.from(scheduledAt)
        .toZonedDateTimeISO(timezone)
        .toPlainDateTime()
        .toString({ smallestUnit: 'second' }),
    ),
    basis,
    control: view.control,
    standing: view.standing,
    explanation: [
      `control:${view.control}`,
      `standing:${view.standing.kind}`,
      ...view.standing.reasons,
    ],
  }
}
function add(
  observation: QueryObservation,
  state: Accumulator,
  row: ScheduleAgendaRow,
  identity: string,
) {
  observation.check()
  const key = [row.scheduledAt, row.scheduleId, row.kind, identity]
  const encoded = JSON.stringify(key)
  const previous = state.rows.get(encoded)
  if (previous) {
    if (!equal(previous.row, row))
      fail(observation.context, 'provider_failure', 'Conflicting stable agenda identity')
    return
  }
  state.rows.set(encoded, { key, row })
  if (state.rows.size > observation.dependencies.limits.maxAgendaRows)
    fail(observation.context, 'search_limit', 'Agenda row budget exceeded', 'row_limit')
}
function suppressedInstants(excluded: ScheduleExcludedCandidate, basis: ScheduleAdoptedBasis) {
  if (excluded.reason === 'dstGap' || excluded.reason === 'positionAbsent') return []
  return excluded.originalLocals.flatMap(local => {
    const original = Temporal.PlainDateTime.from(local)
    const zoned = original.toZonedDateTime(basis.timezone, { disambiguation: 'earlier' })
    if (!zoned.toPlainDateTime().equals(original)) return []
    return [
      ScheduleInstantSchema.parse(zoned.toInstant().toString({ smallestUnit: 'millisecond' })),
    ]
  })
}
function historyExplanation(row: ScheduleExecutionRow): string[] {
  const explanation = [`history:${row.rowRef}`]
  if (row.receipt !== null)
    explanation.push(
      `receipt:${row.receipt.disposition}`,
      `receiptReason:${row.receipt.reasonCode}`,
    )
  if (row.job !== null) {
    explanation.push(`stop:${row.job.stopState}`)
    const body = row.job.body
    if (body.kind === 'execution') {
      explanation.push(`execution:${body.executionState}`)
      if (body.outcome !== null) explanation.push(`outcome:${body.outcome}`)
    } else explanation.push(`notification:${body.primaryOutcome}`)
  }
  if (row.notification !== null) explanation.push(`notification:${row.notification.outcome}`)
  return explanation
}
async function scheduleHistory(
  observation: QueryObservation,
  access: ReadAccess,
  historyRevision: string,
  record: ScheduleRecord,
  request: ScheduleAgendaRequest,
  range: { from: ScheduleAgendaRow['scheduledAt']; to: ScheduleAgendaRow['scheduledAt'] },
  state: Accumulator,
) {
  const instants = new Set<string>()
  const rowRefs = new Set<string>()
  const cursors = new Set<string>()
  let cursor: string | null = null
  let total: number | null = null
  for (;;) {
    const page = await observation.history(access, historyRevision, {
      scheduleId: record.view.scheduleId,
      ...range,
      cursor,
      limit: Math.min(500, observation.dependencies.limits.maxAgendaRows + 1),
    })
    if (page.total.kind === 'exact') {
      if (total !== null) requireEqual(observation.context, total, page.total.value)
      total = page.total.value
    }
    for (const row of page.items) {
      if (rowRefs.has(row.rowRef))
        fail(observation.context, 'provider_failure', 'History repeated a stable row identity')
      rowRefs.add(row.rowRef)
      instants.add(row.originalScheduledAt)
      const common = projection(
        record,
        row.originalScheduledAt,
        request.timezone,
        row.candidate.basis,
      )
      add(
        observation,
        state,
        {
          ...common,
          explanation: [...common.explanation, ...historyExplanation(row)],
          kind: 'history',
          receiptRef: row.receipt?.receiptId ?? null,
          jobRef: row.job?.jobId ?? row.receipt?.jobId ?? null,
        },
        row.rowRef,
      )
    }
    if (!page.complete || page.total.kind === 'unknown') {
      state.incompleteReason = 'history_incomplete'
      return instants
    }
    if (page.nextCursor === null) {
      if (rowRefs.size !== total)
        fail(observation.context, 'provider_failure', 'History rows do not match their exact total')
      return instants
    }
    if (cursors.has(page.nextCursor))
      fail(observation.context, 'provider_failure', 'History cursor did not advance')
    cursors.add(page.nextCursor)
    cursor = page.nextCursor
  }
}
async function schedulePrediction(
  observation: QueryObservation,
  record: ScheduleRecord,
  request: ScheduleAgendaRequest,
  range: { from: ScheduleAgendaRow['scheduledAt']; to: ScheduleAgendaRow['scheduledAt'] },
  asOf: ScheduleAgendaRow['scheduledAt'],
  historyInstants: Set<string>,
  state: Accumulator,
) {
  if (range.to <= asOf) return
  const beforeStart = ScheduleInstantSchema.parse(
    Temporal.Instant.from(range.from)
      .subtract({ milliseconds: 1 })
      .toString({ smallestUnit: 'millisecond' }),
  )
  let after = beforeStart > asOf ? beforeStart : asOf
  for (;;) {
    const prediction = await observation.predict(predictionInput(record, after, 100))
    const previousBasis = state.bases.get(record.view.scheduleId)
    if (previousBasis) requireEqual(observation.context, previousBasis, prediction.basis)
    state.bases.set(record.view.scheduleId, prediction.basis)
    for (const candidate of prediction.candidates) {
      if (
        candidate.scheduledAt >= range.to ||
        candidate.scheduledAt < range.from ||
        historyInstants.has(candidate.scheduledAt)
      )
        continue
      add(
        observation,
        state,
        {
          ...projection(record, candidate.scheduledAt, request.timezone, candidate.basis),
          kind: 'prediction',
          receiptRef: null,
          jobRef: null,
        },
        digest(['candidate', [...candidate.sourceKeys].sort()]),
      )
    }
    for (const excluded of prediction.excluded) {
      for (const instant of suppressedInstants(excluded, prediction.basis)) {
        if (
          instant <= asOf ||
          instant < range.from ||
          instant >= range.to ||
          historyInstants.has(instant) ||
          (!prediction.complete && instant > prediction.observedThrough)
        )
          continue
        const common = projection(record, instant, request.timezone, prediction.basis)
        add(
          observation,
          state,
          {
            ...common,
            kind: 'prediction',
            receiptRef: null,
            jobRef: null,
            explanation: [...common.explanation, 'suppressed', excluded.reason],
          },
          digest(['suppressed', [...excluded.sourceKeys].sort(), excluded.reason]),
        )
      }
    }
    if (!prediction.complete) {
      state.incompleteReason = prediction.reason ?? 'prediction_incomplete'
      return
    }
    const last = prediction.candidates.at(-1)
    if (
      last === undefined ||
      prediction.candidates.length < 100 ||
      last.scheduledAt >= range.to ||
      prediction.observedThrough >= range.to
    )
      return
    if (last.scheduledAt <= after)
      fail(observation.context, 'provider_failure', 'Prediction did not advance')
    after = last.scheduledAt
  }
}
async function scan(
  observation: QueryObservation,
  access: ReadAccess,
  historyRevision: string,
  first: Awaited<ReturnType<QueryObservation['list']>>,
  listRequest: ScheduleListRequest,
  request: ScheduleAgendaRequest,
  asOf: ScheduleAgendaRow['scheduledAt'],
  range: { from: ScheduleAgendaRow['scheduledAt']; to: ScheduleAgendaRow['scheduledAt'] },
  state: Accumulator,
) {
  let page = first
  const scheduleIds = new Set<string>()
  const cursors = new Set<string>()
  for (;;) {
    requireEqual(observation.context, first.observationRevision, page.observationRevision)
    requireEqual(observation.context, first.total, page.total)
    for (const view of page.items) {
      if (state.scanned >= observation.dependencies.limits.maxAgendaSchedules) {
        state.incompleteReason = 'schedule_limit'
        return
      }
      if (scheduleIds.has(view.scheduleId))
        fail(observation.context, 'provider_failure', 'Store repeated a schedule across pages')
      scheduleIds.add(view.scheduleId)
      const snapshot = await observation.get(access, view.scheduleId)
      requireEqual(observation.context, first.observationRevision, snapshot.observationRevision)
      requireEqual(observation.context, view, snapshot.value.view)
      if (
        request.filter.calendarId !== null &&
        snapshot.value.view.definition.binding.kind === 'followUserEnvironment' &&
        snapshot.value.adoptedBasis?.calendarId !== request.filter.calendarId
      )
        fail(
          observation.context,
          'provider_failure',
          'Store returned a schedule outside the calendar filter',
        )
      state.scanned++
      const instants = await scheduleHistory(
        observation,
        access,
        historyRevision,
        snapshot.value,
        request,
        range,
        state,
      )
      if (state.incompleteReason !== null) return
      await schedulePrediction(observation, snapshot.value, request, range, asOf, instants, state)
      if (state.incompleteReason !== null) return
    }
    if (page.nextCursor === null) {
      if (state.scanned !== first.total.value)
        fail(
          observation.context,
          'provider_failure',
          'Schedule scan does not match the exact total',
        )
      return
    }
    if (cursors.has(page.nextCursor))
      fail(observation.context, 'provider_failure', 'Store cursor did not advance')
    cursors.add(page.nextCursor)
    if (state.scanned >= observation.dependencies.limits.maxAgendaSchedules) {
      state.incompleteReason = 'schedule_limit'
      return
    }
    page = await observation.list(access, { ...listRequest, cursor: page.nextCursor })
  }
}
function pageResult(
  observation: QueryObservation,
  state: Accumulator,
  request: ScheduleAgendaRequest,
  access: ReadAccess,
  storeRevision: string,
  historyRevision: string,
  asOf: ScheduleAgendaRow['scheduledAt'],
  cursor: QueryCursor | null,
  queryHash: string,
): ScheduleAgendaView {
  const all = [...state.rows.values()].sort((a, b) => compareKeys(a.key, b.key))
  const observationRevision = digest([
    'agenda/1',
    storeRevision,
    historyRevision,
    access,
    asOf,
    [...state.bases].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    all,
  ])
  if (cursor !== null) {
    requireEqual(observation.context, observationRevision, cursor.observationRevision)
    if (
      cursor.continuation.kind !== 'agenda' ||
      !all.some(item =>
        equal(item.key, cursor.continuation.kind === 'agenda' ? cursor.continuation.lastKey : null),
      )
    )
      fail(observation.context, 'stale_cursor', 'Cursor row no longer exists')
  }
  const lastKey = cursor?.continuation.kind === 'agenda' ? cursor.continuation.lastKey : null
  const remaining = lastKey === null ? all : all.filter(item => compareKeys(item.key, lastKey) > 0)
  const selected = remaining.slice(
    0,
    Math.min(request.limit, observation.dependencies.limits.maxAgendaRows),
  )
  const complete = state.incompleteReason === null
  const last = selected.at(-1)
  const nextCursor =
    complete && remaining.length > selected.length && last !== undefined
      ? encodeCursor({
          version: 1,
          action: 'agenda',
          queryHash: ScheduleFingerprintSchema.parse(queryHash),
          observationRevision,
          continuation: { kind: 'agenda', asOf, lastKey: last.key },
        })
      : null
  return {
    items: selected.map(item => item.row),
    nextCursor,
    observationRevision,
    complete,
    total: complete
      ? { kind: 'exact', value: all.length }
      : { kind: 'unknown', reason: 'budgetExceeded' },
    range: { from: request.from, to: request.to },
    timezone: request.timezone,
    scannedScheduleCount: state.scanned,
    incompleteReason: state.incompleteReason,
  }
}
export async function agenda(
  observation: QueryObservation,
  access: ReadAccess,
  request: ScheduleAgendaRequest,
) {
  const queryHash = digest([
    'agenda/1',
    observation.context.owner,
    observation.context.principalRef,
    access,
    { ...request, cursor: null },
  ])
  const cursor = decodeCursor(observation.context, request.cursor, 'agenda', queryHash)
  if (cursor !== null && cursor.continuation.kind !== 'agenda')
    fail(observation.context, 'stale_cursor', 'Invalid agenda continuation')
  const asOf =
    cursor?.continuation.kind === 'agenda'
      ? cursor.continuation.asOf
      : observation.parse(ScheduleInstantSchema, observation.dependencies.clock.now())
  const range = {
    from: boundary(request.from, request.timezone),
    to: boundary(request.to, request.timezone),
  }
  const listRequest = {
    ...request.filter,
    cursor: null,
    limit: Math.min(200, observation.dependencies.limits.maxAgendaSchedules),
  }
  const first = await observation.list(access, listRequest)
  const history = await observation.historyObservation(access)
  const state: Accumulator = {
    rows: new Map(),
    bases: new Map(),
    scanned: 0,
    incompleteReason: null,
  }
  observation.reserve = 3
  try {
    if (range.from < range.to)
      await scan(
        observation,
        access,
        history.observationRevision,
        first,
        listRequest,
        request,
        asOf,
        range,
        state,
      )
  } catch (error) {
    if (!(error instanceof QueryFailure) || error.error.code !== 'search_limit') throw error
    state.incompleteReason = String(error.error.details.reason ?? 'search_limit')
  }
  observation.reserve = 0
  const finalPage = await observation.list(access, listRequest)
  requireEqual(observation.context, first, finalPage)
  await observation.confirmHistory(access, history.observationRevision)
  await observation.confirm(access)
  return observation.parse(
    ScheduleAgendaViewSchema,
    pageResult(
      observation,
      state,
      request,
      access,
      first.observationRevision,
      history.observationRevision,
      asOf,
      cursor,
      queryHash,
    ),
  )
}
