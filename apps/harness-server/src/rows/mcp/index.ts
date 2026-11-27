import type { Context, Plugin } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { assetCategoriesKey, assetChangesKey } from '@omne-harness/assets-cordis-contract'
import { standingPrincipalRef } from '@omne-harness/identity'
import type { TenantId } from '@omne-harness/legal-identity'
import { createMcpEntrySource } from '@omne-harness/mcp-bridge'
import {
  mcpCategoryDisplay,
  mcpEndpointBodyContract,
  isMillis,
  mcpEndpointGates,
  type ActionDiscovery,
  type ActionInvoker,
  type Millis,
} from '@omne-harness/mcp-contract'
import type {
  AdoptionView,
  CredentialUse,
  UseEligibility,
} from '@omne-harness/mcp-contract/provider'
import {
  AdoptionViewService,
  CredentialUseService,
  mcpCredentialUseKey,
  mcpActionDiscoveryKey,
  mcpActionInvokerKey,
  mcpAdoptionViewKey,
  mcpEndpointsPoint,
  mcpEndpointStatusKey,
  mcpUseEligibilityKey,
  UseEligibilityService,
} from '@omne-harness/mcp-cordis-contract/cordis'
import { createMcpPlugin } from '@omne-harness/mcp-host-local/cordis'
import { fail, succeed } from '@omne-harness/operation-result'
import { createToolMessageResultCodec } from '@omne-harness/tool'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'
import { encodeInstant } from '@omne-harness/utc-instant'
import {
  toolEntrySourcesKey,
  type ToolEntrySourcesService,
} from '@omne-harness/tool-cordis-contract/cordis'
import { gatedCategoryContract } from '../../entry/category-gates.ts'
import { defineRow } from '../../row.ts'
import { classify } from '../authorization/principals.ts'
import { provideResidentEndpoints, residentEndpointsKey } from './resident-endpoints.ts'
import {
  tenantAssetSettingsKey,
  type TenantAssetSettingsService,
} from '../governance/tenant-settings-service.ts'
import { settingsSecretCustodyKey } from '../secret-custody/index.ts'
import { settingsSecretItemsKey } from '../settings/index.ts'
import { tenantAssetsKey } from '../tenant-assets/service.ts'
import { createCredentialUse, credentialKey } from './credential.ts'
import {
  createEndpointAdoption,
  createEndpointEligibility,
  heldEndpointRefs,
  MCP_CATEGORY,
  programCallsOpen,
  type EndpointFacts,
  type EndpointSettingRead,
} from './endpoints.ts'
import { keptAdoption, keptSettings, type AdoptionStamp, type HeldRefs } from './kept-adoption.ts'
import { createOutputCheck } from './output-check.ts'

const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)

export const mcpRowConfig = z.strictObject({
  core: z.strictObject({
    maxListingPages: positive,
    maxActions: positive,
    instructionsByteLimit: positive,
    maxLongRequests: positive,
    clientInfo: z.strictObject({ name: z.string().min(1), version: z.string().min(1) }),
  }),
  bridge: z.strictObject({
    acquireWaitMs: positive,
    resultMaxBytes: positive,
    connectBoundMs: positive.refine(isMillis),
  }),
})

const UNKNOWN = { kind: 'unknown' } as const

function principalKey(principal: unknown): string {
  const who = classify(principal)
  if (who === null) throw new TypeError('MCP was asked by a principal the release does not know')
  return who.column === 'system'
    ? `system/${who.principal.component}`
    : standingPrincipalRef(who.principal)
}

