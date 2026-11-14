import type { Context } from '@deepseek-ai/cordis'
import {
  AGENT_CONSUMER_OWNER,
  createAgentCustodyEvidence,
  type AgentCustodyEvidence,
} from '@omne-harness/agent'
import type { AgentReceivedRecords } from '@omne-harness/agent-contract'
import { agentReceivedRecordsKey } from '@omne-harness/agent-cordis-contract/cordis'
import type { Adoption, ModelFailure } from '@omne-harness/model-contract'
import type { ModelMaterializationEvidenceReader } from '@omne-harness/model-host-local'
import type { ModelCommandsEvidence, ModelInitialExecution } from '@omne-harness/model/commands'
import { fail } from '@omne-harness/operation-result'

export type EvidenceSources = Readonly<{
  initial(): ModelInitialExecution<unknown> | undefined
  reader(): ModelMaterializationEvidenceReader | undefined
  custody(): AgentCustodyEvidence<unknown> | undefined
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
    receive: () => unavailable('model-receive-evidence', 'receive-window-unproven'),
    lateFact: () => unavailable('model-late-fact-evidence', 'no-supplier-record-source'),
    retry: () => unavailable('model-retry-policy', 'not-configured'),
    handoff: given => {
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
