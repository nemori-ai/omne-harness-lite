import { Context, Service } from '@deepseek-ai/cordis'
import {
  assemble,
  planCompaction,
  deriveStep,
  resume,
  type AssemblyInput,
  type AssemblyPorts,
  type AssemblyPolicies,
  type ContributionResult,
  type ContributionsResult,
  type PromptContribution,
  type PromptContributionRegistry,
  type ScopeRef,
} from '@omne-harness/request-context-contract'
import {
  createScriptedCompactionPolicy,
  createScriptedRepresentationPolicy,
} from '@omne-harness/request-context-contract/testing'
import {
  RequestContextService,
  type AssemblyAccess,
  type RequestContextIntercept,
} from '@omne-harness/request-context-cordis-contract/cordis'
let generations = 0
/** A non-production provider used only to validate the Cordis definition's promises. */
export class ProbeProvider extends RequestContextService<unknown> {
  readonly durability = 'none'
  readonly generation = String(++generations)
  readonly listenerErrors: unknown[] = []
  private closed = false
  private readonly layers = new Map<string | null, Map<string, PromptContribution>>()
  private readonly revisions = new Map<string | null, number>()
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
  private register(
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
    return this.register(input)
  }
  contributeVariable(
    ...[input]: Parameters<PromptContributionRegistry['contributeVariable']>
  ): ContributionResult {
    if (input.volatility === 'per-request')
      return { kind: 'rejected', reason: 'per-request-variable', name: input.name }
    return this.register(input)
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
  assembly(scope: ScopeRef, ports: AssemblyPorts<unknown>): AssemblyAccess<unknown> {
    if (this.closed) return { kind: 'unavailable', reason: 'closed' }
    const prepare = (input: AssemblyInput<unknown>) => {
      if (this.closed)
        return {
          kind: 'unavailable' as const,
          owner: 'instance' as const,
          diagnostic: 'Provider is closed',
        }
      if (input.promptContributions !== null)
        return {
          kind: 'invalid' as const,
          field: 'promptContributions',
          reason: 'contributions-not-accepted' as const,
        }
      if (input.history.scope.ref !== scope.ref || input.assembleContext.scope.ref !== scope.ref)
        return { kind: 'invalid' as const, field: 'scope', reason: 'scope-mismatch' as const }
      const contributions = this.contributions(scope)
      return contributions.kind === 'current'
        ? { kind: 'input' as const, value: { ...input, promptContributions: contributions.set } }
        : {
            kind: 'unavailable' as const,
            owner: 'instance' as const,
            diagnostic: 'Registry is closed',
          }
    }
    return {
      kind: 'operations',
      operations: {
        assemble: async input => {
          const value = prepare(input)
          return value.kind === 'input' ? assemble(value.value, ports, this.policies) : value
        },
        planCompaction: async input => {
          const value = prepare(input)
          return value.kind === 'input' ? planCompaction(value.value, ports, this.policies) : value
        },
        deriveStep: input => deriveStep(input, ports, this.policies),
        resume: async input => {
          const value = prepare(input)
          return value.kind === 'input'
            ? resume({ ...value.value, transition: input.transition }, ports, this.policies)
            : value
        },
      },
    }
  }
}
