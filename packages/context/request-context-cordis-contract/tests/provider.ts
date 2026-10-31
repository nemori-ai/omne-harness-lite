import { Context, Service } from '@deepseek-ai/cordis'
import { tenantEquals } from '@omne-harness/legal-identity'
import {
  createAssemblyOperations,
  decodeGroupToken,
  decodeRegistrationRef,
  decodeSourceGeneration,
  type AssemblyOperations,
  type AssemblyPolicies,
  type ContextRegistration,
  type ContextSourceRegistry,
  type ContextSources,
  type ContextTarget,
  type ContributionResult,
  type ContributionsResult,
  type PromptContribution,
  type PromptContributionRegistry,
  type RegistrationResult,
  type ScopeRef,
} from '@omne-harness/request-context-contract'
import {
  createScriptedCompactionPolicy,
  createScriptedRepresentationPolicy,
  createTestingPrincipalBinding,
} from '@omne-harness/request-context-contract/testing'
import {
  RequestContextService,
  type RequestContextIntercept,
} from '@omne-harness/request-context-cordis-contract/cordis'
type SourceSet = {
  readonly target: ContextTarget
  readonly sources: ContextSources<unknown>
  readonly handle: ContextRegistration
  withdrawn: boolean
}
let generations = 0
/** A non-production provider used only to validate the Cordis definition's promises. */
export class ProbeProvider extends RequestContextService<unknown> {
  readonly durability = 'none'
  readonly generation = String(++generations)
  readonly listenerErrors: unknown[] = []
  private closed = false
  private readonly layers = new Map<string | null, Map<string, PromptContribution>>()
  private readonly revisions = new Map<string | null, number>()
  private readonly sourceSets: SourceSet[] = []
  private registrations = 0
  private readonly policies: AssemblyPolicies = {
    compaction: createScriptedCompactionPolicy(),
    representation: createScriptedRepresentationPolicy(),
  }
  constructor(ctx: Context) {
    super(ctx)
    ctx.effect(() => () => {
      this.closed = true
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
    const scope = config.scope,
      key = scope?.ref ?? null
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
      if (variable?.kind === 'variable' && variable.volatility === 'per-request')
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
  private current(target: ContextTarget): SourceSet | undefined {
    return this.sourceSets.find(
      item =>
        !item.withdrawn &&
        item.target.scope.ref === target.scope.ref &&
        tenantEquals(item.target.tenant, target.tenant),
    )
  }
  /** Publishes one source set on the caller's fiber; unloading that fiber withdraws it. */
  private publish(target: ContextTarget, sources: ContextSources<unknown>): RegistrationResult {
    const n = ++this.registrations
    const ref = decodeRegistrationRef(`registration_${n}`)
    const generation = decodeSourceGeneration(`generation_${n}`)
    if ('failure' in ref || 'failure' in generation) throw new Error('Probe identity')
    let receipt: ReturnType<ContextRegistration['withdraw']> | null = null
    let set: SourceSet | null = null
    const dispose = this.ctx.effect(() => {
      return () => {
        if (set !== null) set.withdrawn = true
      }
    })
    const handle: ContextRegistration = {
      ref: ref.ok,
      generation: generation.ok,
      withdraw() {
        receipt ??=
          (dispose(), { kind: 'withdrawn', settled: Promise.resolve({ kind: 'settled' }) })
        return receipt
      },
    }
    set = { target, sources, handle, withdrawn: false }
    this.sourceSets.push(set)
    return { kind: 'registered', handle }
  }
  async register(
    ...[input]: Parameters<ContextSourceRegistry<unknown>['register']>
  ): Promise<RegistrationResult> {
    if (this.closed) return { kind: 'unavailable', diagnostic: 'Provider is closed' }
    if (input.access === null || input.access === undefined)
      return { kind: 'invalid', field: 'access', reason: 'missing-access' }
    if (this.current(input.target) !== undefined) return { kind: 'conflict' }
    return this.publish(input.target, input.sources)
  }
  async replace(
    ...[input]: Parameters<ContextSourceRegistry<unknown>['replace']>
  ): Promise<RegistrationResult> {
    if (this.closed) return { kind: 'unavailable', diagnostic: 'Provider is closed' }
    const previous = this.sourceSets.find(
      item => !item.withdrawn && item.handle.ref === input.expected,
    )
    if (previous === undefined) return { kind: 'conflict' }
    previous.withdrawn = true
    return this.publish(previous.target, input.sources)
  }
  /** The fourth group read from the registration face, not from the registered source set. */
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
  assembly(target: ContextTarget): AssemblyOperations<unknown> {
    const run = async <R>(
      operate: (operations: AssemblyOperations<unknown>) => Promise<R>,
    ): Promise<
      R | Readonly<{ kind: 'unavailable'; owner: 'source-registry'; diagnostic: string }>
    > => {
      const set = this.closed ? undefined : this.current(target)
      if (set === undefined)
        return {
          kind: 'unavailable',
          owner: 'source-registry',
          diagnostic: 'No source set is registered',
        }
      const result = await operate(
        createAssemblyOperations({
          target,
          sources: this.live(set.sources, target.scope),
          principalBinding: createTestingPrincipalBinding<unknown>(),
          policies: this.policies,
        }),
      )
      return set.withdrawn || this.closed
        ? {
            kind: 'unavailable',
            owner: 'source-registry',
            diagnostic: 'Withdrawn during the operation',
          }
        : result
    }
    return {
      assemble: call => run(o => o.assemble(call)),
      planCompaction: call => run(o => o.planCompaction(call)),
      deriveStep: input => run(o => o.deriveStep(input)),
      resume: call => run(o => o.resume(call)),
    }
  }
}
