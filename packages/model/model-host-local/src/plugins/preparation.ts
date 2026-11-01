// MD-15 and MD-14: the request preparation plugin and the metering leases of the same host.
//
// The plugin serves `modelRequestPreparation`. It needs `modelCommands` and nothing else of the
// system: no `modelRuntime` and no network. Both of its jobs run over the one `ModelCommands` that
// the host plugin injects, so a lease that continues an earlier call reads that call's facts.
// - `prepare` takes a lease for the profile, plans each supplier with the rules of its binding,
//   gives the lease back and returns the fixed request. It never measures and never sends.
// - The same lease source, `createModelPreparationResources`, is what the request assembler
//   meters with. It is not a service key (R1-D17 Q-8): the assembly takes `resources` from the
//   creator of the plugin and hands it to the request assembly.
//
// A lease belongs to the live plugin. Once the plugin is gone, no new lease is given and `prepare`
// answers unavailable; a lease taken before keeps its bindings until it is released.
import type { Context } from '@deepseek-ai/cordis'
import {
  organizationEquals,
  tenantCodec,
  tenantEquals,
  type TenantId,
} from '@omne-harness/legal-identity'
import {
  createModelPreparationResources,
  type PreparationBindingSource,
  type SupplierPort,
} from '@omne-harness/model'
import type {
  FixedModelRequest,
  ModalityRequirement,
  ModelFailure,
  ModelPreparationLease,
  ModelPreparationResources,
  ModelProfile,
  ParameterAdoption,
  ProfileScope,
  ReplayDeclaration,
  Reply,
} from '@omne-harness/model-contract'
import {
  judgeFixedModelRequest,
  judgeReplayDeclaration,
  type ModelRequestPreparation,
} from '@omne-harness/model-contract/provider'
import {
  ModelRequestPreparationService,
  modelCommandsKey,
} from '@omne-harness/model-cordis-contract/cordis'
import { modelPreparationConfigSchema, type ModelPreparationSettings } from './config.ts'

const DEPENDENCY = 'model-request-preparation'

const PLUGIN_GONE: ModelFailure = Object.freeze({
  kind: 'unavailable',
  dependency: DEPENDENCY,
  diagnostic: 'preparation-plugin-unloaded',
})

type PrepareInput = Parameters<ModelRequestPreparation<unknown>['prepare']>[0]
type Failed = { failure: ModelFailure }

function scopeFailure(scope: ProfileScope, tenant: TenantId): ModelFailure | null {
  switch (scope.kind) {
    case 'factory':
      return null
    case 'organization':
      return organizationEquals(scope.organization, tenant.organization)
        ? null
        : { kind: 'denied', action: 'prepare' }
    case 'tenant':
      return tenantEquals(scope.tenant, tenant) ? null : { kind: 'denied', action: 'prepare' }
  }
}

function covers(profile: ModelProfile, required: ModalityRequirement): boolean {
  const input: readonly string[] = profile.definition.input
  return required.modalities.every(modality => input.includes(modality))
}

/** The profile must apply to the tenant, be active, and take every modality the input needs. */
function qualify(input: PrepareInput): ModelFailure | null {
  if (!tenantCodec.encode(input.tenant).ok) return { kind: 'denied', action: 'tenant' }
  const scope = scopeFailure(input.profile.identity.scope, input.tenant)
  if (scope !== null) return scope
  if (input.profile.availability === 'withdrawn')
    return { kind: 'invalid', field: 'profile', reason: 'withdrawn' }
  if (!covers(input.profile, input.required))
    return { kind: 'invalid', field: 'required.modalities', reason: 'modality' }
  return null
}

/** The replay declarations of the profile suppliers, in order, by the contract judge. */
function declarationsOf(
  suppliers: ModelProfile['definition']['suppliers'],
): { ok: readonly [ReplayDeclaration, ...ReplayDeclaration[]] } | Failed {
  const [head, ...rest] = suppliers
  const first = judgeReplayDeclaration(head, 0)
  if (!('ok' in first)) return first
  const more: ReplayDeclaration[] = []
  for (const [offset, supplier] of rest.entries()) {
    const declared = judgeReplayDeclaration(supplier, offset + 1)
    if (!('ok' in declared)) return declared
    more.push(declared.ok)
  }
  return { ok: [first.ok, ...more] }
}

/**
 * The fixed request of this call: the lease binds the suppliers (each with its credential
 * reference) and plans their parameters; the assembled input fills the rest.
 */
