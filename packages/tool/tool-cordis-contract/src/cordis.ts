// The Cordis service definitions of Tool: abstract Services, the service keys, the
// `tool-cordis-contract/call-changed` and `binding-changed` events and the instance directory.
// Provider plugins live in `@omne-harness/tool-host-local/cordis`. This entry does not import a
// Tool implementation.
import { type Context, Service } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, type Outcome } from '@omne-harness/operation-result'
import type { Access, TenantId } from '@omne-harness/legal-identity'
import {
  type DurableEvidence,
  type SourceLayer,
  type ToolCallId,
  type ToolCatalog,
  type ToolDirectory,
  type ToolRevision,
  type ToolRuntime,
} from '@omne-harness/tool-contract'
import {
  describedAdoption,
  type ResultPolicy,
  type ToolAccounts,
  type ToolAuthority,
  type ToolBindingKey,
  type ToolBindingRegistry,
  type ToolBindingScope,
  type ToolBindings,
  type ToolChildren,
  type ToolClock,
  type ToolCommands,
  type ToolDecisionBridge,
  type ToolEnvironment,
  type ToolInstanceHost,
  type ToolLoader,
  type ToolOffloader,
  type ToolOutputCustody,
  type ToolReads,
  type ToolResourceResponses,
  type ToolStartAuthority,
} from '@omne-harness/tool-contract/provider'

/** @owner packages/tool/tool-cordis-contract */
export abstract class ToolRuntimeService<P, B extends ContentBlock>
  extends Service
  implements ToolRuntime<P, B>
{
  static readonly provide = 'toolRuntime'
  constructor(ctx: Context) {
    super(ctx, ToolRuntimeService.provide)
  }
  abstract readonly invoke: ToolRuntime<P, B>['invoke']
  abstract readonly inspect: ToolRuntime<P, B>['inspect']
  abstract readonly queries: ToolRuntime<P, B>['queries']
  abstract readonly commands: ToolRuntime<P, B>['commands']
  abstract readonly instances: ToolRuntime<P, B>['instances']
  abstract readonly content: ToolRuntime<P, B>['content']
  abstract readonly catalog: ToolRuntime<P, B>['catalog']
}
export const toolRuntimeKey = ToolRuntimeService.provide

/** @owner packages/tool/tool-cordis-contract */
export abstract class ToolCommandsService<P, B extends ContentBlock>
  extends Service
  implements ToolCommands<P, B>
{
  static readonly provide = 'toolCommands'
  constructor(ctx: Context) {
    super(ctx, ToolCommandsService.provide)
  }
  abstract readonly admit: ToolCommands<P, B>['admit']
  abstract readonly control: ToolCommands<P, B>['control']
  abstract readonly acceptDecision: ToolCommands<P, B>['acceptDecision']
  abstract readonly acceptResource: ToolCommands<P, B>['acceptResource']
  abstract readonly releaseDelivery: ToolCommands<P, B>['releaseDelivery']
  abstract readonly scanPending: ToolCommands<P, B>['scanPending']
  abstract readonly loadRecovery: ToolCommands<P, B>['loadRecovery']
  abstract readonly claim: ToolCommands<P, B>['claim']
  abstract readonly planPreparation: ToolCommands<P, B>['planPreparation']
  abstract readonly prepared: ToolCommands<P, B>['prepared']
  abstract readonly enqueue: ToolCommands<P, B>['enqueue']
  abstract readonly prepareStart: ToolCommands<P, B>['prepareStart']
  abstract readonly prepareResume: ToolCommands<P, B>['prepareResume']
  abstract readonly rejectPending: ToolCommands<P, B>['rejectPending']
  abstract readonly recordStart: ToolCommands<P, B>['recordStart']
  abstract readonly preserveProcess: ToolCommands<P, B>['preserveProcess']
  abstract readonly openWait: ToolCommands<P, B>['openWait']
  abstract readonly attachRegistration: ToolCommands<P, B>['attachRegistration']
  abstract readonly attachResource: ToolCommands<P, B>['attachResource']
  abstract readonly planSuspension: ToolCommands<P, B>['planSuspension']
  abstract readonly suspend: ToolCommands<P, B>['suspend']
  abstract readonly preserveResult: ToolCommands<P, B>['preserveResult']
  abstract readonly recordResponse: ToolCommands<P, B>['recordResponse']
  abstract readonly closeWait: ToolCommands<P, B>['closeWait']
  abstract readonly recordControl: ToolCommands<P, B>['recordControl']
  abstract readonly receiveFacts: ToolCommands<P, B>['receiveFacts']
  abstract readonly recordFactAcknowledgement: ToolCommands<P, B>['recordFactAcknowledgement']
  abstract readonly recordScheduling: ToolCommands<P, B>['recordScheduling']
  abstract readonly recordAccount: ToolCommands<P, B>['recordAccount']
  abstract readonly planRelease: ToolCommands<P, B>['planRelease']
  abstract readonly recordRelease: ToolCommands<P, B>['recordRelease']
  abstract readonly recordLateFact: ToolCommands<P, B>['recordLateFact']
  abstract readonly recordLateResult: ToolCommands<P, B>['recordLateResult']
  abstract readonly settleLost: ToolCommands<P, B>['settleLost']
  abstract readonly recordTask: ToolCommands<P, B>['recordTask']
}
export const toolCommandsKey = ToolCommandsService.provide