// The settings of all MCP endpoints of a tenant are one read, shared by every endpoint until the stamp moves.
function factsOf(ctx: Context, stamp: AdoptionStamp): EndpointFacts {
  return {
    assets: async tenantRef => ctx.get(tenantAssetsKey, false)?.open(tenantRef),
    settings: keptSettings(async tenant => {
      const views = await ctx
        .get(tenantAssetSettingsKey, false)
        ?.items({ tenant, category: MCP_CATEGORY })
      if (views === undefined || views === 'unknown') return 'unknown'
      const byEndpoint = new Map<string, Map<string, EndpointSettingRead>>()
      for (const view of views) {
        if (view.owner.kind !== 'asset') continue
        const items = byEndpoint.get(view.owner.name) ?? new Map<string, EndpointSettingRead>()
        byEndpoint.set(view.owner.name, items)
        for (const [item, read] of readOf(view)) items.set(item, read)
      }
      return byEndpoint
    }, stamp),
    credential: (tenant, endpoint) => presenceOf(ctx, tenant, endpoint),
  }
}

type View = Exclude<Awaited<ReturnType<TenantAssetSettingsService['items']>>, 'unknown'>[number]

function readOf(view: View): readonly (readonly [string, EndpointSettingRead])[] {
  const { revision } = view
  if (view.kind === 'ordinary') {
    const { value } = view.effective
    return [
      [
        view.item,
        value.kind === 'set'
          ? { kind: 'set', value: value.value, revision }
          : { kind: 'unset', revision },
      ],
    ]
  }
  return view.kind === 'secret' ? [[view.item, { kind: 'secret', revision }]] : []
}

async function presenceOf(ctx: Context, tenant: TenantId, endpoint: string) {
  const custody = ctx.get(settingsSecretCustodyKey, false)
  if (custody === undefined) return fail('unknown' as const)
  const presence = custody.describe(credentialKey(tenant, endpoint))
  if (presence === 'denied' || presence === 'unavailable') return fail('unknown' as const)
  if (presence.kind === 'unbound') return succeed({ bound: false, revision: 'unbound' })
  return succeed({
    bound: presence.life !== 'revoked',
    revision: `${presence.life}/${presence.configuredAt === null ? '' : encodeInstant(presence.configuredAt)}`,
  })
}

// What a tenant adopted may have changed when its assets changed or a setting of it was written.
function stampOf(ctx: Context): AdoptionStamp {
  const changed = new Map<string, number>()
  const watched = new Set<string>()
  const moved = (tenantRef: string) => changed.set(tenantRef, (changed.get(tenantRef) ?? 0) + 1)
  return (tenant, tenantRef) => {
    const changes = ctx.get(assetChangesKey, false)
    const settings = ctx.get(tenantAssetSettingsKey, false)
    if (changes === undefined || settings === undefined) return undefined
    if (!watched.has(tenantRef)) {
      watched.add(tenantRef)
      const stop = changes.subscribe(tenantRef, {
        changed: () => moved(tenantRef),
        closed() {
          watched.delete(tenantRef)
          moved(tenantRef)
        },
      })
      ctx.effect(() => stop, 'mcp.adoption-watch')
    }
    const secrets = ctx.get(settingsSecretItemsKey, false)?.writes(tenant) ?? 0
    return `${String(changed.get(tenantRef) ?? 0)}/${String(settings.writes(tenant))}/${String(secrets)}`
  }
}

class Adoption extends AdoptionViewService<unknown, unknown> {
  private readonly view: AdoptionView<unknown, unknown>
  constructor(ctx: Context, view: AdoptionView<unknown, unknown>) {
    super(ctx)
    this.view = view
  }
  endpoints(...args: Parameters<AdoptionView<unknown, unknown>['endpoints']>) {
    return this.view.endpoints(...args)
  }
  endpoint(...args: Parameters<AdoptionView<unknown, unknown>['endpoint']>) {
    return this.view.endpoint(...args)
  }
}

class Eligibility extends UseEligibilityService<unknown> {
  private readonly port: UseEligibility<unknown>
  constructor(ctx: Context, port: UseEligibility<unknown>) {
    super(ctx)
    this.port = port
  }
  check(...args: Parameters<UseEligibility<unknown>['check']>) {
    return this.port.check(...args)
  }
}

