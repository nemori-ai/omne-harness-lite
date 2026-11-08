import {
  definePermission,
  PermissionDefinitionRefSchema,
  PermissionRuleSchema,
} from '@omne-harness/permissions'
import type { DeclarationChange, WorkSnapshot } from './values.ts'
import type { SessionPermissionChangeBasis, SessionPermissions } from './permission-values.ts'
import type { SessionOperationId, DurableEvidence } from './identity.ts'
import type { Decision } from './judgments.ts'
import type { SessionEntry } from './entries.ts'
import { encodeEntry } from './entries.ts'
import {
  decimal,
  equalValue,
  evidenceFields,
  invalidAt,
  nonempty,
  unavailableAt,
} from './session-validation.ts'

type AssignmentChange = Extract<DeclarationChange, { kind: 'permission-assignment' }>
type AssignmentEntry = Extract<SessionEntry, { kind: 'session.permission-assigned' }>

function fields(change: AssignmentChange): void {
  if (change.kind !== 'permission-assignment')
    invalidAt('declaration.kind', 'expected permission-assignment')
  nonempty(change.capabilityId, 'declaration.capabilityId')
  nonempty(change.enforcementKey, 'declaration.enforcementKey')
  decimal(change.expectedRevision, 'declaration.expectedRevision')
  evidenceFields(change.authorization, 'declaration.authorization')
  if (!PermissionDefinitionRefSchema.safeParse(change.definition).success)
    invalidAt('declaration.definition', 'invalid permission definition reference')
  if (change.rule !== null && !PermissionRuleSchema.safeParse(change.rule).success)
    invalidAt('declaration.rule', 'invalid permission rule')
}

function current(snapshot: WorkSnapshot): SessionPermissions {
  if (snapshot.permissions === undefined) unavailableAt('permissions')
  return snapshot.permissions
}

function matches(item: SessionPermissionAssignmentKey, change: SessionPermissionAssignmentKey) {
  return item.capabilityId === change.capabilityId && item.enforcementKey === change.enforcementKey
}
type SessionPermissionAssignmentKey = Pick<AssignmentChange, 'capabilityId' | 'enforcementKey'>

function definitionHolds(change: AssignmentChange, basis: SessionPermissionChangeBasis): boolean {
  const parsed = definePermission(basis.definition)
  if (parsed.kind !== 'defined') return false
  const definition = parsed.definition
  if (
    !matches(definition, change) ||
    !equalValue(definition.reference, change.definition) ||
    !definition.assignmentLayers.includes('session')
  )
    return false
  const rule = change.rule
  if (rule === null) return true
  const ids = new Set(definition.values.map(value => value.id))
  return (
    (rule.pick === null || ids.has(rule.pick)) &&
    (rule.allowedSet === null ||
      (new Set(rule.allowedSet).size === rule.allowedSet.length &&
        rule.allowedSet.every(value => ids.has(value))))
  )
}

function assignmentSupported(
  state: SessionPermissions,
  change: AssignmentChange,
  basis: SessionPermissionChangeBasis,
): boolean {
  const stored = state.assignments.find(item => matches(item, change))
  if (change.rule === null && stored !== undefined)
    return equalValue(stored.definition, change.definition)
  return definitionHolds(change, basis)
}

export function decidePermissionAssignment(
  input: Readonly<{
    snapshot: WorkSnapshot
    change: AssignmentChange
    operation: SessionOperationId
    commandDigest: string
    basis: SessionPermissionChangeBasis | undefined
    source: DurableEvidence
  }>,
): Decision {
  const { snapshot, change, basis } = input
  if (
    basis === undefined ||
    basis.operation !== input.operation ||
    basis.commandDigest !== input.commandDigest
  )
    return { kind: 'rejected', failure: { kind: 'denied', action: 'change' } }
  fields(change)
  evidenceFields(basis.authority, 'permissionChange.authority')
  const state = current(snapshot)
  if (change.expectedRevision !== state.revision || basis.revision !== state.revision)
    return { kind: 'rejected', failure: { kind: 'changed', revision: snapshot.revision } }
  if (!assignmentSupported(state, change, basis))
    return {
      kind: 'rejected',
      failure: {
        kind: 'invalid',
        field: 'declaration',
        reason: 'unsupported permission assignment',
      },
    }
  const revision = String(decimal(state.revision, 'permissions.revision') + 1n)
  return {
    kind: 'entries',
    entries: [
      encodeEntry(
        {
          kind: 'session.permission-assigned',
          declaration: change,
          previousRevision: state.revision,
          revision,
          authority: basis.authority,
        },
        { owner: 'session', via: 'direct', source: input.source },
      ),
    ],
  }
}

function applyPermissionAssignment(
  state: SessionPermissions,
  entry: AssignmentEntry,
  source: DurableEvidence,
): SessionPermissions {
  fields(entry.declaration)
  evidenceFields(entry.authority, 'permissionChange.authority')
  if (
    entry.previousRevision !== state.revision ||
    entry.declaration.expectedRevision !== state.revision ||
    decimal(entry.revision, 'permissions.revision') !==
      decimal(state.revision, 'permissions.revision') + 1n
  )
    invalidAt('permissions.revision', 'assignment does not follow the current revision')
  const { rule, capabilityId, enforcementKey, definition } = entry.declaration
  const remaining = state.assignments.filter(item => !matches(item, entry.declaration))
  return {
    revision: entry.revision,
    assignments:
      rule === null
        ? remaining
        : [...remaining, { capabilityId, enforcementKey, definition, rule, source }],
  }
}

export function applyPermissionEvent(
  state: SessionPermissions,
  entry: SessionEntry,
  source: DurableEvidence,
): SessionPermissions {
  if (entry.kind === 'session.permission-assigned')
    return applyPermissionAssignment(state, entry, source)
  if (!('declaration' in entry)) return state
  if (entry.declaration.kind === 'permission-assignment')
    invalidAt('entry.kind', 'permission assignment requires its dedicated event')
  if (entry.declaration.kind !== 'permission-mode') return state
  if (entry.kind !== 'session.mode-changed')
    invalidAt('entry.kind', 'permission mode requires its dedicated event')
  if (state === undefined) unavailableAt('permissions')
  return { ...state, revision: String(decimal(state.revision, 'permissions.revision') + 1n) }
}
