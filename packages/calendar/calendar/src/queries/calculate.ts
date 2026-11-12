import {
  calendarSnapshotSchema,
  type CalendarId,
  type CalendarResolve,
  type CalendarResolution,
  type CalculationFailure,
} from '@omne-harness/calendar-contract'
import type { CalendarRepository } from '../persistence.ts'
import {
  classifyDay,
  countWorkingDays,
  shiftWorkingDays,
  listWorkingDays,
  selectNthWorkingDay,
} from '../calculation.ts'
import { QueryFailure, readValue } from './failure.ts'

function successful<T extends { kind: 'ok' }>(result: T | CalculationFailure): T {
  switch (result.kind) {
    case 'ok':
      return result
    case 'invalid':
      throw new QueryFailure('invalid_input')
    case 'searchLimit':
      throw new QueryFailure('search_limit', {
        scanBudget: result.scanBudget,
        inspectedDays: result.inspectedDays,
      })
    case 'coverageInsufficient':
      throw new QueryFailure('coverage_insufficient', {
        date: result.date,
        coverageStart: result.coverage.from,
        coverageEnd: result.coverage.to,
        ...('boundary' in result ? { boundary: result.boundary } : {}),
      })
    default: {
      const exhaustive: never = result
      return exhaustive
    }
  }
}
async function readSnapshot(
  repository: CalendarRepository,
  calendarId: CalendarId,
  input: CalendarResolve,
) {
  const version =
    input.version.kind === 'latest'
      ? ({ kind: 'current' } satisfies { kind: 'current' })
      : input.version
  const stored = readValue(await repository.getSnapshot({ calendarId, version }))
  if (stored === null) throw new QueryFailure('unknown_calendar_version')
  const snapshot = calendarSnapshotSchema.parse(stored)
  if (
    snapshot.calendarId !== calendarId ||
    (input.version.kind === 'pinned' && snapshot.versionId !== input.version.versionId)
  )
    throw new QueryFailure('provider_failure')
  return snapshot
}
export async function resolveCalculation(
  repository: CalendarRepository,
  calendarId: CalendarId,
  input: CalendarResolve,
): Promise<CalendarResolution> {
  const snapshot = await readSnapshot(repository, calendarId, input)
  const query = input.query
  let result: CalendarResolution['result']
  switch (query.kind) {
    case 'day':
      result = { kind: 'day', value: successful(classifyDay({ snapshot, date: query.date })) }
      break
    case 'count':
      result = {
        kind: 'count',
        value: successful(countWorkingDays({ snapshot, from: query.from, to: query.to })),
      }
      break
    case 'shift':
      result = {
        kind: 'shift',
        value: successful(shiftWorkingDays({ snapshot, date: query.date, offset: query.offset })),
      }
      break
    case 'next':
      result = {
        kind: 'next',
        value: successful(listWorkingDays({ snapshot, after: query.after, count: query.count })),
      }
      break
    case 'nth':
      result = {
        kind: 'nth',
        value: successful(
          selectNthWorkingDay({
            snapshot,
            periodStart: query.periodStart,
            periodEnd: query.periodEnd,
            ordinal: query.ordinal,
          }),
        ),
      }
      break
    default: {
      const exhaustive: never = query
      return exhaustive
    }
  }
  return {
    calendarId,
    versionId: snapshot.versionId,
    coverageStart: snapshot.coverageStart,
    coverageEnd: snapshot.coverageEnd,
    result,
  }
}
