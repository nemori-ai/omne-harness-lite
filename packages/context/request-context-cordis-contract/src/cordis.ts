import { Service, type Context } from '@deepseek-ai/cordis'
import type {
  AssemblyOperations,
  ContextAccountingInbox,
  CompactionPolicy,
  ContextSourceRegistry,
  ContextTarget,
  PromptContributionRegistry,
  RepresentationPolicyConfig,
  ScopeRef,
} from '@omne-harness/request-context-contract'
import type { ContextHolderSources } from './holder-sources.js'
import type { RequestContextTrust } from './trust.js'

export type RequestContextIntercept = Readonly<{ scope: ScopeRef | null }>

export type RequestContextPolicySelection = Readonly<{
  compaction: Readonly<{ implementation: string; config: CompactionPolicy }>
  representation: Readonly<{ implementation: string; config: RepresentationPolicyConfig }>
}>

/** @owner packages/context/request-context-contract */
export abstract class RequestContextService<P>
  extends Service<RequestContextIntercept>
  implements PromptContributionRegistry
{
  static readonly provide = 'requestContext'
  constructor(ctx: Context) {
    super(ctx, RequestContextService.provide)
  }
  abstract contributeSection(
    ...args: Parameters<PromptContributionRegistry['contributeSection']>
  ): ReturnType<PromptContributionRegistry['contributeSection']>
  abstract contributeVariable(
    ...args: Parameters<PromptContributionRegistry['contributeVariable']>
  ): ReturnType<PromptContributionRegistry['contributeVariable']>
  abstract contributions(
    ...args: Parameters<PromptContributionRegistry['contributions']>
  ): ReturnType<PromptContributionRegistry['contributions']>
  abstract register(
    ...args: Parameters<ContextSourceRegistry<P>['register']>
  ): ReturnType<ContextSourceRegistry<P>['register']>
  abstract replace(
    ...args: Parameters<ContextSourceRegistry<P>['replace']>
  ): ReturnType<ContextSourceRegistry<P>['replace']>
  abstract assembly(target: ContextTarget): AssemblyOperations<P>
}

export const requestContextKey = RequestContextService.provide

export abstract class RequestContextTrustService<P>
  extends Service
  implements RequestContextTrust<P>
{
  static readonly provide = 'requestContextTrust'
  constructor(ctx: Context) {
    super(ctx, RequestContextTrustService.provide)
  }
  abstract readonly principalBinding: RequestContextTrust<P>['principalBinding']
  abstract readonly registrationAuthority: RequestContextTrust<P>['registrationAuthority']
}
export const requestContextTrustKey = RequestContextTrustService.provide

export abstract class ContextAccountingInboxService<P>
  extends Service
  implements ContextAccountingInbox<P>
{
  static readonly provide = 'contextAccountingInbox'
  constructor(ctx: Context) {
    super(ctx, ContextAccountingInboxService.provide)
  }
  abstract receive(
    ...args: Parameters<ContextAccountingInbox<P>['receive']>
  ): ReturnType<ContextAccountingInbox<P>['receive']>
  abstract usage(
    ...args: Parameters<ContextAccountingInbox<P>['usage']>
  ): ReturnType<ContextAccountingInbox<P>['usage']>
}
export const contextAccountingInboxKey = ContextAccountingInboxService.provide

/**
 * The parts that a source holder lends to the borrower that registers source sets. The holder
 * provides a subclass. A lease is an effect of the borrower's fiber: that fiber unloading ends the
 * lease like `release`, and the holder then calls the settlement function of the lease. The key is
 * a delivery path, not access control: every call of a part checks the access of that call.
 * @owner packages/context/request-context-cordis-contract
 */
export abstract class ContextHolderSourcesService<P>
  extends Service
  implements ContextHolderSources<P>
{
  static readonly provide = 'contextHolderSources'
  constructor(ctx: Context) {
    super(ctx, ContextHolderSourcesService.provide)
  }
  abstract lease(
    ...args: Parameters<ContextHolderSources<P>['lease']>
  ): ReturnType<ContextHolderSources<P>['lease']>
}
export const contextHolderSourcesKey = ContextHolderSourcesService.provide
export type RequestContextChangedPayload = Readonly<{
  scope: ScopeRef | null
  layerRevision: string
  registryGeneration: string
}>

declare module '@deepseek-ai/cordis' {
  interface Context {
    requestContext: RequestContextService<unknown>
    requestContextTrust: RequestContextTrustService<unknown>
    contextAccountingInbox: ContextAccountingInboxService<unknown>
    contextHolderSources: ContextHolderSourcesService<unknown>
  }
  interface Events {
    /**
     * Invalidation hint; carries no contribution content.
     * @mode emit
     * @param scope Changed layer; null means the global layer.
     * @param layerRevision New revision of this layer.
     * @param registryGeneration Identity of this registry instance generation.
     */
    'request-context-cordis-contract/changed'(
      scope: ScopeRef | null,
      layerRevision: string,
      registryGeneration: string,
    ): void
  }
}
