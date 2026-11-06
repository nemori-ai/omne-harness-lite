import type {
  SettingsChange,
  SettingsDefinitionRef,
  SettingsState,
  SettingsTarget,
} from './commands.ts'
import type { SettingDefinitions } from './schema.ts'

export type SettingsFailure = Readonly<{
  kind: 'rejected'
  reason:
    | 'invalid_input'
    | 'limit_exceeded'
    | 'forbidden'
    | 'unavailable'
    | 'basis_changed'
    | 'revision_conflict'
    | 'definition_changed'
    | 'locked'
    | 'incompatible'
    | 'unsupported'
    | 'operation_conflict'
    | 'closing'
}>
export type SettingsGrant = Readonly<{
  sourceId: string
  actions: readonly ('set' | 'clear' | 'lock' | 'unlock')[]
}>
export type SettingsTargetView = Readonly<{
  target: SettingsTarget
  enabled: boolean
  definitionRef: SettingsDefinitionRef
  definition: SettingDefinitions
  state: SettingsState
  grants: readonly SettingsGrant[]
}>
export type SettingsViewRequest = Readonly<{
  deploymentRef: string
  mode: 'management' | 'runtime'
  targets: readonly SettingsTarget[]
  selectionRef: string | null
}>
export type SettingsBasis = Readonly<{
  scopeKey: string
  revision: string
  views: readonly SettingsTargetView[]
  completeness: 'complete' | 'partial'
  unavailableProviders: readonly string[]
}>
export interface SettingsReadPort<Context> {
  /** Read a coherent authorized projection; recheck access even for a repeated request. */
  read(context: Context, request: SettingsViewRequest): Promise<SettingsBasis | SettingsFailure>
}
export type SettingsOperation = Readonly<{
  kind: 'committed'
  operationId: string
  revision: number
  changed: boolean
}>
export type SettingsCommitResult =
  | SettingsOperation
  | SettingsFailure
  | Readonly<{ kind: 'unknown'; operationId: string }>
export type SettingsOperationResult = SettingsCommitResult | Readonly<{ kind: 'not_found' }>
export type SettingsChangePage = Readonly<{
  kind: 'changes'
  changes: readonly (
    | Readonly<{
        kind: 'value'
        revision: number
        operationId: string
        itemId: string
        sourceId: string
      }>
    | Readonly<{ kind: 'rebase'; revision: number; operationId: string }>
  )[]
  nextRevision: number | null
}>
export interface SettingsCommitPort<Context> {
  /** Recheck target, authorization, definition and revision in the same commit as all durable facts. */
  commit(context: Context, command: SettingsChange): Promise<SettingsCommitResult>
  getOperation(
    context: Context,
    input: Readonly<{ target: SettingsTarget; operationId: string }>,
  ): Promise<SettingsOperationResult>
  readChanges(
    context: Context,
    input: Readonly<{ target: SettingsTarget; afterRevision: number; limit: number }>,
  ): Promise<SettingsChangePage | SettingsFailure>
}
