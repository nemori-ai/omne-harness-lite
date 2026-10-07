import type { MessageId } from '@omne-harness-lite/messages'
import type { AttemptId, RunId } from '@omne-harness-lite/call-accounts'
import type { ModelProfileRef } from '@omne-harness-lite/model-profile'
import type { CredentialScope, SelectedBy } from '@omne-harness-lite/model-response'

import type {
  InvocationInput,
  PlanInput,
  PlannedSemantics,
  TransportAdapter,
  InvocationPolicy,
} from '@omne-harness-lite/model-request-runtime'
import type { SettlementCoordinatorInput } from './settlement-types.ts'

export interface AnchoredInvocationInput<P extends PlannedSemantics, R> {
  /** Actual operation fence; this original dispatch identity is never inferred from recovery. */
  readonly run?: RunId
  readonly attempt?: AttemptId
  readonly planInput: PlanInput
  readonly transport: TransportAdapter<P, R>
  readonly reuseScope?: object
  /** Dynamic consumers retain their exact lease for the entire planning task. */
  readonly trackPlan?: <T>(task: Promise<T>) => Promise<T>
  readonly credential: string
  readonly policy: InvocationPolicy
  readonly signal: AbortSignal
  readonly responseId: string
  readonly messageId: MessageId
  readonly profile: ModelProfileRef
  readonly selectedBy: SelectedBy
  readonly credentialScope: CredentialScope
  /** The host establishes actual authorization, log ownership and generation. */
  readonly settlement: SettlementCoordinatorInput
  readonly onAccepted?: InvocationInput<P, R>['onAccepted']
  readonly diagnosticEmitterFactory?: InvocationInput<P, R>['diagnosticEmitterFactory']
  /** Return the actual borrowed transport/credential references, only after stopped and settled. */
  readonly releaseBorrowed?: () => Promise<void>
}
