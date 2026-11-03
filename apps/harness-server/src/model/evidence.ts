// The evidence adapter the `model-records` row hands the commands core (`tmp/wire-model/design.md`,
// R2-D33 §4.4). One adapter per consumer owner evidence adoption. Each method signs out only from
// a real source, or answers `unavailable` with a fixed diagnostic:
// - `continuity`: the first-execution record of this records activation (`initial.continuity`).
// - `materialization`: the reader the send stage installed from its real resource factory.
// - `receive`, `lateFact`, `retry`, `handoff`: no production source in wave 2. `receive` unproven
//   keeps the first content `none-proven`; `retry` keeps `policy-unavailable`; `handoff` keeps the
//   result at `saved` without an ACK (AD-05 is not wired). All are known limitations of M2.
import type { Adoption, ModelFailure } from '@omne-harness/model-contract'
import type { ModelMaterializationEvidenceReader } from '@omne-harness/model-host-local'
import type { ModelCommandsEvidence, ModelInitialExecution } from '@omne-harness/model/commands'
import { fail } from '@omne-harness/operation-result'

export type EvidenceSources = Readonly<{
  /** The first-execution record of the current records activation; absent before it is attached. */
  initial(): ModelInitialExecution<unknown> | undefined
  /** The materialization reader the send stage installed; absent while no send path is open. */
  reader(): ModelMaterializationEvidenceReader | undefined
}>

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
    handoff: () => unavailable('consumer-evidence', 'handoff-source-not-wired'),
  }
  return Object.freeze(adapter)
}
