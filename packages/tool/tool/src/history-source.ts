import type { ContentBlock } from '@omne-harness/content-block'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type DurableEvidence,
  type ToolRenderedResult,
  type RawOutput,
} from '@omne-harness/tool-contract'
import {
  judgeHistoricalFixedToolRequest,
  judgeToolState,
  type CallAccess,
  type ResultPolicy,
} from '@omne-harness/tool-contract/provider'
import type { HistoricalCallRecord } from './history-request.ts'
import type { ToolHistoryStoredRecord } from './history-store.ts'
import type { HistoricalQuarantineReason } from './history-contract.ts'
import type {
  FactBatchRecord,
  FactEventRecord,
  ResultRecord,
  LedgerRecord,
} from './ledger-store.ts'
import { hasCurrentToolLedgerRecordFormat } from './ledger-record-format.ts'
import { judgeEvidenceField } from './boundary.ts'
import { sameFactValue } from './evidence.ts'
import { encodeToolMaterial } from './material-codec.ts'

export type HistoricalResultRecord = Omit<ResultRecord, 'value' | 'custody'> &
  Readonly<{
    value: ToolRenderedResult<ContentBlock>
    custody: Readonly<{
      kind: 'execution'
      final: DurableEvidence
      raw: RawOutput
      retainOperation: string
      retained: DurableEvidence
      cleanup: Extract<ResultRecord['custody'], { kind: 'execution' }>['cleanup']
    }>
  }>
export type HistoricalFact = Omit<FactEventRecord, 'value' | 'fact'> &
  Readonly<{
    fact: Readonly<{
      kind: 'final'
      raw: RawOutput
      result: ToolRenderedResult<ContentBlock>
      terminal: ResultRecord['terminal']
      effect: ResultRecord['effect']
    }>
  }>
export type HistoricalSource = Readonly<{
  call: HistoricalCallRecord
  results: readonly HistoricalResultRecord[]
  facts: readonly HistoricalFact[]
  batches: readonly Omit<FactBatchRecord, 'value'>[]
  records: readonly ToolHistoryStoredRecord[]
}>
export type HistoricalSourceRead =
  | Readonly<{ kind: 'current' }>
  | Readonly<{ kind: 'quarantined'; reason: HistoricalQuarantineReason }>
  | Readonly<{ kind: 'ready'; source: HistoricalSource }>

export function historyObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
const quarantine = (reason: HistoricalQuarantineReason): HistoricalSourceRead => ({
  kind: 'quarantined',
  reason,
})