/** @owner packages/tool/tool-cordis-contract */
export abstract class ToolBindingsService<P, B extends ContentBlock, E>
  extends Service
  implements ToolBindings<P, B, E>, ToolBindingRegistry<P, E, B>
{
  static readonly provide = 'toolBindings'
  constructor(ctx: Context) {
    super(ctx, ToolBindingsService.provide)
  }
  abstract readonly inspect: ToolBindings<P, B, E>['inspect']
  abstract readonly resolve: ToolBindings<P, B, E>['resolve']
  abstract readonly recover: ToolBindings<P, B, E>['recover']
  abstract readonly register: ToolBindingRegistry<P, E, B>['register']
  abstract readonly snapshot: ToolBindingRegistry<P, E, B>['snapshot']
  abstract readonly pins: ToolBindingRegistry<P, E, B>['pins']
  abstract readonly close: ToolBindingRegistry<P, E, B>['close']
  abstract readonly reopen: ToolBindingRegistry<P, E, B>['reopen']
  abstract readonly drain: ToolBindingRegistry<P, E, B>['drain']
}
export const toolBindingsKey = ToolBindingsService.provide

/** The authority after the origin check: the same four fields, now trusted for the layer (G7). */
export type VerifiedAuthority = ToolAuthority
export type ToolAuthorityFailure =
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'invalid'; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
/**
 * The synchronous origin check of a contribution (G7). `verify` gives the source layer from the
 * authority, never from the registrant; `admits` checks that the registrant may register at that
 * layer. Both are consulted inside the registering effect, so neither yields.
 */
export interface ToolContributionAuthority<P> {
  verify(authority: ToolAuthority): Outcome<VerifiedAuthority, ToolAuthorityFailure>
  admits(
    access: Access<P>,
    layer: SourceLayer,
  ): Outcome<void, Exclude<ToolAuthorityFailure, { kind: 'invalid' }>>
}

/** @owner packages/tool/tool-cordis-contract */
export abstract class ToolContributionAuthorityService<P>
  extends Service
  implements ToolContributionAuthority<P>
{
  static readonly provide = 'toolContributionAuthority'
  constructor(ctx: Context) {
    super(ctx, ToolContributionAuthorityService.provide)
  }
  abstract readonly verify: ToolContributionAuthority<P>['verify']
  abstract readonly admits: ToolContributionAuthority<P>['admits']
}
export const toolContributionAuthorityKey = ToolContributionAuthorityService.provide

/**
 * Why `ensureLoaded` did not load. `missing` and `rejected` are durable failures and carry the
 * evidence the coordinator minted for the adoption-point judgment; `unavailable` is temporary;
 * `denied` and `invalid` come from the origin check; `conflict` says another contribution holds
 * the key; `draining` says the same key is draining and is not recognised.
 */
export type ToolLoadFailure =
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'invalid'; reason: string }>
  | Readonly<{ kind: 'missing'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'rejected'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'draining' }>
