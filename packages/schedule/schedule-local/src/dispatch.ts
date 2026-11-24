import { randomUUID } from 'node:crypto'
import {
  createDispatcher,
  type DispatcherPorts,
  type Prediction,
  type SchedulePredictionService,
  type ScheduleRecord,
} from '@omne-harness/schedule'
import type { ScheduleInstant, ScheduleOwner } from '@omne-harness/schedule-contract'
import { createScheduleDispatchSqlStore, type ScheduleDispatchSqlOptions } from './storage/index.ts'

export type ScheduleDispatchOptions = Omit<
  ScheduleDispatchSqlOptions,
  'storage' | 'scope' | 'transactionDomain' | 'combinationVersion' | 'manifestDigest'
> &
  Omit<DispatcherPorts, 'store' | 'predict' | 'owner'>

/** The next slot strictly after an instant, from the same prediction the previews use; incomplete is unavailable. */
export function schedulePredictor(prediction: SchedulePredictionService, owner: ScheduleOwner) {
  return async (record: ScheduleRecord, after: ScheduleInstant): Promise<Prediction> => {
    const { view } = record
    const result = await prediction.preview(
      {
        principalRef: 'schedule.dispatcher',
        owner,
        actor: { kind: 'system', actorRef: 'schedule.dispatcher' },
        authContextRef: 'schedule.dispatcher',
        requestId: randomUUID(),
        originatingSessionRef: null,
      },
      {
        definition: view.definition,
        definitionRevision: view.definitionRevision,
        eligibleConsumed: view.eligibleConsumed,
        acceptedJobCount: view.acceptedJobCount,
        after,
        activationExclusive: record.activationExclusive,
        count: 1,
      },
    )
    if (result.kind !== 'ok') return { kind: 'unavailable' }
    const [next] = result.value.candidates
    if (next !== undefined) return { kind: 'ok', next }
    return result.value.complete ? { kind: 'ok', next: null } : { kind: 'unavailable' }
  }
}

export function createScheduleDispatcher(
  sql: Omit<ScheduleDispatchSqlOptions, 'owner' | 'guards'>,
  prediction: SchedulePredictionService,
  options: ScheduleDispatchOptions,
) {
  const { owner, guards, ...ports } = options
  return createDispatcher({
    ...ports,
    owner,
    store: createScheduleDispatchSqlStore({ ...sql, owner, guards }),
    predict: schedulePredictor(prediction, owner),
  })
}
