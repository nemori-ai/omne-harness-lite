import {
  decodeCompactionOutcome,
  type CompactionOutcome,
  type CompactionReply,
  type CompactionRequest,
} from '@omne-harness/agent-contract'
import {
  decodeResultVersion,
  type FixedModelRequest,
  type ResultVersion,
} from '@omne-harness/model-contract'
import { judgeFixedModelRequest } from '@omne-harness/model-contract/provider'
import { parseRecordEntryRef, type RecordEntryRef } from '@omne-harness/message'
import { fail, succeed } from '@omne-harness/operation-result'
import type { CompactionStore } from './provider.ts'
import { canonical } from './evidence.ts'
import {
  isDefaultCompactionConfiguration,
  type DefaultCompactionConfiguration,
} from './default-configuration.ts'

export type SummaryOutcome = Exclude<CompactionOutcome, { kind: 'cancelled' }>
export type ProcessedSummary = Readonly<{
  attempt: number
  result: ResultVersion
  outcome: SummaryOutcome
  acknowledged: boolean
}>
export type DefaultExecutionState = Readonly<{
  version: 1
  phase: 'running'
  configuration: DefaultCompactionConfiguration
  fixed: FixedModelRequest
  coverTo: RecordEntryRef
  retained: readonly RecordEntryRef[]
  attempt: number
  processed: readonly ProcessedSummary[]
}>
export type DefaultPreparingState = Readonly<{
  version: 1
  phase: 'preparing'
  configuration: DefaultCompactionConfiguration
}>
export type DefaultState = DefaultPreparingState | DefaultExecutionState
const invalid = () =>
  fail({
    kind: 'invalid' as const,
    field: 'execution',
    reason: 'corrupt default compaction checkpoint',
  })
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const attempt = (value: unknown): value is number =>
  Number.isInteger(value) && typeof value === 'number' && value >= 1 && value <= 3

export function readDefaultState(text: string): Awaited<CompactionReply<DefaultState>> {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return invalid()
  }
  if (!object(raw) || raw.version !== 1 || !isDefaultCompactionConfiguration(raw.configuration))
    return invalid()
  const configuration = raw.configuration
  if (raw.phase === 'preparing')
    return Object.keys(raw).length === 3
      ? succeed({ version: 1, phase: 'preparing', configuration })
      : invalid()
  if (
    raw.phase !== 'running' ||
    Object.keys(raw).length !== 8 ||
    typeof raw.coverTo !== 'string' ||
    !Array.isArray(raw.retained) ||
    !attempt(raw.attempt) ||
    raw.attempt > configuration.summaryAttempts ||
    !Array.isArray(raw.processed)
  )
    return invalid()
  const fixed = judgeFixedModelRequest(raw.fixed)
  const coverTo = parseRecordEntryRef(raw.coverTo)
  if ('failure' in fixed || coverTo === null) return invalid()
  const retained: RecordEntryRef[] = []
  for (const value of raw.retained) {
    const ref = typeof value === 'string' ? parseRecordEntryRef(value) : null
    if (ref === null || retained.includes(ref)) return invalid()
    retained.push(ref)
  }
  const processed: ProcessedSummary[] = []
  for (const item of raw.processed) {
    if (
      !object(item) ||
      Object.keys(item).length !== 4 ||
      !attempt(item.attempt) ||
      item.attempt !== processed.length + 1 ||
      item.attempt > raw.attempt ||
      typeof item.acknowledged !== 'boolean'
    )
      return invalid()
    const result = decodeResultVersion(item.result)
    const outcome = decodeCompactionOutcome(JSON.stringify(item.outcome))
    if ('failure' in result || 'failure' in outcome || outcome.ok.kind === 'cancelled')
      return invalid()
    if (item.attempt < raw.attempt && (!item.acknowledged || outcome.ok.kind !== 'cannot-fit'))
      return invalid()
    processed.push({
      attempt: item.attempt,
      result: result.ok,
      outcome: outcome.ok,
      acknowledged: item.acknowledged,
    })
  }
  if (processed.length < raw.attempt - 1 || processed.length > raw.attempt) return invalid()
  return succeed({
    version: 1,
    phase: 'running',
    configuration,
    fixed: fixed.ok,
    coverTo,
    retained,
    attempt: raw.attempt,
    processed,
  })
}

export async function saveDefaultState(
  store: CompactionStore,
  request: CompactionRequest,
  previous: string | null,
  next: DefaultState,
  requirePending: boolean,
): CompactionReply<boolean> {
  const encoded = canonical(next)
  const valid = readDefaultState(encoded)
  if ('failure' in valid) return valid
  return store.change(request.ref, record => {
    if (record === null) return fail({ kind: 'not-found' })
    if (canonical(record.state.ref) !== canonical(request.ref))
      return fail({ kind: 'conflict', ref: request.ref })
    if (record.execution !== previous || (requirePending && record.state.phase !== 'pending'))
      return succeed({ record, value: false })
    return succeed({
      value: true,
      record: {
        ...record,
        execution: encoded,
        state: { ...record.state, revision: String(BigInt(record.state.revision) + 1n) },
      },
    })
  })
}
