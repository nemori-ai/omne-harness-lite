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

export type CachedAssemblyMaterial = Readonly<{
  target: ContextTarget
  key: PreparedInputKey
  history: Readonly<{
    evidence: HistoryEvidence
    token: GroupToken
    rows: readonly HistoryRow[]
    view: ProjectedHistory
  }>
  prompt: Readonly<{
    token: GroupToken
    context: AssemblyContext
    rendered: Extract<SystemPromptResult, { kind: 'rendered' }>
  }>
  tools: Readonly<{ token: GroupToken; declarations: ToolDeclarationSet }>
  snapshot: Readonly<{ identity: SnapshotIdentity; reminder: SnapshotReminder }> | null
  split: Readonly<{
    anchor: SnapshotAnchor
    head: readonly ProjectedMessage[]
    body: readonly ProjectedMessage[]
  }>
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

export interface AssemblyReuse {
  load(
    input: Readonly<{ principal: PrincipalKey; purpose: RequestPurpose; position: PositionRef }>,
  ): CachedAssemblyMaterial | null
  stage(material: CachedAssemblyMaterial): void
}

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
