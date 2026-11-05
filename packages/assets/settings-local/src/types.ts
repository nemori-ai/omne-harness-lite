import type { z } from 'zod'
import type { SettingsCommitPort, SettingsFailure, SettingsTarget } from '@omne-harness/settings'
import type { DomainRef, FactCommandV2, SqlStorage, StorageScope } from '@omne-harness/sql-contract'
import type {
  accessGrantSchema,
  Binding,
  GuardFact,
  OperationBinding,
  stateResultSchema,
} from './schema.ts'

export type SettingsSqlGuardBinding = Binding
export type SettingsSqlGuardFact = GuardFact
export type SettingsSqlOperationBinding = OperationBinding
export type SettingsSqlAccessRequest = Readonly<{
  scope: StorageScope
  target: SettingsTarget
  action: 'commit' | 'readState' | 'getOperation' | 'readChanges'
}>
export type SettingsSqlAccessGrant = z.infer<typeof accessGrantSchema>
export interface SettingsSqlAccess<Context> {
  authorize(
    context: Context,
    request: SettingsSqlAccessRequest,
  ): Promise<SettingsSqlAccessGrant | SettingsFailure>
}
export type SettingsSqlGuards = Readonly<{
  participant: string
  command(binding: SettingsSqlGuardBinding): FactCommandV2
}>
export type SettingsSqlOptions<Context> = Readonly<{
  storage: SqlStorage
  domain: DomainRef
  combinationVersion: string
  manifestDigest: string
  access: SettingsSqlAccess<Context>
  guards: SettingsSqlGuards
}>
export type SettingsSqlStateResult = z.infer<typeof stateResultSchema>
export interface SettingsSqlBackend<Context> extends SettingsCommitPort<Context> {
  readState(context: Context, target: SettingsTarget): Promise<SettingsSqlStateResult>
  /** Stop admission and drain accepted calls. The caller owns the shared SqlStorage lifetime. */
  close(): Promise<void>
}
