import { Service, type Context } from '@deepseek-ai/cordis'
import type {
  AssemblyOperations,
  CompactionPolicy,
  ContextSourceRegistry,
  ContextTarget,
  PromptContributionRegistry,
  RepresentationPolicyConfig,
  ScopeRef,
} from '@omne-harness/request-context-contract'

/** Scope is an assembly declaration, not an access grant. */
export type RequestContextIntercept = Readonly<{ scope: ScopeRef | null }>

/** Provider selection contains serializable configuration, never runtime ports. */
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
  /** Registration is an effect of the caller's fiber, implemented by the provider. */
  abstract contributeSection(
    ...args: Parameters<PromptContributionRegistry['contributeSection']>
  ): ReturnType<PromptContributionRegistry['contributeSection']>
  abstract contributeVariable(
    ...args: Parameters<PromptContributionRegistry['contributeVariable']>
  ): ReturnType<PromptContributionRegistry['contributeVariable']>
  abstract contributions(
    ...args: Parameters<PromptContributionRegistry['contributions']>
  ): ReturnType<PromptContributionRegistry['contributions']>
  /** Registers the source set of one target; an effect of the caller's fiber (RQ-12). */
  abstract register(
    ...args: Parameters<ContextSourceRegistry<P>['register']>
  ): ReturnType<ContextSourceRegistry<P>['register']>
  /** Replaces the current source set of one target in one local step (RQ-12). */
  abstract replace(
    ...args: Parameters<ContextSourceRegistry<P>['replace']>
  ): ReturnType<ContextSourceRegistry<P>['replace']>
  /**
   * The configured operation group of one target. Each operation borrows the source set
   * registered now and reads the current registered contributions; none registered is unavailable.
   */
  abstract assembly(target: ContextTarget): AssemblyOperations<P>
}

export const requestContextKey = RequestContextService.provide
export type RequestContextChangedPayload = Readonly<{
  scope: ScopeRef | null
  layerRevision: string
  registryGeneration: string
}>

declare module '@deepseek-ai/cordis' {
  interface Context {
    requestContext: RequestContextService<unknown>
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
