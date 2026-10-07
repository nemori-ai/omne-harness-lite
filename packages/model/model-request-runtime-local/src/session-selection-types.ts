import type { SessionSelectModelResult } from '@omne-harness-lite/model-request-runtime'
import type { EffectiveAssembly } from '@omne-harness-lite/asset-evaluation'

import type {
  EffectiveModel,
  DisplayListResult,
  LegalTargetsResult,
  SelectionFailure,
} from '@omne-harness-lite/model-request-runtime'

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