/** Decodes the fixed pre-W3 persistence version; it does not reinterpret old return declarations. */
export function readHistoricalSource(
  access: CallAccess<unknown>,
  records: readonly ToolHistoryStoredRecord[],
  policy: ResultPolicy<ContentBlock>,
): HistoricalSourceRead {
  if ('failure' in encodeToolMaterial(records)) return quarantine('unsupported-format')
  const callRow = records.find(row => row.key === 'call')?.record
  if (!historyObject(callRow) || callRow.kind !== 'call' || !historyObject(callRow.call))
    return quarantine('unsupported-format')
  const rawCall = callRow.call
  if (!sameFactValue(rawCall.tenant, access.tenant) || rawCall.call !== access.call)
    return quarantine('ownership')
  if (hasCurrentToolLedgerRecordFormat(callRow))
    return records.every(row => hasCurrentToolLedgerRecordFormat(row.record))
      ? { kind: 'current' }
      : quarantine('unsupported-format')
  const request = judgeHistoricalFixedToolRequest(rawCall.request)
  if (
    'failure' in request ||
    !Array.isArray(rawCall.preparations) ||
    'failure' in decodeToolOperationId(rawCall.admission) ||
    'failure' in decodeToolCallId(rawCall.call)
  )
    return quarantine('unsupported-format')
  for (const preparation of rawCall.preparations) {
    if (
      !historyObject(preparation) ||
      'failure' in judgeHistoricalFixedToolRequest(preparation.request) ||
      'failure' in decodeToolOperationId(preparation.operation) ||
      preparation.call !== access.call ||
      !sameFactValue(preparation.tenant, access.tenant)
    )
      return quarantine('unsupported-format')
  }
  const state = judgeToolState(rawCall.state)
  if ('failure' in state) return quarantine('unsupported-format')
  if (state.ok.call !== access.call) return quarantine('ownership')
  if (
    state.ok.phase !== 'settled' ||
    state.ok.execution.kind !== 'ended' ||
    state.ok.queue.kind !== 'released' ||
    state.ok.wait.kind !== 'none' ||
    state.ok.controls.some(control => control.progress.kind === 'pending')
  )
    return quarantine('in-flight')
  if (state.ok.delivery?.kind !== 'released') return quarantine('pending-handoff')
  if (!sameFactValue(request.ok.consumer, state.ok.delivery.consumer))
    return quarantine('ownership')
  const results: HistoricalResultRecord[] = []
  const facts: HistoricalFact[] = []
  const batches: Omit<FactBatchRecord, 'value'>[] = []
  const releasedPreparations = new Set<string>()
  for (const row of records) {
    const record = row.record
    if (!historyObject(record) || typeof record.kind !== 'string')
      return quarantine('unsupported-format')
    if (record.kind === 'call') continue
    const payload =
      record[
        record.kind === 'fact-event' ? 'fact' : record.kind === 'fact-batch' ? 'batch' : record.kind
      ]
    if (record.kind === 'result') {
      if (
        !historyObject(payload) ||
        !historyObject(payload.custody) ||
        payload.custody.kind !== 'execution' ||
        !historyObject(payload.delivery) ||
        payload.delivery.kind !== 'released'
      )
        return quarantine('pending-handoff')
      if (row.key !== `result:${payload.result}`) return quarantine('unsupported-format')
      const checked = policy.judgeResult(payload.value as ToolRenderedResult<ContentBlock>)
      if ('failure' in checked) return quarantine('unsupported-format')
      if (
        'failure' in judgeEvidenceField(payload.source, 'source') ||
        'failure' in decodeToolOperationId(payload.settledBy) ||
        'failure' in judgeEvidenceField(payload.custody.final, 'final') ||
        'failure' in judgeEvidenceField(payload.custody.retained, 'retained')
      )
        return quarantine('unsupported-format')
      if (checked.ok.data.kind !== 'none') return quarantine('ownership')
      if (!sameFactValue(payload.tenant, access.tenant) || payload.call !== access.call)
        return quarantine('ownership')
      // The original persisted version owns the remaining receipt fields; the current request decoder is deliberately not applied.
      results.push({ ...payload, value: checked.ok } as HistoricalResultRecord)
    } else if (record.kind === 'fact-event') {
      if (!historyObject(payload) || !historyObject(payload.fact) || payload.fact.kind !== 'final')
        return quarantine('unsupported-format')
      const checked = policy.judgeResult(payload.fact.result as ToolRenderedResult<ContentBlock>)
      if ('failure' in checked) return quarantine('unsupported-format')
      if (
        'failure' in judgeEvidenceField(payload.evidence, 'evidence') ||
        'failure' in judgeEvidenceField(payload.source, 'source') ||
        !sameFactValue(payload.start, rawCall.start) ||
        payload.call !== access.call ||
        !sameFactValue(payload.tenant, access.tenant) ||
        typeof payload.event !== 'string' ||
        typeof payload.key !== 'string'
      )
        return quarantine('ownership')
      facts.push(payload as HistoricalFact)
    } else if (record.kind === 'fact-batch') {
      if (
        !historyObject(payload) ||
        !historyObject(payload.acknowledgement) ||
        payload.acknowledgement.kind !== 'confirmed'
      )
        return quarantine('in-flight')
      if (
        !sameFactValue(payload.start, rawCall.start) ||
        payload.call !== access.call ||
        !sameFactValue(payload.tenant, access.tenant) ||
        'failure' in judgeEvidenceField(payload.source, 'source') ||
        !historyObject(payload.receipt) ||
        'failure' in judgeEvidenceField(payload.receipt.custody, 'custody') ||
        'failure' in judgeEvidenceField(payload.acknowledgement.sourceReceipt, 'sourceReceipt') ||
        !Array.isArray(payload.events) ||
        !payload.events.every(event => typeof event === 'string')
      )
        return quarantine('unsupported-format')
      batches.push(payload as Omit<FactBatchRecord, 'value'>)
    } else if (record.kind === 'task') {
      if (
        !historyObject(record.task) ||
        record.task.kind !== 'clock' ||
        record.task.state !== 'blocked' ||
        record.task.diagnostic !== 'execution-end-clock-marker-unavailable'
      )
        return quarantine('in-flight')
    } else if (record.kind === 'environment-release') {
      const release = record.environmentRelease
      if (
        !historyObject(release) ||
        !historyObject(release.progress) ||
        release.progress.kind !== 'released' ||
        !historyObject(release.release) ||
        typeof release.release.preparation !== 'string'
      )
        return quarantine('in-flight')
      releasedPreparations.add(release.release.preparation)
    } else if (!['operation', 'fact-stream', 'account', 'exclusion'].includes(record.kind))
      return quarantine('unsupported-format')
  }
  if (
    results.length === 0 ||
    facts.length !== results.length ||
    rawCall.preparations.some(
      item => !historyObject(item) || !releasedPreparations.has(String(item.operation)),
    )
  )
    return quarantine('in-flight')
  for (const result of results) {
    const final = facts.find(item => sameFactValue(item.evidence, result.custody.final))
    if (
      final === undefined ||
      !sameFactValue(final.fact.result, result.value) ||
      !sameFactValue(final.fact.raw, result.custody.raw)
    )
      return quarantine('ownership')
  }
  for (const batch of batches) {
    if (
      new Set(batch.events).size !== batch.events.length ||
      batch.events.some(
        event =>
          facts.filter(
            fact =>
              fact.event === event &&
              sameFactValue(fact.start, batch.start) &&
              sameFactValue(fact.source, batch.source),
          ).length !== 1,
      )
    )
      return quarantine('unsupported-format')
  }
  if (
    facts.some(
      fact =>
        !batches.some(
          batch =>
            batch.events.includes(fact.event) &&
            sameFactValue(fact.start, batch.start) &&
            sameFactValue(fact.source, batch.source),
        ),
    )
  )
    return quarantine('in-flight')
  const call = {
    ...rawCall,
    request: request.ok,
    requestFormat: 'historical-result',
    state: state.ok,
  } as HistoricalCallRecord
  return { kind: 'ready', source: { call, results, facts, batches, records } }
}

