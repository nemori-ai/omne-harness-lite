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
  ModelPreparationResourcesService,
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

export type ModelPreparationPluginOptions = Readonly<{
  bindings: PreparationBindingSource
  supplierOf: SupplierPort<unknown>
}>

export type ModelRequestPreparationPluginClass = {
  new (ctx: Context, settings: ModelPreparationSettings): ModelRequestPreparationService<unknown>
  readonly inject: string[]
  readonly Config: typeof modelPreparationConfigSchema
}

type Live = { current: ModelPreparationResources<unknown> | null }
type Acquire = ModelPreparationResources<unknown>['acquire']

class ModelPreparationResourcesLocal extends ModelPreparationResourcesService<unknown> {
  private readonly leases: ModelPreparationResources<unknown>

  constructor(ctx: Context, leases: ModelPreparationResources<unknown>) {
    super(ctx)
    this.leases = leases
  }

  acquire(...args: Parameters<Acquire>): ReturnType<Acquire> {
    return this.leases.acquire(...args)
  }
}

export type ModelPreparationPlugin = Readonly<{
  plugin: ModelRequestPreparationPluginClass
  resources: ModelPreparationResources<unknown>
}>

function createPluginClass(
  options: ModelPreparationPluginOptions,
  live: Live,
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
      await leased.ok.release()
      throw error
    }
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
      const resources = createModelPreparationResources<unknown>({
        commands: ctx.modelCommands,
        bindings: options.bindings,
        supplierOf: options.supplierOf,
        maxCitedCalls: settings.maxCitedCalls,
      })
      this.prepare = prepareOver
      live.current = resources
      const own: Live = { current: resources }
      new ModelPreparationResourcesLocal(ctx, gate(own))
      ctx.fiber.effect(() => () => {
        own.current = null
        if (live.current === resources) live.current = null
      })
    }
  }
}

function gate(live: Live): ModelPreparationResources<unknown> {
  return {
    async acquire(input) {
      const resources = live.current
      return resources === null ? { failure: PLUGIN_GONE } : resources.acquire(input)
    },
  }
}

export function createModelRequestPreparationPlugin(
  options: ModelPreparationPluginOptions,
): ModelPreparationPlugin {
  const live: Live = { current: null }
  return { plugin: createPluginClass(options, live), resources: gate(live) }
}
