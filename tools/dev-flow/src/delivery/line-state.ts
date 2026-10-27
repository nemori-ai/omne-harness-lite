import { parseCollaborationRecord } from './collaboration-parse.ts'
import { readLineRecords, validateConsumption } from './line-inbox.ts'
import { writeLineRecord, type LineWriteInput } from './line-delta.ts'
import { InputError } from './protocol.ts'

export function publishLineState(input: LineWriteInput) {
  const record = parseCollaborationRecord(input.record)
  if (record.kind !== 'consumption') throw new InputError('line-state-required')
  const readInput = {
    repo: record.context.repo,
    parent: record.lineParent,
    milestone: record.context.milestone,
    read: input.call,
    authority: input.authority,
  }
  const history = readLineRecords(readInput)
  validateConsumption(record, history.deltaAliases)
  if (
    !history.states.some(item => item.record.operationId === record.operationId) &&
    record.consumedRevision < (history.states.at(-1)?.record.consumedRevision ?? 0)
  )
    throw new InputError('line-consumption-rewind')
  const result = writeLineRecord(input, record)
  if (result.kind === 'confirmed') readLineRecords(readInput)
  return result
}
