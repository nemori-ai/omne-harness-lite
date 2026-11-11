import type { z } from 'zod'
import type {
  StandingRequest,
  StandingReserveOutcome,
  StandingSettleOutcome,
} from '@omne-harness/identity'
import type {
  SettingsFailure,
  SettingsPreparationPort,
  SettingsRebase,
  SettingsPrepareResult,
} from '@omne-harness/settings'
import type { DomainRef, FactCommandV2, SqlStorage } from '@omne-harness/sql-contract'
import type { SettingsSqlAccessGrant } from './types.ts'
import type { IntentIdentity, IntentCommand } from './intent-schema.ts'
import type { SettingsAttemptBinding } from './attempt-binding.ts'
import type { preparationPlanSchema } from './preparation-observation.ts'
import type { SourceRequest } from './source-retention-schema.ts'
import type { SourceCustodyRecord } from './source-custody-schema.ts'
export type PreparationPlan = z.infer<typeof preparationPlanSchema>
export type PreparationPhase = 'checkpoint' | 'ready' | 'commit' | 'recovery'
export type PreparationRegistration = Readonly<{
  combinationVersion: string
  manifestDigest: string
}>
export type SettingsPreparationOptions<Context> = Readonly<{
  storage: SqlStorage
  domain: DomainRef
  destination: string
  registrations: Readonly<Record<PreparationPhase, PreparationRegistration>>
  access: {
    authorize(
      context: Context,
      request: {
        scope: DomainRef['scope']
        target: IntentIdentity['operation']['target']
        action: 'prepare' | 'commit' | 'cancel' | 'query' | 'readChanges' | 'maintenance'
      },
    ): Promise<SettingsSqlAccessGrant | SettingsFailure>
  }
  plan(
    context: Context,
    input: { identity: IntentIdentity; intent: IntentCommand },
  ): Promise<PreparationPlan | SettingsFailure>
  currentCommands(
    context: Context,
    input: { phase: 'ready' | 'commit'; binding: SettingsAttemptBinding },
  ): readonly FactCommandV2[]
  standing: {
    reserve(context: Context, request: StandingRequest): Promise<StandingReserveOutcome>
    settle(request: StandingRequest): Promise<StandingSettleOutcome>
  }
  sources: {
    reserve(
      context: Context,
      request: SourceRequest,
    ): Promise<SourceCustodyRecord['receipt'] | SettingsFailure>
    settle(request: SourceRequest): Promise<SourceCustodyRecord['receipt'] | SettingsFailure>
  }
}>
export interface SettingsPreparationService<Context> extends SettingsPreparationPort<Context> {
  prepareRebase(context: Context, command: SettingsRebase): Promise<SettingsPrepareResult>
}
