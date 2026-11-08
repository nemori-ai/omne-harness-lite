import { succeed, type Outcome } from '@omne-harness/operation-result'
import { decodeToolOperationId, type Adoption, type ToolFailure } from '@omne-harness/tool-contract'
import {
  decodeToolMaterialInstant,
  decodeToolRevision,
  type CallAccess,
} from '@omne-harness/tool-contract/provider'
import { invalid, judgeEvidenceField } from './boundary.ts'
import { sameFactValue } from './evidence.ts'
import { decodeHistoricalTextInterpretation } from './history-interpretation.ts'
import { encodeToolMaterial } from './material-codec.ts'
import { historyObject } from './history-source.ts'
import type { HistoricalMigrationPlan, HistoricalSourceFingerprint } from './history-contract.ts'
import type { ToolHistoryStoredRecord } from './history-store.ts'

const malformed = () => invalid('history', 'invalid-saved-plan')

function sourceOf(value: unknown, access: CallAccess<unknown>): HistoricalSourceFingerprint | null {
  if (
    !historyObject(value) ||
    value.format !== 'tool-ledger-pre-w3' ||
    !sameFactValue(value.tenant, access.tenant) ||
    value.call !== access.call ||
    !Array.isArray(value.keys) ||
    !value.keys.every(key => typeof key === 'string') ||
    new Set(value.keys).size !== value.keys.length ||
    !historyObject(value.value)
  )
    return null
  const revision = decodeToolRevision(value.revision)
  const fingerprint = value.value
  if (
    'failure' in revision ||
    fingerprint.codec !== 'tool-canonical-json-v1' ||
    fingerprint.algorithm !== 'sha256' ||
    typeof fingerprint.digest !== 'string' ||
    !/^[0-9a-f]{64}$/.test(fingerprint.digest) ||
    typeof fingerprint.bytes !== 'string' ||
    !/^(0|[1-9][0-9]*)$/.test(fingerprint.bytes)
  )
    return null
  return {
    format: 'tool-ledger-pre-w3',
    tenant: access.tenant,
    call: access.call,
    revision: revision.ok,
    keys: [...value.keys],
    value: {
      codec: fingerprint.codec,
      algorithm: fingerprint.algorithm,
      digest: fingerprint.digest,
      bytes: fingerprint.bytes,
    },
  }
}

export function readHistoricalPlan(
  row: ToolHistoryStoredRecord,
  access: CallAccess<unknown>,
  adoption: Adoption,
): Outcome<HistoricalMigrationPlan, ToolFailure> {
  const record = row.record
  if (
    !historyObject(record) ||
    record.kind !== 'history-migration' ||
    !historyObject(record.migration)
  )
    return malformed()
  const value = record.migration
  const operation = decodeToolOperationId(value.operation)
  const source = sourceOf(value.source, access)
  if (
    'failure' in operation ||
    row.key !== `history-migration:${operation.ok}` ||
    source === null ||
    !Array.isArray(value.interpretations) ||
    !historyObject(value.progress) ||
    value.progress.operation !== operation.ok ||
    !sameFactValue(value.progress.source, source)
  )
    return malformed()
  const interpretations = []
  for (const supplied of value.interpretations) {
    const decoded = decodeHistoricalTextInterpretation(supplied)
    if ('failure' in decoded) return malformed()
    interpretations.push(decoded.ok)
  }
  const expected = encodeToolMaterial({ adoption, source, interpretations })
  if ('failure' in expected || !sameFactValue(expected.ok.fingerprint, value.input))
    return malformed()
  const base = { operation: operation.ok, source }
  const progress = value.progress
  if (progress.kind === 'preparing' || progress.kind === 'abandoning')
    return succeed({ progress: { ...base, kind: progress.kind }, interpretations })
  const receipt = judgeEvidenceField(progress.receipt, 'receipt')
  if ('failure' in receipt) return malformed()
  if (progress.kind === 'abandoned')
    return succeed({
      progress: { ...base, kind: 'abandoned', receipt: receipt.ok },
      interpretations,
    })
  const at = decodeToolMaterialInstant(progress.activatedAt)
  if ('failure' in at || (progress.kind !== 'published' && progress.kind !== 'cleaned'))
    return malformed()
  return succeed({
    progress: { ...base, kind: progress.kind, receipt: receipt.ok, activatedAt: at.ok },
    interpretations,
  })
}
