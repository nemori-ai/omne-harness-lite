import { Service, type Context } from '@deepseek-ai/cordis'
import { createContextAccounting, createContextSourceRegistry } from '@omne-harness/request-context'
import {
  decodeGroupToken,
  type AssemblyOperations,
  type ContextAccountingInbox,
  type ContextSourceRegistry,
  type ContextSources,
  type ContextTarget,
  type ContributionResult,
  type ContributionsResult,
  type PromptContribution,
  type PromptContributionRegistry,
  type RegistrationRef,
  type RegistrationResult,
  type ScopeRef,
} from '@omne-harness/request-context-contract'
import {
  ContextAccountingInboxService,
  RequestContextService,
  requestContextTrustKey,
  type RequestContextIntercept,
} from '@omne-harness/request-context-cordis-contract/cordis'
import {
  requestContextProviderConfig,
  selectPolicies,
  type RequestContextProviderOptions,
} from './config.ts'

export type { RequestContextProviderOptions } from './config.ts'

/** The accounting inbox, provided by the same plugin fiber as `requestContext`. */
class AccountingInboxProvider extends ContextAccountingInboxService<unknown> {
  private readonly inbox: ContextAccountingInbox<unknown>
  constructor(ctx: Context, inbox: ContextAccountingInbox<unknown>) {
    super(ctx)
    this.inbox = inbox
  }
  receive(...args: Parameters<ContextAccountingInbox<unknown>['receive']>) {
    return this.inbox.receive(...args)
  }
  usage(...args: Parameters<ContextAccountingInbox<unknown>['usage']>) {
    return this.inbox.usage(...args)
  }
}

/**
 * The Request Context provider. It needs the trust key: the principal binding and the registration
 * authority come from the trusted subtree, the plugin never builds them. With the key absent the
 * plugin stays pending and provides neither key.
 */
export class RequestContextProvider extends RequestContextService<unknown> {
  static readonly inject = [requestContextTrustKey]
  /** Checked before the constructor runs; a configuration that does not fit fails the load. */
  static readonly Config = requestContextProviderConfig
  readonly generation: string
  private static generations = 0
  private closed = false
  private readonly registry: ContextSourceRegistry<unknown>
  private readonly targets = new Map<RegistrationRef, ContextTarget>()
  private readonly layers = new Map<string | null, Map<string, PromptContribution>>()
  private readonly revisions = new Map<string | null, number>()
  readonly listenerErrors: unknown[] = []
  /** The result of closing the registry when the fiber is disposed. */
  settled: Promise<unknown> = Promise.resolve()

  constructor(ctx: Context, options: RequestContextProviderOptions) {
    super(ctx)
    this.generation = String(++RequestContextProvider.generations)
    const trust = ctx.requestContextTrust
    this.registry = createContextSourceRegistry<unknown>({
      principalBinding: trust.principalBinding,
      registrationAuthority: trust.registrationAuthority,
      policies: selectPolicies(options),
    })
    // Same ctx, hence the same fiber: both keys live and end together.
    new AccountingInboxProvider(ctx, createContextAccounting(options.accounting).inbox)
    ctx.effect(() => () => {
      this.closed = true
      this.settled = this.registry.close()
    })
  }

  scopeConfig(): Partial<RequestContextIntercept> {
    return this[Service.resolveConfig]()
  }

