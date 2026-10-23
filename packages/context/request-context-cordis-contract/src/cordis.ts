import { Service, type Context } from '@deepseek-ai/cordis'
import type {
  AssemblyOperations,
  AssemblyPorts,
  CompactionPolicy,
  PromptContributionRegistry,
  RepresentationPolicyConfig,
  ScopeRef,
} from '@omne-harness/request-context-contract'

/** Scope is an assembly declaration, not an access grant. */
export type RequestContextIntercept = Readonly<{ scope: ScopeRef | null }>
export type AssemblyAccess<P> =
  | Readonly<{ kind: 'operations'; operations: AssemblyOperations<P> }>
  | Readonly<{ kind: 'unavailable'; reason: 'closed' }>

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
  /** Binds this call's ports. Each operation reads the current registered contributions. */
  abstract assembly(scope: ScopeRef, ports: AssemblyPorts<P>): AssemblyAccess<P>
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
