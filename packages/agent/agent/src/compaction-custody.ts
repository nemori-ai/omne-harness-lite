import type {
  Access,
  AgentReceivedRecords,
  CompactionHandoff,
  CompactionReply,
  CompactionResultIdentity,
  CompactionTaskRef,
  DurableEvidence,
} from '@omne-harness/agent-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonical } from './canonical.ts'
import { compactionOperation } from './compaction-identities.ts'
import { positionExecution } from './loop/identities.ts'

export type AgentCompactionCustodyQuestion<P> = Access<P> &
  Readonly<{
    ref: CompactionTaskRef
    result: CompactionResultIdentity
    handoff: CompactionHandoff
  }>
export interface AgentCompactionCustodyEvidence<P> {
  verify(input: AgentCompactionCustodyQuestion<P>): CompactionReply<DurableEvidence>
}

export function createAgentCompactionCustodyEvidence<P>(
  records: AgentReceivedRecords<P>,
): AgentCompactionCustodyEvidence<P> {
  return {
    async verify(input) {
      const { handoff } = input
      const execution = positionExecution(handoff.consumer)
      if (
        execution === null ||
        handoff.consumer.purpose !== 'compaction' ||
        handoff.kind !== 'retained'
      )
        return fail({ kind: 'handoff-invalid', reason: 'not an Agent compaction receipt' })
      const { authority, task, requestDigest } = input.ref
      const identity = { authority, task, requestDigest }
      let read
      try {
        read = await records.query({
          principal: input.principal,
          tenant: input.tenant,
          execution,
          operation: compactionOperation(identity, 'received'),
        })
      } catch {
        return fail({
          kind: 'unavailable',
          dependency: 'agent-received-records',
          diagnostic: 'custody read threw',
        })
      }
      if ('failure' in read) {
        if (read.failure.kind === 'denied') return fail(read.failure)
        return fail({
          kind: 'unavailable',
          dependency: 'agent-received-records',
          diagnostic: read.failure.kind,
        })
      }
      if (read.ok.kind !== 'committed')
        return fail({
          kind: 'unavailable',
          dependency: 'agent-received-records',
          diagnostic: `custody-${read.ok.kind}`,
        })
      const { entry, saved } = read.ok.value
      if (
        entry.delivery.producer !== 'compaction' ||
        canonical(entry.delivery.key) !==
          canonical({ kind: 'result', task: identity, result: input.result }) ||
        canonical(entry.consumer) !== canonical(handoff.consumer) ||
        canonical(saved) !== canonical(handoff.custody)
      )
        return fail({ kind: 'handoff-invalid', reason: 'the committed custody differs' })
      return succeed(structuredClone(saved))
    },
  }
}