class Credentials extends CredentialUseService<unknown> {
  readonly acquire: CredentialUse<unknown>['acquire']
  constructor(ctx: Context, port: CredentialUse<unknown>) {
    super(ctx)
    this.acquire = (...args) => port.acquire(...args)
  }
}

type Discovery = Pick<ActionDiscovery<unknown>, 'current' | 'refresh'>
type Invoker = Pick<ActionInvoker<unknown>, 'invoke' | 'cancelTask'>

// The services of MCP are read at each call: while they are away the answer is `unknown`, not a throw.
function discoveryOf(ctx: Context): Discovery {
  const service = () => ctx.get(mcpActionDiscoveryKey, false) as Discovery | undefined
  return {
    current: async (...args) => (await service()?.current(...args)) ?? fail(UNKNOWN),
    refresh: async (...args) => (await service()?.refresh(...args)) ?? fail(UNKNOWN),
  }
}

function invokerOf(ctx: Context): Invoker {
  const service = () => ctx.get(mcpActionInvokerKey, false) as Invoker | undefined
  return {
    invoke: async (...args) =>
      (await service()?.invoke(...args)) ?? { kind: 'not-sent', reason: UNKNOWN },
    cancelTask: async (...args) => (await service()?.cancelTask(...args)) ?? fail(UNKNOWN),
  }
}

const mcpPlugin: Plugin.Object = {
  name: 'mcp',
  inject: [tenantAssetsKey, assetCategoriesKey, toolEntrySourcesKey],
  Config: mcpRowConfig,
  apply(ctx: Context, raw: unknown) {
    const config = mcpRowConfig.parse(raw)
    ctx.assetCategories.contribute(
      {
        contract: gatedCategoryContract(mcpEndpointBodyContract(), {
          ...mcpEndpointGates,
          gates: [...mcpEndpointGates.gates],
        }),
        display: mcpCategoryDisplay,
      },
      mcpEndpointsPoint,
    )
    const stamp = stampOf(ctx)
    const facts = factsOf(ctx, stamp)
    const held: HeldRefs = tenant => heldEndpointRefs(facts, tenant)
    new Adoption(ctx, keptAdoption(createEndpointAdoption(facts), held, stamp))
    new Eligibility(ctx, createEndpointEligibility(facts))
    new Credentials(
      ctx,
      createCredentialUse(() => ctx.get(settingsSecretCustodyKey, false)),
    )
    ctx.plugin(createMcpPlugin({ principalKey, checkOutput: createOutputCheck() }), config.core)
    const sources = ctx.get(toolEntrySourcesKey) as ToolEntrySourcesService<
      unknown,
      ToolMessageContentBlock
    >
    const source = createMcpEntrySource<unknown>({
      endpoints: asker => held(asker.tenant),
      discovery: discoveryOf(ctx),
      invoker: invokerOf(ctx),
      programmable: (asker, ref) => programCallsOpen(facts, asker.tenant, ref.name),
      principalKey,
      shape: {
        resultContract: createToolMessageResultCodec(config.bridge.resultMaxBytes).adoption,
      },
      resultMaxBytes: config.bridge.resultMaxBytes,
      acquireWaitMs: config.bridge.acquireWaitMs,
      connectBound: config.bridge.connectBoundMs as Millis,
    })
    sources.contribute(source)
    provideResidentEndpoints(ctx, (access, name) => source.named(access, name))
  },
}

/** MCP in the release: the category with its gate, the core, the two answers it asks for, and the bridge to tools. */
export const mcpRow = defineRow({
  row: 'mcp',
  implementation: 'real',
  manifest: {
    provides: [
      mcpActionDiscoveryKey,
      mcpActionInvokerKey,
      mcpEndpointStatusKey,
      mcpAdoptionViewKey,
      mcpUseEligibilityKey,
      mcpCredentialUseKey,
      residentEndpointsKey,
    ],
    injects: [tenantAssetsKey, assetCategoriesKey, toolEntrySourcesKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: mcpPlugin,
})
