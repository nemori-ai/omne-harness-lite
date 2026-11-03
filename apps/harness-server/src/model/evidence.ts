// The evidence adapter the `model-records` row hands the commands core (`tmp/wire-model/design.md`,
// R2-D33 §4.4). One adapter per consumer owner evidence adoption. Each method signs out only from
// a real source, or answers `unavailable` with a fixed diagnostic:
// - `continuity`: the first-execution record of this records activation (`initial.continuity`).
// - `materialization`: the reader the send stage installed from its real resource factory.
// - `handoff`: the custody evidence of the Agent consumer owner (R2-D257). It reads the durable
//   received record that the Agent receiver committed, through the trusted `agentReceivedRecords`
//   of the `agent-journal` row, and confirms only an exact match (`createAgentCustodyEvidence`).
//   The face absent, or a record absent or unreadable: `unavailable`; evidence that differs from
//   the committed record: `handoff-invalid` (R2-D260). Either way the Model keeps the result and
//   its share until a later ACK of the same operation confirms.
//   The M2 release has one consumer owner of Model calls, `@omne-harness/agent` (the operator layers
//   give `model-records.owners` that one owner; no other member admits Model calls in M2). The
//   handoff of another owner is routed nowhere and answers `unavailable` (`owner-not-wired`): its
//   evidence is not refused as forged, it waits for its own adapter (R2-D262 S2).
// - `receive`, `lateFact`, `retry`: no production source in wave 2. `receive` unproven keeps the
//   first content `none-proven`; `retry` keeps `policy-unavailable`. Known limitations of M2.
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
  /** The first-execution record of the current records activation; absent before it is attached. */
  initial(): ModelInitialExecution<unknown> | undefined
  /** The materialization reader the send stage installed; absent while no send path is open. */
  reader(): ModelMaterializationEvidenceReader | undefined
  /** The custody evidence of the Agent consumer owner, read per call; absent with its face. */
  custody(): AgentCustodyEvidence<unknown> | undefined
}>

/**
 * The custody evidence of the Agent consumer owner over the trusted `agentReceivedRecords` that the
 * `agent-journal` row provides, read now in `ctx` (R2-D257). Absent face: undefined.
 */
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