export function currentPreparationRecords(
  rows: readonly ToolHistoryStoredRecord[],
  keys: readonly string[],
): readonly LedgerRecord[] | null {
  const original = new Set(keys)
  const records: LedgerRecord[] = []
  for (const row of rows) {
    if (original.has(row.key)) continue
    if (
      !historyObject(row.record) ||
      ![
        'history-migration',
        'material',
        'material-use',
        'material-time',
        'material-cleanup',
        'material-maintenance-hint',
        'material-maintenance',
        'operation',
        'exclusion',
      ].includes(String(row.record.kind)) ||
      !hasCurrentToolLedgerRecordFormat(row.record)
    )
      return null
    records.push(row.record as LedgerRecord)
  }
  return records
}

export function historicalCopyPlan(
  source: HistoricalSource,
  copies: readonly import('./history-contract.ts').HistoricalOwnedCopy[],
) {
  const known = new Set<string>()
  const retained = new Set<string>()
  const native = source.results.flatMap(result => [
    ...result.value.attachments,
    ...result.value.content.flatMap(block => ('ref' in block ? [block.ref] : [])),
    ...(result.value.original.kind === 'offloaded'
      ? result.value.original.summary.flatMap(block => ('ref' in block ? [block.ref] : []))
      : []),
  ])
  for (const result of source.results) {
    const raw = copies.find(
      copy =>
        copy.kind === 'raw' &&
        sameFactValue(copy.source, result.custody.raw.content) &&
        sameFactValue(copy.custody, result.custody.raw.custody),
    )
    const projection = copies.find(
      copy =>
        copy.kind === 'retain' &&
        copy.operation === result.custody.retainOperation &&
        sameFactValue(copy.custody, result.custody.retained),
    )
    if (raw === undefined || projection === undefined) return null
    known.add(raw.operation)
    known.add(projection.operation)
  }
  for (const copy of copies) {
    if (!sameFactValue(copy.tenant, source.call.tenant) || copy.call !== source.call.call)
      return null
    if (copy.source !== null && native.some(ref => sameFactValue(ref, copy.source))) {
      known.add(copy.operation)
      retained.add(copy.operation)
    }
    if (!known.has(copy.operation)) return null
  }
  return { cleanup: copies.filter(copy => !retained.has(copy.operation)), retained: retained.size }
}
