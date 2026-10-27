import { canonical } from '../integration/parse.ts'
import { InputError } from './protocol.ts'
import type {
  LineConsumptionRecord,
  LineDeltaRecord,
  RequestStateRecord,
} from './collaboration-records.ts'
import type { CollaborationComment } from './collaboration-read.ts'

export type SequencedRecord = LineDeltaRecord | LineConsumptionRecord | RequestStateRecord
export type SequencedComment<T extends SequencedRecord = SequencedRecord> = CollaborationComment & {
  record: T
}

function stream(record: SequencedRecord): string {
  const common = [record.kind, record.context.repo, record.context.milestone, record.lineParent]
  return JSON.stringify(record.kind === 'state' ? [...common, record.requestId] : common)
}

/** Orders one complete stream. Identical retry comments share a revision; conflicting bytes do not. */
export function orderedRecords<T extends SequencedRecord>(
  items: readonly SequencedComment<T>[],
): SequencedComment<T>[] {
  const sorted = [...items].sort((a, b) => a.record.revision - b.record.revision || a.id - b.id)
  const first = sorted[0]
  if (first === undefined) return []
  const key = stream(first.record),
    result: SequencedComment<T>[] = []
  const operations = new Map<string, string>(),
    ids = new Set<number>()
  let aliases = new Set<number>()
  for (const item of sorted) {
    const record = item.record,
      bytes = canonical(record)
    if (stream(record) !== key) throw new InputError('collaboration-record-stream-mismatch')
    if (ids.has(item.id)) throw new InputError('collaboration-record-duplicate-comment-id')
    ids.add(item.id)
    const previousOperation = operations.get(record.operationId)
    if (previousOperation !== undefined && previousOperation !== bytes)
      throw new InputError('collaboration-operation-conflict')
    operations.set(record.operationId, bytes)
    const previous = result.at(-1)
    if (previous?.record.revision === record.revision) {
      if (canonical(previous.record) !== bytes)
        throw new InputError('collaboration-record-revision-conflict')
      aliases.add(item.id)
      continue
    }
    if (record.revision !== (previous?.record.revision ?? 0) + 1)
      throw new InputError('collaboration-record-revision-gap')
    if (
      previous === undefined
        ? record.previousRecordId !== null
        : record.previousRecordId === null || !aliases.has(record.previousRecordId)
    )
      throw new InputError('collaboration-record-predecessor-mismatch')
    result.push(item)
    aliases = new Set([item.id])
  }
  return result
}
