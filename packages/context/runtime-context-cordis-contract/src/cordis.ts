import { type Context, Service } from '@deepseek-ai/cordis'
import type {
  ConsumerClass,
  ContextBlockKey,
  RuntimeContextOperations,
  ScopeRef,
  ViewRevision,
} from '@omne-harness/runtime-context-contract'

type Operation<P, O extends keyof RuntimeContextOperations<P>> = {
  args: Parameters<RuntimeContextOperations<P>[O]>
  result: ReturnType<RuntimeContextOperations<P>[O]>
}
// Preserve the root operation's key generic without restating its input/result shape.
declare const operations: RuntimeContextOperations
type ProducerOperation<K extends ContextBlockKey> = {
  args: Parameters<typeof operations.registerProducer<K>>
  result: ReturnType<typeof operations.registerProducer<K>>
}

export type RuntimeContextIntercept = Readonly<{ consumer: ConsumerClass }>

/** @owner packages/context/runtime-context-contract */
export abstract class RuntimeContextService<P = unknown>
  extends Service<RuntimeContextIntercept>
  implements RuntimeContextOperations<P>
{
  static readonly provide = 'runtimeContext'
  constructor(ctx: Context) {
    super(ctx, RuntimeContextService.provide)
  }
  /** The provider registers its disposer through this.ctx.effect on the calling producer fiber. */
  abstract registerProducer<K extends ContextBlockKey>(
    ...args: ProducerOperation<K>['args']
  ): ProducerOperation<K>['result']
  abstract prepareRegistration(
    ...args: Operation<P, 'prepareRegistration'>['args']
  ): Operation<P, 'prepareRegistration'>['result']
  abstract issueEligibility(
    ...args: Operation<P, 'issueEligibility'>['args']
  ): Operation<P, 'issueEligibility'>['result']
  abstract revokeEligibility(
    ...args: Operation<P, 'revokeEligibility'>['args']
  ): Operation<P, 'revokeEligibility'>['result']
  abstract applyCommit(
    ...args: Operation<P, 'applyCommit'>['args']
  ): Operation<P, 'applyCommit'>['result']
  /** The provider compares caller intercept consumer with the current eligibility consumer. */
  abstract bind(...args: Operation<P, 'bind'>['args']): Operation<P, 'bind'>['result']
}
export const runtimeContextKey = RuntimeContextService.provide
export const runtimeContextScopeKey: 'scope' = 'scope'
/** An explanatory payload shape. The event transmits its fields as two positional arguments. */
export type RuntimeContextChangedPayload = Readonly<{ scope: ScopeRef; revision: ViewRevision }>

declare module '@deepseek-ai/cordis' {
  interface Context {
    runtimeContext: RuntimeContextService<unknown>
    [runtimeContextScopeKey]?: ScopeRef
  }
  interface Events {
    /**
     * Wake-up only. Read facts through a bound reader. Listeners are synchronous.
     * @mode emit
     * @param scope the scope whose projection changed
     * @param revision the resulting view revision
     */
    'runtime-context-cordis-contract/changed'(scope: ScopeRef, revision: ViewRevision): void
  }
}
