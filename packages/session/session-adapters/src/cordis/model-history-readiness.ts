import type { StepDirectory } from './working-directory-step.ts'
import { Service, type Context } from '@deepseek-ai/cordis'
import type { Failure } from '@omne-harness/agent-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type { ModelViewBasis, SessionAccess } from '@omne-harness/session-contract'

/** Settle model reminders and return the exact history basis on which the required bodies were visible. */
export type EnsureModelHistory<P> = (
  input: SessionAccess<P> & Readonly<{ scope: ScopeRef }>,
) => Promise<Outcome<ModelViewBasis | null, Failure>>

export const sessionModelHistoryReadinessKey = 'sessionModelHistoryReadiness'
declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionModelHistoryReadiness: SessionModelHistoryReadiness
  }
}

export class SessionModelHistoryReadiness extends Service {
  readonly ensure: EnsureModelHistory<unknown>
  readonly qualify: NonNullable<StepDirectory<unknown>['inspectHistory']>
  constructor(
    ctx: Context,
    ensure: EnsureModelHistory<unknown>,
    qualify: NonNullable<StepDirectory<unknown>['inspectHistory']>,
  ) {
    super(ctx, sessionModelHistoryReadinessKey)
    this.ensure = ensure
    this.qualify = qualify
  }
}
