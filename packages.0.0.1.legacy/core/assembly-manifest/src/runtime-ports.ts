import type { AssetEvaluator } from '@omne-harness-lite/asset-evaluation'
import type { EvaluationRef, ManifestSessionRef, Presence } from './types.ts'

export interface PresenceSource {
  /** All requested facts belong to one observation; unknown facts must stay absent from this map. */
  read(
    session: ManifestSessionRef,
    names: readonly string[],
  ): Promise<Readonly<Record<string, Presence>> | { readonly failure: 'unavailable' }>
}
export interface ManifestDiagnostic {
  readonly kind: 'assembly_manifest'
  readonly operation:
    'readHead' | 'append' | 'readHistory' | 'dependencyPresence' | 'readEvaluation' | 'readGiven'
  readonly providerRevision: 'MF4'
  readonly session: string
  readonly result: string
  readonly head?: number
  readonly evaluationRef?: EvaluationRef
  /** Emits after the actual resource returns or throws; this does not imply a storage transaction. */
  readonly resourceEnded: true
  readonly stage?:
    | 'capacity'
    | 'head_range'
    | 'source'
    | 'decode'
    | 'projection'
    | 'parent_conflict'
    | 'table_failure'
  readonly requestedHead?: number
  readonly requestedHeadOmitted?: true
  readonly selectedSeq?: number
}
export interface ManifestOptions {
  readonly evaluator?: AssetEvaluator
  readonly presenceSource?: PresenceSource
  /** Ports own bounded output/retention. This provider never forwards payloads or error messages. */
  readonly diagnostic?: (event: ManifestDiagnostic) => void
  readonly diagnosticFailure?: (fact: { readonly kind: 'manifest_diagnostic_unavailable' }) => void
}
