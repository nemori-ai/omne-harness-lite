import {
  type EvaluationRef,
  type ManifestSessionRef,
  type Presence,
  type AssemblyManifestService,
} from '@omne-harness-lite/assembly-manifest'

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
  /** Emits only after storage has actually returned or thrown. */
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
  readonly presenceSource?: PresenceSource
  /** Ports own bounded output/retention. This provider never forwards payloads or error messages. */
  readonly diagnostic?: (event: ManifestDiagnostic) => void
  readonly diagnosticFailure?: (fact: { readonly kind: 'manifest_diagnostic_unavailable' }) => void
}
export interface AssemblyManifestStore extends AssemblyManifestService {
  close(): Promise<void>
}
export interface ManifestDb {
  assembly_manifest_record: {
    session: string
    seq: number
    evaluation_kind: 'given' | 'mint' | 'reuse'
    evaluation_ref: string
    owned_ref: string | null
    content: string
  }
  assembly_manifest_table: {
    session: string
    seq: number
    category: string
    filled_at: number
    composition: string
  }
}
