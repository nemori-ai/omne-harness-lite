import { randomUUID } from 'node:crypto'
import {
  createDispatcher,
  type DispatcherPorts,
  type PredictionPage,
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

/** Slots strictly after an instant, from the same prediction the previews use, with whether the answer is complete. */
export function schedulePredictor(prediction: SchedulePredictionService, owner: ScheduleOwner) {
  return async (
    record: ScheduleRecord,
    after: ScheduleInstant,
    count: number,
  ): Promise<PredictionPage> => {
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
        count,
      },
    )
    if (result.kind !== 'ok') return { kind: 'unavailable' }
    return { kind: 'ok', candidates: result.value.candidates, complete: result.value.complete }
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
