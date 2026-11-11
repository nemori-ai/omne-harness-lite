// The ledger's record of one body (BodyLifecycle `status`), kept apart from the deciders so the
// store's record union and the deciders do not import each other.
import type {
  DurableEvidence,
  ToolBodyId,
  ToolBodyRepresentation,
  ToolOperationId,
  ToolResultVersion,
  ToolStartRecord,
} from '@omne-harness/tool-contract'
import type { ToolBodyManifest } from '@omne-harness/tool-contract/provider'
import type { BodyPolicy } from './result-offloading.ts'

export type BodyEntryState =
  | Readonly<{ kind: 'opened' }>
  | Readonly<{ kind: 'sealed'; manifest: ToolBodyManifest }>
  | Readonly<{ kind: 'linked'; result: ToolResultVersion; manifest: ToolBodyManifest }>
  | Readonly<{ kind: 'orphaned' }>
  | Readonly<{ kind: 'reclaimed' }>

export type BodyEntryRecord = Readonly<{
  bodyId: ToolBodyId
  key: string
  /** The author execution that writes it; null for the body the ledger writes at settlement. */
  start: ToolStartRecord | null
  operation: ToolOperationId
  source: DurableEvidence
  inputDigest: string
  policy: BodyPolicy
  representation: ToolBodyRepresentation
  custody: DurableEvidence
  state: BodyEntryState
}>
