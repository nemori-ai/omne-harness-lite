import { canonical } from '../integration/parse.ts'
import { commentDigest, encodeRecordComment } from './collaboration-comments.ts'
import { parseCollaborationRecord } from './collaboration-parse.ts'
import type { LineConsumptionRecord, LineDeltaRecord } from './collaboration-records.ts'
import { writeSequencedRecord, type RecordWriteInput } from './collaboration-write.ts'
import { operationJournal } from './operation-journal.ts'
import { InputError } from './protocol.ts'

export type LineWriteInput = Pick<RecordWriteInput, 'call' | 'authority'> & {
  journalRoot: string
  record: unknown
}

export function writeLineRecord(
  input: LineWriteInput,
  record: LineDeltaRecord | LineConsumptionRecord,
) {
  const journal = operationJournal(input.journalRoot, record.operationId)
  const body = encodeRecordComment(record)
  const intent = {
    repo: record.context.repo,
    issue: record.lineParent,
    operationId: record.operationId,
    body,
    sha256: commentDigest(body),
  }
  const saved = journal.read('intent.json')
  if (saved !== undefined && canonical(saved) !== canonical(intent))
    throw new InputError('line-operation-intent-conflict')
  const common = { record, call: input.call, authority: input.authority }
  return saved === undefined
    ? writeSequencedRecord({
        ...common,
        mode: 'publish',
        checkpoint: value => journal.save('intent.json', value),
      })
    : writeSequencedRecord({ ...common, mode: 'recover' })
}

export function publishLineDelta(input: LineWriteInput) {
  const record = parseCollaborationRecord(input.record)
  if (record.kind !== 'delta') throw new InputError('line-delta-required')
  return writeLineRecord(input, record)
}
