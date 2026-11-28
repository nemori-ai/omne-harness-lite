import type { AgentExecutionId, Failure } from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { decodeFixedRequestRecord } from '@omne-harness/request-context-contract'
import type { ExecutionRecordWrite } from '@omne-harness/session-storage-sql/participants'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { CommonRoot } from '../testing/root.ts'
import { blobRowDigest } from './journal-batch.ts'
import { unavailable, type Prepared } from './journal-publication.ts'

type Choices = NonNullable<ExecutionRecordWrite['choices']>[number]

function choicesOf(record: unknown): JsonValue[] | null {
  const decoded = decodeFixedRequestRecord(record)
  if ('failure' in decoded) return null
  return decoded.ok.coverage.representations.map(({ message, block, choice, mediaType }) => ({
    message,
    block,
    choice,
    mediaType,
  }))
}

// The record comes from the core, not this batch: a byte-identical record is not written again.
export function adoptionRows(
  after: CommonRoot,
  prepared: Prepared,
  execution: string,
  settles: boolean,
): Outcome<Pick<ExecutionRecordWrite, 'choices' | 'retain'>, Failure> {
  const choices: Choices[] = []
  for (const { fact } of prepared.derived) {
    if (fact.kind !== 'request.adopted') continue
    const reference = String(fact.reference)
    const record = after.agent.blobs.get(fact.record.digest)
    if (record === undefined)
      return fail(unavailable(`the core holds no record of the request adopted for ${reference}`))
    const payload = choicesOf(record)
    if (payload !== null) choices.push({ reference, payload })
  }
  const view = settles ? prepared.view.executions.get(execution as AgentExecutionId) : undefined
  const adopted = view?.adopted ?? null
  return succeed({
    ...(choices.length === 0 ? {} : { choices }),
    ...(adopted === null
      ? {}
      : {
          retain: {
            reference: String(adopted.reference),
            pub: String(adopted.pub),
            digest: blobRowDigest(adopted.record.digest),
            adoption: { fixed: adopted.fixed, coverage: adopted.coverage, schema: adopted.schema },
          },
        }),
  })
}
