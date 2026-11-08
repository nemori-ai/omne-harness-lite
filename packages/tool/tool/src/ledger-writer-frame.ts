import { readJsonText } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolBodyWriteReply } from '@omne-harness/tool-contract/provider'
import { fixCleanupFields } from './cleanup-boundary.ts'
import { fixJsonTree } from './json-tree.ts'
import type { Snapshot } from './ledger-decider.ts'
import { bodyFrame, fromReply, type WriterPorts } from './ledger-writer-access.ts'
import { writerIdentity, type WriterInput } from './ledger-writer-decisions.ts'
import type { PreparedBodyFrame } from './ledger-writer-records.ts'

export async function prepareWriterFrame<P>(
  value: unknown,
  snapshot: Snapshot,
  input: WriterInput<P>,
  sequence: string,
  schemas: WriterPorts<P>['bodySchemas'],
): ToolBodyWriteReply<PreparedBodyFrame> {
  if (typeof value !== 'object' || value === null || Reflect.get(value, 'kind') !== 'json-record')
    return fromReply(bodyFrame(value), input.operation)
  const fields = fixCleanupFields(value, ['kind', 'value'])
  if ('failure' in fields) return fromReply(fields, input.operation)
  const writer = snapshot.writers.get(writerIdentity(input.start, input.key))
  if (writer === undefined || writer.policy.declaration.kind !== 'json-lines')
    return fail({ kind: 'invalid', reason: 'JSON record requires a JSON Lines writer' })
  const limits = writer.policy.jsonLimits
  if (limits === null) return fail({ kind: 'invalid', reason: 'JSON record budget missing' })
  const fixed = fixJsonTree(fields.ok.value, limits.maxBytes)
  if ('failure' in fixed)
    return fail({
      kind:
        fixed.failure.reason === 'too-large' || fixed.failure.reason === 'budget'
          ? 'too-large'
          : 'invalid',
      reason: fixed.failure.detail,
    })
  const read = readJsonText(fixed.ok.text, limits)
  if (read.kind !== 'ok')
    return fail({
      kind: read.kind === 'budget' ? 'too-large' : 'invalid',
      reason: `JSON record ${read.kind}`,
    })
  const frame = { kind: 'json-record', text: `${fixed.ok.text}\n` } as const
  if (snapshot.writerAppends.has(JSON.stringify([writer.id, sequence]))) return succeed(frame)
  if (schemas === undefined)
    return fail({
      kind: 'unavailable',
      operation: input.operation,
      reason: 'body schema checker missing',
    })
  try {
    const checked = await schemas.check(writer.policy.declaration.record, read)
    return 'failure' in checked ? fromReply(checked, input.operation) : succeed(frame)
  } catch {
    return fail({
      kind: 'unavailable',
      operation: input.operation,
      reason: 'body schema checker failed; record not admitted',
    })
  }
}