export type ToolLoadState = Readonly<{ key: ToolBindingKey; state: 'loaded' | 'recognized' }>
/** Where `unload` stands: kept for referencing sessions, still draining, or released. */
export type ToolUnloadState = Readonly<{ state: 'retained' | 'draining' | 'released' }>
export type ToolSweepReport = Readonly<{
  reloaded: readonly ToolBindingKey[]
  unloaded: readonly ToolBindingKey[]
}>
export type ToolGenerationsFailure =
  | Readonly<{ kind: 'unknown-key' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
/**
 * The generation coordinator (G7): the only holder of the `ctx.plugin` handles of author plugins.
 * Each verb converges on its target state and may be repeated. `ensureLoaded` is called by the
 * assembly coordinator with the tenant's access, or by `sweep` with the system scope; `unload` and
 * `sweep` are system-scope operations. `loaderFor` gives the author plugin the trusted loader of
 * its authority. The contract is in docs/cordis.md「换代协调者契约」.
 */
export interface ToolGenerations<P, E, B extends ContentBlock> {
  ensureLoaded(
    input: Readonly<{ authority: ToolAuthority; access: ToolBindingScope<P> }>,
  ): Promise<Outcome<ToolLoadState, ToolLoadFailure>>
  unload(
    input: Readonly<{ key: ToolBindingKey }>,
  ): Promise<Outcome<ToolUnloadState, ToolGenerationsFailure>>
  sweep(): Promise<
    Outcome<ToolSweepReport, Extract<ToolGenerationsFailure, { kind: 'unavailable' }>>
  >
  loaderFor(authority: ToolAuthority): ToolLoader<P, E, B>
}

/** @owner packages/tool/tool-cordis-contract */
export abstract class ToolGenerationsService<P, E, B extends ContentBlock>
  extends Service
  implements ToolGenerations<P, E, B>
{
  static readonly provide = 'toolGenerations'
  constructor(ctx: Context) {
    super(ctx, ToolGenerationsService.provide)
  }
  abstract readonly ensureLoaded: ToolGenerations<P, E, B>['ensureLoaded']
  abstract readonly unload: ToolGenerations<P, E, B>['unload']
  abstract readonly sweep: ToolGenerations<P, E, B>['sweep']
  abstract readonly loaderFor: ToolGenerations<P, E, B>['loaderFor']
}
export const toolGenerationsKey = ToolGenerationsService.provide

/** @owner packages/tool/tool-cordis-contract */
export abstract class ToolEnvironmentService<P, E>
  extends Service
  implements ToolEnvironment<P, E>
{
  static readonly provide = 'toolEnvironments'
  constructor(ctx: Context) {
    super(ctx, ToolEnvironmentService.provide)
  }
  abstract readonly prepare: ToolEnvironment<P, E>['prepare']
  abstract readonly inspectPreparation: ToolEnvironment<P, E>['inspectPreparation']
  abstract readonly release: ToolEnvironment<P, E>['release']
  abstract readonly inspectRelease: ToolEnvironment<P, E>['inspectRelease']
}
export const toolEnvironmentsKey = ToolEnvironmentService.provide

/** @owner packages/tool/tool-cordis-contract */
export abstract class ToolDecisionBridgeService<P>
  extends Service
  implements ToolDecisionBridge<P>
{
  static readonly provide = 'toolDecisions'
  constructor(ctx: Context) {
    super(ctx, ToolDecisionBridgeService.provide)
  }
  abstract readonly inspectOperation: ToolDecisionBridge<P>['inspectOperation']
  abstract readonly ensure: ToolDecisionBridge<P>['ensure']
  abstract readonly inspect: ToolDecisionBridge<P>['inspect']
  abstract readonly invalidate: ToolDecisionBridge<P>['invalidate']
  abstract readonly resolve: ToolDecisionBridge<P>['resolve']
}
export const toolDecisionsKey = ToolDecisionBridgeService.provide

/** What a successful `ToolInstanceHost.publish` returns. Registration reuses it as the receipt. */
export type ToolPublication = Extract<
  Awaited<ReturnType<ToolInstanceHost<never>['publish']>>,
  { ok: unknown }
>['ok']
export type ToolRegistrationInput<P> = Readonly<{
  publication: Parameters<ToolInstanceHost<P>['publish']>
  authority: DurableEvidence
}>
export type ToolRegistrationFailure =
  | Readonly<{ kind: 'denied' | 'stale-publication' | 'conflict' }>
  | Readonly<{ kind: 'invalid'; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
export type ToolRegistration = Readonly<{
  receipt: ToolPublication
  release(): Promise<Readonly<{ removed: boolean }>>
}>
export interface ToolPublicationAuthority<P> {
  check(input: ToolRegistrationInput<P>): Outcome<void, ToolRegistrationFailure>
}

/** @owner packages/tool/tool-cordis-contract */
export abstract class ToolPublicationAuthorityService<P>
  extends Service
  implements ToolPublicationAuthority<P>
{
  static readonly provide = 'toolPublicationAuthority'
  constructor(ctx: Context) {
    super(ctx, ToolPublicationAuthorityService.provide)
  }
  abstract readonly check: ToolPublicationAuthority<P>['check']
}
export const toolPublicationAuthorityKey = ToolPublicationAuthorityService.provide

const directoryNotImplemented =
  'toolInstances register and connect are not implemented until the instance directory increment'
const directoryAdoption = describedAdoption({
  owner: '@omne-harness/tool-cordis-contract',
  name: 'toolInstances',
  revision: '0',
})

/**
 * The instance directory. It is a concrete registry Service (IC-3). Registration and lookup
 * arrive with the instance directory increment. Until then `connect` replies `unsupported` and `register` replies
 * `unavailable`, because `ToolRegistrationFailure` has no `unsupported` variant. Neither
 * method throws or reports success.
 *
 * @owner packages/tool/tool-cordis-contract
 */
export class ToolInstancesService<P> extends Service implements ToolDirectory<P> {
  static readonly provide = 'toolInstances'
  constructor(ctx: Context, _authority: ToolPublicationAuthority<P>) {
    super(ctx, ToolInstancesService.provide)
  }
  readonly connect: ToolDirectory<P>['connect'] = async () =>
    fail({ kind: 'unsupported', adoption: directoryAdoption, reason: directoryNotImplemented })
  async register(
    _input: ToolRegistrationInput<P>,
  ): Promise<Outcome<ToolRegistration, ToolRegistrationFailure>> {
    return fail({ kind: 'unavailable', diagnostic: directoryNotImplemented })
  }
}
export const toolInstancesKey = ToolInstancesService.provide

/** @owner packages/tool/tool-cordis-contract */
export abstract class ToolInstanceHostService<P> extends Service implements ToolInstanceHost<P> {
  static readonly provide = 'toolInstanceHost'
  constructor(ctx: Context) {
    super(ctx, ToolInstanceHostService.provide)
  }
  abstract readonly install: ToolInstanceHost<P>['install']
  abstract readonly schedule: ToolInstanceHost<P>['schedule']
  abstract readonly publish: ToolInstanceHost<P>['publish']
  abstract readonly withdraw: ToolInstanceHost<P>['withdraw']
  abstract readonly directory: ToolInstanceHost<P>['directory']
}
export const toolInstanceHostKey = ToolInstanceHostService.provide

/** @owner packages/tool/tool-cordis-contract */
export abstract class ToolClockService extends Service implements ToolClock {
  static readonly provide = 'toolClock'
  constructor(ctx: Context) {
    super(ctx, ToolClockService.provide)
  }
  abstract readonly now: ToolClock['now']
  abstract readonly begin: ToolClock['begin']
  abstract readonly elapsed: ToolClock['elapsed']
  abstract readonly waitUntil: ToolClock['waitUntil']
}
export const toolClockKey = ToolClockService.provide

/** @owner packages/tool/tool-cordis-contract */
export abstract class ResultPolicyService<B extends ContentBlock>
  extends Service
  implements ResultPolicy<B>
{
  static readonly provide = 'toolResultPolicy'
  constructor(ctx: Context) {
    super(ctx, ResultPolicyService.provide)
  }
  abstract readonly adoption: ResultPolicy<B>['adoption']
  abstract readonly judge: ResultPolicy<B>['judge']
  abstract readonly judgeResult: ResultPolicy<B>['judgeResult']
}
export const toolResultPolicyKey = ResultPolicyService.provide

/** @owner packages/tool/tool-cordis-contract */
export abstract class ToolReadsService<P, B extends ContentBlock>
  extends Service
  implements ToolReads<P, B>
{
  static readonly provide = 'toolReads'
  constructor(ctx: Context) {
    super(ctx, ToolReadsService.provide)
  }
  abstract readonly lookup: ToolReads<P, B>['lookup']
  abstract readonly operation: ToolReads<P, B>['operation']
  abstract readonly result: ToolReads<P, B>['result']
  abstract readonly process: ToolReads<P, B>['process']
  abstract readonly wait: ToolReads<P, B>['wait']
  abstract readonly diagnostics: ToolReads<P, B>['diagnostics']
  abstract readonly account: ToolReads<P, B>['account']
  abstract readonly content: ToolReads<P, B>['content']
}
export const toolReadsKey = ToolReadsService.provide

/** @owner packages/tool/tool-cordis-contract */
export abstract class ToolCatalogService<P> extends Service implements ToolCatalog<P> {
  static readonly provide = 'toolCatalog'
  constructor(ctx: Context) {
    super(ctx, ToolCatalogService.provide)
  }
  abstract readonly inspect: ToolCatalog<P>['inspect']
  abstract readonly usage: ToolCatalog<P>['usage']
  abstract readonly search: ToolCatalog<P>['search']
}
export const toolCatalogKey = ToolCatalogService.provide

/** @owner packages/tool/tool-cordis-contract */
export abstract class ToolStartAuthorityService<P>
  extends Service
  implements ToolStartAuthority<P>
{
  static readonly provide = 'toolStartAuthority'
  constructor(ctx: Context) {
    super(ctx, ToolStartAuthorityService.provide)
  }
  abstract readonly exclude: ToolStartAuthority<P>['exclude']
  abstract readonly prepare: ToolStartAuthority<P>['prepare']
  abstract readonly consume: ToolStartAuthority<P>['consume']
  abstract readonly inspect: ToolStartAuthority<P>['inspect']
  abstract readonly invalidate: ToolStartAuthority<P>['invalidate']
}
export const toolStartAuthorityKey = ToolStartAuthorityService.provide

/** @owner packages/tool/tool-cordis-contract */
export abstract class ToolResourceResponsesService<P>
  extends Service
  implements ToolResourceResponses<P>
{
  static readonly provide = 'toolResourceResponses'
  constructor(ctx: Context) {
    super(ctx, ToolResourceResponsesService.provide)
  }
  abstract readonly inspectOperation: ToolResourceResponses<P>['inspectOperation']
  abstract readonly ensure: ToolResourceResponses<P>['ensure']
  abstract readonly inspect: ToolResourceResponses<P>['inspect']
  abstract readonly expire: ToolResourceResponses<P>['expire']
  abstract readonly invalidate: ToolResourceResponses<P>['invalidate']
  abstract readonly resolve: ToolResourceResponses<P>['resolve']
}
export const toolResourceResponsesKey = ToolResourceResponsesService.provide

/** @owner packages/tool/tool-cordis-contract */
export abstract class ToolOutputCustodyService<P> extends Service implements ToolOutputCustody<P> {
  static readonly provide = 'toolOutputCustody'
  constructor(ctx: Context) {
    super(ctx, ToolOutputCustodyService.provide)
  }
  abstract readonly preserve: ToolOutputCustody<P>['preserve']
  abstract readonly inspect: ToolOutputCustody<P>['inspect']
  abstract readonly retainResult: ToolOutputCustody<P>['retainResult']
}
export const toolOutputCustodyKey = ToolOutputCustodyService.provide

/** @owner packages/tool/tool-cordis-contract */
export abstract class ToolChildrenService<P> extends Service implements ToolChildren<P> {
  static readonly provide = 'toolChildren'
  constructor(ctx: Context) {
    super(ctx, ToolChildrenService.provide)
  }
  abstract readonly reserve: ToolChildren<P>['reserve']
  abstract readonly admitted: ToolChildren<P>['admitted']
  abstract readonly retain: ToolChildren<P>['retain']
  abstract readonly list: ToolChildren<P>['list']
  abstract readonly close: ToolChildren<P>['close']
  abstract readonly closure: ToolChildren<P>['closure']
  abstract readonly confirmBarrier: ToolChildren<P>['confirmBarrier']
  abstract readonly finish: ToolChildren<P>['finish']
}
export const toolChildrenKey = ToolChildrenService.provide

/** @owner packages/tool/tool-cordis-contract */
export abstract class ToolAccountsService<P> extends Service implements ToolAccounts<P> {
  static readonly provide = 'toolAccounts'
  constructor(ctx: Context) {
    super(ctx, ToolAccountsService.provide)
  }
  abstract readonly list: ToolAccounts<P>['list']
}
export const toolAccountsKey = ToolAccountsService.provide

/** @owner packages/tool/tool-cordis-contract */
export abstract class ToolOffloaderService<P, B extends ContentBlock>
  extends Service
  implements ToolOffloader<P, B>
{
  static readonly provide = 'toolOffloader'
  constructor(ctx: Context) {
    super(ctx, ToolOffloaderService.provide)
  }
  abstract readonly offload: ToolOffloader<P, B>['offload']
}
export const toolOffloaderKey = ToolOffloaderService.provide

declare module '@deepseek-ai/cordis' {
  // The trusted identity adapter of an assembly narrows the principal type. Providers still
  // check every input at run time.
  interface Context {
    toolRuntime: ToolRuntimeService<unknown, ContentBlock>
    toolCommands: ToolCommandsService<unknown, ContentBlock>
    toolBindings: ToolBindingsService<unknown, ContentBlock, unknown>
    toolContributionAuthority: ToolContributionAuthorityService<unknown>
    toolGenerations: ToolGenerationsService<unknown, unknown, ContentBlock>
    toolEnvironments: ToolEnvironmentService<unknown, unknown>
    toolDecisions: ToolDecisionBridgeService<unknown>
    toolInstances: ToolInstancesService<unknown>
    toolPublicationAuthority: ToolPublicationAuthorityService<unknown>
    toolInstanceHost: ToolInstanceHostService<unknown>
    toolClock: ToolClockService
    toolResultPolicy: ResultPolicyService<ContentBlock>
    toolReads: ToolReadsService<unknown, ContentBlock>
    toolCatalog: ToolCatalogService<unknown>
    toolStartAuthority: ToolStartAuthorityService<unknown>
    toolResourceResponses: ToolResourceResponsesService<unknown>
    toolOutputCustody: ToolOutputCustodyService<unknown>
    toolChildren: ToolChildrenService<unknown>
    toolAccounts: ToolAccountsService<unknown>
    toolOffloader: ToolOffloaderService<unknown, ContentBlock>
  }
  interface Events {
    /**
     * A committed change of one Tool call. The payload has identities only. It has no message
     * text, credentials or attachment addresses. The sender catches listener failures and keeps
     * the original commit result. A missed notification is recovered by the authoritative scan.
     *
     * @mode parallel
     * @param tenant - the tenant that owns the call.
     * @param call - the call that changed.
     * @param revision - the call revision after the change.
     */
    'tool-cordis-contract/call-changed'(
      tenant: TenantId,
      call: ToolCallId,
      revision: ToolRevision,
    ): void
    /**
     * A committed change of one binding-registry entry (G7). The payload is the binding key and
     * the kind of change. It has no body, credentials or module path. The sender catches listener
     * failures and keeps the registration result. A missed notification is recovered at the next
     * adoption point by reading `snapshot(scope)` with the tenant's access.
     *
     * @mode parallel
     * @param key - the binding key: source layer, capability identity and asset version.
     * @param change - `registered`, `draining` or `released`.
     */
    'tool-cordis-contract/binding-changed'(
      key: ToolBindingKey,
      change: 'registered' | 'draining' | 'released',
    ): void
  }
}