  private changed(scope: ScopeRef | null) {
    const key = scope?.ref ?? null
    const revision = (this.revisions.get(key) ?? 0) + 1
    this.revisions.set(key, revision)
    // Listener failure must not undo an already registered contribution.
    try {
      this.ctx.emit(
        'request-context-cordis-contract/changed',
        scope,
        String(revision),
        this.generation,
      )
    } catch (error) {
      this.listenerErrors.push(error)
    }
  }
  private add(
    input:
      | Parameters<PromptContributionRegistry['contributeSection']>[0]
      | Parameters<PromptContributionRegistry['contributeVariable']>[0],
  ): ContributionResult {
    const config = this.scopeConfig()
    if (this.closed) return { kind: 'rejected', reason: 'closed', name: input.name }
    if (!Object.hasOwn(config, 'scope') || config.scope === undefined)
      return { kind: 'rejected', reason: 'no-scope', name: input.name }
    const scope = config.scope
    const key = scope?.ref ?? null
    const layer = this.layers.get(key) ?? new Map<string, PromptContribution>()
    if (layer.has(input.name))
      return { kind: 'rejected', reason: 'duplicate-name', name: input.name }
    const revision = String((this.revisions.get(key) ?? 0) + 1)
    const contribution = { ...input, scope, revision }
    const dispose = this.ctx.effect(() => {
      this.layers.set(key, layer)
      layer.set(input.name, contribution)
      this.changed(scope)
      return () => {
        if (layer.get(input.name) === contribution) {
          layer.delete(input.name)
          this.changed(scope)
        }
      }
    })
    return { kind: 'registered', name: input.name, scope, revision, dispose }
  }
  contributeSection(
    ...[input]: Parameters<PromptContributionRegistry['contributeSection']>
  ): ContributionResult {
    const config = this.scopeConfig()
    if (config.scope === undefined)
      return { kind: 'rejected', reason: 'no-scope', name: input.name }
    const current = this.contributions(config.scope)
    if (current.kind === 'rejected') return { kind: 'rejected', reason: 'closed', name: input.name }
    for (const name of input.uses) {
      const variable = current.set.contributions.find(item => item.name === name)
      if (variable?.kind !== 'variable')
        return { kind: 'rejected', reason: 'unknown-variable', name: input.name }
      if (variable.volatility === 'per-request')
        return { kind: 'rejected', reason: 'per-request-variable', name: input.name }
    }
    return this.add(input)
  }
  contributeVariable(
    ...[input]: Parameters<PromptContributionRegistry['contributeVariable']>
  ): ContributionResult {
    if (input.volatility === 'per-request')
      return { kind: 'rejected', reason: 'per-request-variable', name: input.name }
    return this.add(input)
  }
  contributions(scope: ScopeRef | null): ContributionsResult {
    if (this.closed) return { kind: 'rejected', reason: 'closed' }
    const global = this.layers.get(null) ?? new Map<string, PromptContribution>()
    const local = scope === null ? [] : [...(this.layers.get(scope.ref)?.values() ?? [])]
    const merged = new Map([...global.values(), ...local].map(item => [item.name, item]))
    return {
      kind: 'current',
      set: {
        contributions: [...merged.values()],
        generation: this.generation,
        digest: JSON.stringify([
          this.revisions.get(null) ?? 0,
          scope === null ? null : (this.revisions.get(scope.ref) ?? 0),
        ]),
      },
    }
  }

  /** The fourth group is read from the registration face, not from the registered source set. */
  private live(sources: ContextSources<unknown>, scope: ScopeRef): ContextSources<unknown> {
    const prompt = sources.groups.prompt
    return {
      ...sources,
      groups: {
        ...sources.groups,
        prompt: {
          readCount: async call => {
            const count = await prompt.readCount(call)
            if (count.kind !== 'value') return count
            const set = this.contributions(scope)
            if (set.kind !== 'current')
              return { kind: 'unavailable', diagnostic: 'Registry is closed' }
            const token = decodeGroupToken(`${count.value}_${set.set.generation}_${set.set.digest}`)
            return 'failure' in token
              ? { kind: 'unavailable', diagnostic: 'Prompt token' }
              : { kind: 'value', value: token.ok }
          },
          readSource: async call => {
            const value = await prompt.readSource(call)
            if (value.kind !== 'value') return value
            const set = this.contributions(scope)
            if (set.kind !== 'current')
              return { kind: 'unavailable', diagnostic: 'Registry is closed' }
            return { kind: 'value', value: { ...value.value, promptContributions: set.set } }
          },
        },
      },
    }
  }

  /** Registration is an effect of the caller's fiber: unloading that fiber withdraws the set. */
  private bind(result: RegistrationResult, target: ContextTarget): RegistrationResult {
    if (result.kind !== 'registered') return result
    this.targets.set(result.handle.ref, target)
    const handle = result.handle
    const dispose = this.ctx.effect(() => () => {
      handle.withdraw()
    })
    return {
      kind: 'registered',
      handle: {
        ref: handle.ref,
        generation: handle.generation,
        withdraw() {
          dispose()
          return handle.withdraw()
        },
      },
    }
  }
  async register(
    ...[input]: Parameters<ContextSourceRegistry<unknown>['register']>
  ): Promise<RegistrationResult> {
    if (this.closed) return { kind: 'unavailable', diagnostic: 'Provider is closed' }
    const scope = input?.target?.scope
    const sources = scope === undefined ? input.sources : this.live(input.sources, scope)
    return this.bind(await this.registry.register({ ...input, sources }), input.target)
  }
  async replace(
    ...[input]: Parameters<ContextSourceRegistry<unknown>['replace']>
  ): Promise<RegistrationResult> {
    if (this.closed) return { kind: 'unavailable', diagnostic: 'Provider is closed' }
    const target = this.targets.get(input?.expected)
    // A reference this provider never issued is passed on and answered as a conflict.
    const sources = target === undefined ? input.sources : this.live(input.sources, target.scope)
    const result = await this.registry.replace({ ...input, sources })
    return target === undefined ? result : this.bind(result, target)
  }
  assembly(target: ContextTarget): AssemblyOperations<unknown> {
    return this.registry.assembly(target)
  }
}
