import {
  ScheduleFingerprintSchema,
  ScheduleIdSchema,
  type ScheduleExecutionRow,
  type ScheduleListRequest,
  type SchedulePreviewView,
} from '@omne-harness/schedule-contract'
import type { ScheduleQueryDependencies } from '../../src/queries/types.ts'
import type { ReadAccess } from '@omne-harness/schedule'
import { context, now, observation, record } from '../management/fixtures.ts'

export { context, now, record }
export const filter = {
  agentRef: null,
  control: null,
  standing: null,
  createdBy: null,
  targetDeviceRef: null,
  calendarId: null,
  purpose: null,
}
export const listRequest: ScheduleListRequest = { ...filter, cursor: null, limit: 50 }
export const agendaRequest = {
  from: '2026-11-04T00:00:00',
  to: '2026-11-06T00:00:00',
  timezone: 'UTC',
  filter,
  cursor: null,
  limit: 50,
}
export function fixture(size = 1) {
  const records = Array.from({ length: size }, (_, index) => {
    const item = record()
    return {
      ...item,
      view: {
        ...item.view,
        scheduleId: ScheduleIdSchema.parse(
          `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        ),
      },
    }
  })
  const access: ReadAccess = {
    owner: context.owner,
    principalRef: context.principalRef,
    visibility: { kind: 'ownerAll' },
    authorityRevision: 'auth:1',
    visibilityDigest: ScheduleFingerprintSchema.parse('a'.repeat(64)),
  }
  const state = {
    wall: now,
    dataRevision: 'data:1',
    historyRevision: 'history:1',
    access,
    rows: new Array<ScheduleExecutionRow>(),
  }
  const calls: string[] = []
  const dependencies: ScheduleQueryDependencies = {
    store: {
      async readSchedule() {
        throw new Error('Write-side read must not be used')
      },
      async listSchedules({ request }) {
        calls.push('list')
        const start = request.cursor === null ? 0 : Number(request.cursor)
        const visible = records.filter(
          item => request.control === null || item.view.control === request.control,
        )
        return {
          kind: 'ok',
          value: {
            items: visible.slice(start, start + request.limit).map(item => item.view),
            nextCursor:
              start + request.limit < visible.length ? String(start + request.limit) : null,
            observationRevision: state.dataRevision,
            complete: true,
            total: { kind: 'exact', value: visible.length },
          },
        }
      },
      async getSchedule({ scheduleId }) {
        calls.push('get')
        const value = records.find(item => item.view.scheduleId === scheduleId)
        return value
          ? { kind: 'ok', value: { observationRevision: state.dataRevision, value } }
          : { kind: 'absent' }
      },
      async readRevisions() {
        calls.push('revisions')
        return {
          kind: 'ok',
          value: {
            items: [],
            nextCursor: null,
            observationRevision: state.dataRevision,
            complete: true,
            total: { kind: 'exact', value: 0 },
          },
        }
      },
    },
    authorizer: {
      async observe() {
        calls.push('authorize')
        return { kind: 'ok', value: state.access }
      },
      async confirm() {
        calls.push('confirm')
        return { kind: 'ok', value: state.access }
      },
    },
    history: {
      async observe() {
        calls.push('history.observe')
        return { kind: 'ok', value: { observationRevision: state.historyRevision } }
      },
      async confirm() {
        calls.push('history.confirm')
        return { kind: 'ok', value: { observationRevision: state.historyRevision } }
      },
      async read({ request }) {
        calls.push('history.read')
        const rows = state.rows.filter(
          row =>
            row.scheduleId === request.scheduleId &&
            (request.from === null || row.originalScheduledAt >= request.from) &&
            (request.to === null || row.originalScheduledAt < request.to),
        )
        const start = request.cursor === null ? 0 : Number(request.cursor)
        return {
          kind: 'ok',
          value: {
            items: rows.slice(start, start + request.limit),
            nextCursor: start + request.limit < rows.length ? String(start + request.limit) : null,
            observationRevision: state.historyRevision,
            complete: true,
            total: { kind: 'exact', value: rows.length },
          },
        }
      },
    },
    prediction: {
      async preview(_context, input) {
        calls.push('prediction')
        const resolved = observation(input.definition, input.definitionRevision)
        const candidate = resolved.next
        const value: SchedulePreviewView = {
          candidates: candidate && candidate.scheduledAt > input.after ? [candidate] : [],
          excluded: [],
          basis: resolved.basis,
          complete: true,
          observedThrough: input.after,
          reason: null,
          remainingEligible: null,
          remainingJobs: null,
        }
        return { kind: 'ok', value }
      },
    },
    clock: { now: () => state.wall },
    monotonicClock: { now: () => 0 },
    limits: {
      timeoutMs: 10000,
      maxDependencyCalls: 1000,
      maxAgendaSchedules: 10000,
      maxAgendaRows: 5000,
    },
  }
  return { dependencies, records, state, calls }
}
