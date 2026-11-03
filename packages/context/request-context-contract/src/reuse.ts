// The reuse seam of one operation group (RQ-13, CX-14). The registry of the request-context member
// owns the process-local state behind it; this file only names the two actions, the immutable
// stable material, and pure functions over them. No state, no resource, no IO.
import type { ToolDeclarationSet } from './declare-tools.js'
import type { ProjectedHistory } from './projection.js'
import type { SystemPromptResult } from './prompt.js'
import type { ContextTarget, GroupToken, PassageRef, PositionRef, PrincipalKey } from './refs.js'
import type { HistoryRow } from './ports.js'
import type {
  AlterationEvidence,
  AssemblyContext,
  ConditionsEvidence,
  HistoryEvidence,
  PreparedInputKey,
  ProjectedMessage,
  RequestPurpose,
  SnapshotAnchor,
  SnapshotReminder,
} from './values.js'
import type { EligibilityId, ScopeRef, ViewRevision } from '@omne-harness/runtime-context-contract'
import { tenantEquals } from '@omne-harness/legal-identity'
import { canonical } from './internal.js'

/**
 * The stable content of one principal and purpose, derived from inputs the source owners fixed. It
 * keeps the key of the call that derived it; a later call at another consumption position may build
 * on it, because the position enters no derived content.
 */
export type CachedAssemblyMaterial = Readonly<{
  /** The tenant and scope this material was derived for. */
  target: ContextTarget
  /** The complete key of the call that derived it, including the source generation and every token. */
  key: PreparedInputKey
  history: Readonly<{
    evidence: HistoryEvidence
    /** The complete token of the history group at the time of the read. */
    token: GroupToken
    /** Contiguous original rows; the last one is the sequence a tail read continues from. */
    rows: readonly HistoryRow[]
    view: ProjectedHistory
  }>
  prompt: Readonly<{
    token: GroupToken
    context: AssemblyContext
    rendered: Extract<SystemPromptResult, { kind: 'rendered' }>
  }>
  tools: Readonly<{ token: GroupToken; declarations: ToolDeclarationSet }>
  /** The stable reminder of the layer ④, without the facts of the tail. */
  snapshot: Readonly<{ identity: SnapshotIdentity; reminder: SnapshotReminder }> | null
  /** The layered stable history under one anchor; the layer ⑥ is not part of it. */
  split: Readonly<{
    anchor: SnapshotAnchor
    head: readonly ProjectedMessage[]
    body: readonly ProjectedMessage[]
  }>
  /** The values of the control group that do not carry the previous preparation. */
  contentControl: ContentControl
}>
export type SnapshotIdentity = Readonly<{
  scope: ScopeRef['ref']
  eligibility: EligibilityId
  viewRevision: ViewRevision
  anchor: SnapshotAnchor
}>
export type ContentControl = Readonly<{
  conditions: ConditionsEvidence
  alterations: readonly AlterationEvidence[]
  beforeModelCall: readonly PassageRef[] | null
}>

/**
 * The two actions a registry lends to the operations of one call. `load` checks no access: it is
 * called only after the call has been admitted. `stage` writes the transaction of this call, never
 * the shared state. `position` is the position of this call; a registry need not partition by it.
 */
export interface AssemblyReuse {
  load(
    input: Readonly<{ principal: PrincipalKey; purpose: RequestPurpose; position: PositionRef }>,
  ): CachedAssemblyMaterial | null
  stage(material: CachedAssemblyMaterial): void
}

/** The control values that decide reuse; the previous preparation is a different call fact. */
export function contentControlOf(control: {
  conditions: ConditionsEvidence
  alterations: readonly AlterationEvidence[]
  beforeModelCall: readonly PassageRef[] | null
}): ContentControl {
  return {
    conditions: control.conditions,
    alterations: control.alterations,
    beforeModelCall: control.beforeModelCall,
  }
}
export function sameContentControl(left: ContentControl, right: ContentControl): boolean {
  return canonical(left) === canonical(right)
}

/**
 * Whether the material belongs to exactly this principal, generation, purpose and target. The
 * consumption position is not compared: it enters no derived content, and each layer checks its
 * own inputs (history evidence and epoch, group tokens, snapshot identity) before it reuses one.
 */
export function materialBelongs(
  material: CachedAssemblyMaterial,
  expected: Readonly<{
    principal: PrincipalKey | undefined
    generation: PreparedInputKey['generation'] | undefined
    purpose: RequestPurpose
    target: ContextTarget
  }>,
): boolean {
  const { key } = material
  return (
    expected.principal !== undefined &&
    key.principal === expected.principal &&
    key.generation === (expected.generation ?? null) &&
    key.identity.purpose === expected.purpose &&
    material.target.scope.ref === expected.target.scope.ref &&
    tenantEquals(material.target.tenant, expected.target.tenant)
  )
}
