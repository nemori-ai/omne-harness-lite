import type { EffectiveAssembly } from '@omne-harness-lite/asset-evaluation'
import type { EffectiveModel, DisplayListResult, LegalTargetsResult } from './selection-types.ts'
import type { CurrentEvaluationInputs } from '@omne-harness-lite/asset-evaluation'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { RouteName } from '@omne-harness-lite/model-profile'
import type { ModelCatalogRead } from '@omne-harness-lite/model-profile-directory'
import type { SessionTenancyService } from '@omne-harness-lite/session-tenancy'
import type { SettlementPrefix } from './settlement-prefix.ts'
import type { SettlementLogBinding, SettlementOwner } from './settlement-types.ts'
import type {
  SelectionCompatibility,
  SelectionFailure,
  SelectionProjection,
} from './selection-types.ts'

/** The host supplies authenticated admission and genuine scoped providers; shapes prove neither. */
export interface SessionModelSelectionInput {
  readonly binding: SettlementLogBinding
  readonly owner: SettlementOwner
  readonly concurrent: JsonNumber
  readonly sessionTenancy: SessionTenancyService
  readonly catalog: Pick<ModelCatalogRead, 'listProfiles' | 'credentialPresent'>
  readonly currentEvaluationInputs: CurrentEvaluationInputs
  /** Interpret the actual complete prefix using the adopted projection implementation. */
  readonly projection: (prefix: SettlementPrefix) => Promise<SelectionProjection>
  readonly compatible: SelectionCompatibility
  readonly now: () => Promise<string>
  readonly diagnostic: (event: SessionSelectionDiagnostic) => void
  readonly onDiagnosticFailure: () => void
}

export interface SessionSelectionDiagnostic {
  readonly kind: 'session_model_selection'
  readonly session: SettlementLogBinding['session']
  readonly tenant: SettlementLogBinding['tenant']
  readonly stage: 'legalTargets' | 'selectModel' | 'displayList' | 'effectiveModel' | 'close'
  readonly outcome: 'success' | 'unavailable' | 'rejected'
}

export type SessionSelectModelResult =
  | { readonly selected: RouteName }
  | SelectionFailure
  | { readonly profileNotFound: true }
  | {
      readonly notLegalTarget: {
        readonly because: readonly ['withdrawn' | 'scope_disallowed' | 'modality_mismatch']
      }
    }

/** Evaluation is the actual current AE4 result, including root limits; no dispatch defaults. */
export type SessionEffectiveModelResult =
  | { readonly ok: EffectiveModel; readonly evaluation: EffectiveAssembly }
  | SelectionFailure
  | { readonly profileNotFound: true }

export interface SessionModelSelection {
  readonly legalTargets: () => Promise<LegalTargetsResult>
  readonly selectModel: (routeName: unknown) => Promise<SessionSelectModelResult>
  readonly displayList: () => Promise<DisplayListResult>
  readonly effectiveModel: () => Promise<SessionEffectiveModelResult>
  /** Unconfirmed original writes retain their registrations and borrowed dependencies. */
  readonly close: () => Promise<{ readonly released: true } | { readonly unavailable: true }>
}

export type SessionModelSelectionFactory = (
  input: SessionModelSelectionInput,
) => SessionModelSelection
