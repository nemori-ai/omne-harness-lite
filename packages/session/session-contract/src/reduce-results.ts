import { validateResult } from './call-state.ts'
import { evidenceFields } from './session-validation.ts'
import type { SessionEntry } from './entries.ts'
import type { WorkSnapshot, ResultConsumption } from './values.ts'
import { digestOf } from './operations.ts'
import { completeEvidence } from './decision-support.ts'
import { judgeAdvance } from './judgments.ts'
import { applyParticipation, resultParticipationError } from './result-state.ts'

type Draft = { -readonly [K in keyof WorkSnapshot]: WorkSnapshot[K] }
type ResultEntry = Extract<
  SessionEntry,
  { kind: 'call.result-preserved' | 'call.result-processed' }
>

export function applyResult(draft: Draft, entry: ResultEntry): string | null {
  const consumption = draft.consumptions.find(item => item.id === entry.consumption)
  if (consumption === undefined) return 'result without a consumption'
  validateResult(consumption.binding, entry.result)
  if (
    digestOf(consumption.binding.producer) !== digestOf(entry.result.producer) ||
    !entry.result.version ||
    !completeEvidence(entry.result.source)
  )
    return 'result without its original producer, version or source'
  if (entry.participation !== null) {
    const expected = entry.kind === 'call.result-preserved' ? 'custody' : 'processed'
    if (entry.participation.joint !== expected) return 'wrong result participation kind'
    const error = resultParticipationError(draft, consumption.binding, entry.participation)
    if (error !== null) return error
  }
  if (entry.kind === 'call.result-processed') {
    if (entry.participation !== null) {
      const judgment = judgeAdvance(draft, { kind: 'participation', ...entry.participation })
      if (judgment.kind !== 'ok' || entry.position !== null)
        return 'processing outside the original active execution'
    } else if (
      draft.lifecycle === 'archived' ||
      consumption.binding.initiatingAttempt !== null ||
      entry.position !== consumption.binding.consumer.position
    )
      return 'processing outside the original external position'
  }
  const previous = consumption.results.find(item => item.result.version === entry.result.version)
  if (previous !== undefined && digestOf(previous.result) !== digestOf(entry.result))
    return 'result version changed'
  const field = entry.kind === 'call.result-preserved' ? 'custody' : 'completion'
  const proof = entry.kind === 'call.result-preserved' ? entry.custody : entry.completion
  if (!completeEvidence(proof)) return 'incomplete result evidence'
  if (previous?.[field] != null && digestOf(previous[field]) !== digestOf(proof))
    return `result ${field} changed`
  if (entry.participation !== null) {
    const error = applyParticipation(draft, entry.participation)
    if (error !== null) return error
  }
  const result: ResultConsumption = {
    result: previous?.result ?? entry.result,
    custody: previous?.custody ?? (entry.kind === 'call.result-preserved' ? entry.custody : null),
    completion:
      previous?.completion ?? (entry.kind === 'call.result-processed' ? entry.completion : null),
    release: previous?.release ?? 'pending',
  }
  draft.consumptions = draft.consumptions.map(item =>
    item.id === entry.consumption
      ? {
          ...item,
          results:
            previous === undefined
              ? [...item.results, result]
              : item.results.map(value =>
                  value.result.version === entry.result.version ? result : value,
                ),
        }
      : item,
  )
  if (entry.kind === 'call.result-processed') {
    draft.callWaits = (draft.callWaits ?? []).filter(
      item =>
        item.consumption !== entry.consumption ||
        item.position !== consumption.binding.consumer.position,
    )
    draft.waiting = draft.waiting.filter(
      item =>
        item.kind !== 'producer' ||
        digestOf(item.binding) !== digestOf(consumption.binding) ||
        item.position !== consumption.binding.consumer.position,
    )
  }
  return null
}

export function applyProducerFact(
  draft: Draft,
  entry: Extract<SessionEntry, { kind: 'call.execution-fact' | 'account.linked' }>,
): string | null {
  if (entry.result != null && entry.consumption !== undefined) {
    const result = entry.result
    const consumption = draft.consumptions.find(item => item.id === entry.consumption)
    if (
      consumption === undefined ||
      digestOf(consumption.binding.producer) !== digestOf(result.producer)
    )
      return 'producer result without its original binding'
    validateResult(consumption.binding, result)
    const existing = consumption.results.find(item => item.result.version === result.version)
    if (existing !== undefined && digestOf(existing.result) !== digestOf(result))
      return 'conflicting producer result version'
    if (existing === undefined)
      draft.consumptions = draft.consumptions.map(item =>
        item.id === entry.consumption
          ? {
              ...item,
              results: [
                ...item.results,
                { result, custody: null, completion: null, release: 'pending' },
              ],
            }
          : item,
      )
  }
  if ('source' in entry.fact) evidenceFields(entry.fact.source, 'fact.source')
  if (entry.fact.kind !== 'release') return null
  const fact = entry.fact
  const consumption = draft.consumptions.find(item => item.id === fact.consumption)
  const result = consumption?.results.find(item => item.result.version === fact.result.version)
  if (
    result === undefined ||
    digestOf(result.result) !== digestOf(fact.result) ||
    fact.result.producer.kind !== 'tool' ||
    !completeEvidence(fact.source) ||
    (result.custody === null && result.completion === null)
  )
    return 'release without its retained or processed result'
  draft.consumptions = draft.consumptions.map(item =>
    item.id === fact.consumption
      ? {
          ...item,
          results: item.results.map(value =>
            value.result.version === fact.result.version
              ? { ...value, release: 'confirmed' }
              : value,
          ),
        }
      : item,
  )
  return null
}