function requestOf(
  input: PrepareInput,
  lease: ModelPreparationLease,
): { ok: FixedModelRequest } | Failed {
  const { profile, assembled } = input
  const adoptions: ParameterAdoption[] = []
  for (const binding of lease.bindings) {
    const planned = binding.rules.plan({ profile, supplier: binding.supplier, assembled })
    if (!('ok' in planned)) return planned
    adoptions.push(...planned.ok.parameters)
  }
  const declarations = declarationsOf(profile.definition.suppliers)
  if (!('ok' in declarations)) return declarations
  const judged = judgeFixedModelRequest({
    profile: profile.adoption,
    suppliers: lease.bindings.map(binding => binding.supplier),
    fallback: profile.definition.fallback,
    retryPolicy: profile.definition.retryPolicy,
    parameters: assembled.parameters,
    system: assembled.system,
    messages: assembled.messages,
    tools: assembled.tools,
    toolChoice: assembled.toolChoice,
    ...(assembled.replay === 'off' && { replay: 'off' }),
    declarations: declarations.ok,
    representation: assembled.representation,
    parameterAdoptions: adoptions,
    source: assembled.source,
  })
  if ('ok' in judged) return judged
  return {
    failure: { kind: 'invalid', field: judged.failure.field, reason: judged.failure.reason },
  }
}

/** What the plugin needs besides `modelCommands` and its configuration: objects, not data. */
export type ModelPreparationPluginOptions = Readonly<{
  /** Where leases take the family bindings (rules and meter) from. No network is involved. */
  bindings: PreparationBindingSource
  /** Completes a profile supplier with its credential reference, as `prepare` does. */
  supplierOf: SupplierPort<unknown>
}>

export type ModelRequestPreparationPluginClass = {
  new (ctx: Context, settings: ModelPreparationSettings): ModelRequestPreparationService<unknown>
  readonly inject: string[]
  readonly Config: typeof modelPreparationConfigSchema
}

export type ModelPreparationPlugin = Readonly<{
  /** The plugin class. Cordis gives it `modelCommands` and the configuration. */
  plugin: ModelRequestPreparationPluginClass
  /**
   * The leases of the live plugin, for the assembly to give to the request assembly. Before the
   * plugin is loaded and after it is unloaded `acquire` answers unavailable.
   */
  resources: ModelPreparationResources<unknown>
}>

function createPluginClass(
  options: ModelPreparationPluginOptions,
  live: { current: ModelPreparationResources<unknown> | null },
): ModelRequestPreparationPluginClass {
  const leases = gate(live)

  async function prepareOver(input: PrepareInput): Reply<FixedModelRequest> {
    const refused = qualify(input)
    if (refused !== null) return { failure: refused }
    const leased = await leases.acquire({
      principal: input.principal,
      tenant: input.tenant,
      profile: input.profile,
    })
    if (!('ok' in leased)) return leased
    let formed: { ok: FixedModelRequest } | Failed
    try {
      formed = requestOf(input, leased.ok)
    } catch (error) {
      // A throwing rule is a program defect. The lease is still given back before it surfaces.
      await leased.ok.release()
      throw error
    }
    // The algorithm lease ends with the request. A release that failed is the failure of this
    // call: the provider still owes the resource, and a plain success would hide that.
    const released = await leased.ok.release()
    if (released.failure !== undefined) return { failure: released.failure }
    return formed
  }

  return class ModelRequestPreparationLocalPlugin extends ModelRequestPreparationService<unknown> {
    static readonly inject = [modelCommandsKey]
    static readonly Config = modelPreparationConfigSchema

    readonly prepare: ModelRequestPreparation<unknown>['prepare']

    constructor(ctx: Context, settings: ModelPreparationSettings) {
      super(ctx)
      // One reference to the injected commands, the same service that the host plugin injects:
      // one source of call facts for the host and for every lease.
      const resources = createModelPreparationResources<unknown>({
        commands: ctx.modelCommands,
        bindings: options.bindings,
        supplierOf: options.supplierOf,
        maxCitedCalls: settings.maxCitedCalls,
      })
      this.prepare = prepareOver
      live.current = resources
      ctx.fiber.effect(() => () => {
        // Only this plugin's own resources end here: a successor that loaded first keeps its own.
        if (live.current === resources) live.current = null
      })
    }
  }
}

function gate(live: {
  current: ModelPreparationResources<unknown> | null
}): ModelPreparationResources<unknown> {
  return {
    async acquire(input) {
      const resources = live.current
      return resources === null ? { failure: PLUGIN_GONE } : resources.acquire(input)
    },
  }
}

/**
 * Creates the preparation plugin class and the lease source that goes with it. The two share one
 * life: the leases are given only while the plugin lives.
 */
export function createModelRequestPreparationPlugin(
  options: ModelPreparationPluginOptions,
): ModelPreparationPlugin {
  const live: { current: ModelPreparationResources<unknown> | null } = { current: null }
  return { plugin: createPluginClass(options, live), resources: gate(live) }
}
