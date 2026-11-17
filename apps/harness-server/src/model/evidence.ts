import type { Context } from '@deepseek-ai/cordis'
import {
  AGENT_CONSUMER_OWNER,
  createAgentCustodyEvidence,
  type AgentCustodyEvidence,
} from '@omne-harness/agent'
import type { AgentReceivedRecords } from '@omne-harness/agent-contract'
import { agentReceivedRecordsKey } from '@omne-harness/agent-cordis-contract/cordis'
import type { Adoption, ModelFailure } from '@omne-harness/model-contract'
import type {
  ModelMaterializationEvidenceReader,
  ModelReceiveEvidenceReader,
} from '@omne-harness/model-host-local'
import { verifyRetryDecision } from '@omne-harness/model'
import type { ModelCommandsEvidence, ModelInitialExecution } from '@omne-harness/model/commands'
import { fail } from '@omne-harness/operation-result'
import { DEFAULT_COMPACTION_CONSUMER } from '@omne-harness/context-compaction'
import type { CompactionModelEvidence } from './compaction-evidence.ts'

export type EvidenceSources = Readonly<{
  initial(): ModelInitialExecution<unknown> | undefined
  reader(): ModelMaterializationEvidenceReader | undefined
  receive(): ModelReceiveEvidenceReader | undefined
  custody(): AgentCustodyEvidence<unknown> | undefined
  compaction?(): Pick<CompactionModelEvidence, 'verify'> | undefined
}>

export function agentCustodyOf(ctx: Context): AgentCustodyEvidence<unknown> | undefined {
  const records = ctx.get(agentReceivedRecordsKey) as AgentReceivedRecords<unknown> | undefined
  return records === undefined ? undefined : createAgentCustodyEvidence(records)
}

const unavailable = (dependency: string, diagnostic: string) =>
  fail<ModelFailure>({ kind: 'unavailable', dependency, diagnostic })

export function createModelEvidence(
  adoption: Adoption,
  sources: EvidenceSources,
): ModelCommandsEvidence {
  const adapter: ModelCommandsEvidence = {
    adoption,
    continuity: given =>
      sources.initial()?.continuity(given) ??
      unavailable('model-initial-execution', 'records-not-attached'),
    materialization: given =>
      sources.reader()?.prove(given) ??
      unavailable('model-materialization', 'reader-not-installed'),
    receive: given =>
      sources.receive()?.prove(given) ??
      unavailable('model-receive-evidence', 'receive-window-unproven'),
    lateFact: () => unavailable('model-late-fact-evidence', 'no-supplier-record-source'),
    retry: given => verifyRetryDecision(given),
    handoff: given => {
      if (given.consumer.owner === DEFAULT_COMPACTION_CONSUMER)
        return (
          sources.compaction?.()?.verify(given) ??
          unavailable('compaction-evidence', 'provider-not-attached')
        )
      if (given.consumer.owner !== AGENT_CONSUMER_OWNER)
        return unavailable('consumer-evidence', 'owner-not-wired')
      return (
        sources.custody()?.verify({
          principal: given.principal,
          tenant: given.tenant,
          call: given.call,
          consumer: given.consumer,
          reference: given.reference,
          result: given.result,
          evidence: given.evidence,
        }) ?? unavailable('consumer-evidence', 'received-records-absent')
      )
    },
  }
  return Object.freeze(adapter)
}
