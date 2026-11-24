import type { Context } from '@deepseek-ai/cordis'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import type { JsonValue } from '@omne-harness/json-text'
import { tenantCodec, type Access } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { Reply, ToolDefinition } from '@omne-harness/tool-contract'
import {
  deriveDefinition,
  judgeToolDefinition,
  scriptConstructionOf,
  type ToolAuthority,
  type ToolLoader,
  type ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import {
  createLocalToolLoader,
  type LocalToolContributionVerifier,
} from '@omne-harness/tool-host-local'
import type { LocalToolHostPluginInput } from '@omne-harness/tool-host-local/cordis'
import { registrantOf, releaseOf } from '../../entry/tool-release.ts'
import { sameAdoption } from '../../entry/tool-release-manifest.ts'
import { inWorkspace, tenantLayers } from '../tenant-assets/layers.ts'
import { tenantAssetsKey } from '../tenant-assets/service.ts'
import { rememberHeldDefinition } from './held-definitions.ts'
import { HELD_TOOL_SETTINGS, TOOL_CATEGORY, heldCandidateOf } from './held-tools.ts'
import { workspaceToolBody } from './workspace-tools.ts'

type B = ToolMessageContentBlock
type Input = LocalToolHostPluginInput<unknown, unknown, B>
type Resolved = Awaited<ReturnType<Input['source']['resolve']>>

const unavailable = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency: 'tool-host', diagnostic })
const invalid = (field: string, reason: string) => fail({ kind: 'invalid' as const, field, reason })

function memberOf(value: JsonValue | undefined, key: string): JsonValue | undefined {
  return value?.kind === 'object'
    ? value.entries.find(entry => entry.key === key)?.value
    : undefined
}

/** The body of the version an authority names, read from the assets of the tenant that holds it. */
async function bodyOf(ctx: Context, authority: ToolAuthority): Promise<JsonValue | undefined> {
  const { layer } = authority
  if (layer.kind !== 'tenant') return undefined
  const taken = heldCandidateOf(authority)
  if (inWorkspace(taken.asset)) return workspaceToolBody(ctx, layer.tenant, taken)
  const encoded = tenantCodec.encode(layer.tenant)
  const service = ctx.get(tenantAssetsKey)
  if (!encoded.ok || service === undefined) return undefined
  const assets = await service.open(encoded.value)
  if (assets === undefined) return undefined
  const contract = () => ctx.get(assetCategoriesKey)?.view.lookup(TOOL_CATEGORY)
  const layers = tenantLayers(
    assets,
    service.layerSources(encoded.value),
    contract,
    service.official,
  )
  return layers.body(taken)
}

/** The construction a held tool is made with: what its body gives the script executor, whole. */
async function constructionOf(ctx: Context, authority: ToolAuthority) {
  const body = await bodyOf(ctx, authority)
  if (body === undefined) return unavailable('the held version of the tool cannot be read')
  const read = scriptConstructionOf(body)
  if (read === undefined) return invalid('implementation', 'not a tool the script executor runs')
  if (!('ok' in read)) return invalid('construction', read.failure.reason)
  const construction = memberOf(memberOf(body, 'implementation'), 'construction')
  return construction === undefined
    ? invalid('construction', 'the body carries no construction')
    : succeed(construction)
}

/** The access a held tool is loaded and contributed with: the registrant of the release, for the tenant that holds it. */
function accessOf(ctx: Context, authority: ToolAuthority): Access<unknown> | undefined {
  const registrant = registrantOf(ctx)
  const { layer } = authority
  return registrant === undefined || layer.kind !== 'tenant'
    ? undefined
    : Object.freeze({ principal: registrant.principal, tenant: layer.tenant })
}

function scriptModule(ctx: Context) {
  const release = releaseOf(ctx)
  return release.kind === 'trusted' ? release.modules.scriptToolModule : undefined
}

/** The definition a held version gives, read from its body without loading it; undefined when it cannot be read or made. */
export async function heldDefinitionFromBody(
  ctx: Context,
  authority: ToolAuthority,
): Promise<ToolDefinition | undefined> {
  const module = scriptModule(ctx)
  const construction = await constructionOf(ctx, authority)
  if (module === undefined || 'failure' in construction) return undefined
  const created = module.createAuthor(construction.ok)
  if ('failure' in created) return undefined
  const governance = { asset: authority.asset, requiredCapabilities: [] }
  const judged = judgeToolDefinition(deriveDefinition(governance, created.ok.facts))
  return 'ok' in judged ? judged.ok : undefined
}

/** Where the author of a tool that a tenant holds comes from: its body, and the script executor of the trusted release. */
export async function resolveHeld(ctx: Context, authority: ToolAuthority): Promise<Resolved> {
  try {
    const module = scriptModule(ctx)
    if (module === undefined)
      return fail({ kind: 'unavailable', diagnostic: 'tool-host: release snapshot unavailable' })
    const construction = await constructionOf(ctx, authority)
    if ('failure' in construction)
      return construction.failure.kind === 'invalid'
        ? fail({ kind: 'invalid', reason: construction.failure.reason })
        : fail({ kind: 'unavailable', diagnostic: `tool-host: ${construction.failure.diagnostic}` })
    const access = accessOf(ctx, authority)
    if (access === undefined)
      return fail({ kind: 'unavailable', diagnostic: 'tool-host: release registrant absent' })
    return succeed(
      Object.freeze({
        module,
        config: Object.freeze({
          authority,
          construction: construction.ok,
          settings: HELD_TOOL_SETTINGS,
        }),
        context: Object.freeze({
          access,
          asset: Object.freeze({ asset: authority.asset, requiredCapabilities: [] }),
          services: Object.freeze({}),
        }),
      }),
    )
  } catch {
    return fail({ kind: 'unavailable', diagnostic: 'tool-host: held source failed' })
  }
}

/** The loader of a held tool: the construction is read again from its body, and the executor is the one of the release. */
export function heldLoaderFor(
  ctx: Context,
  authority: ToolAuthority,
  verifier: LocalToolContributionVerifier<unknown>,
  checkNeed: (definition: ToolDefinition) => Reply<void>,
): ToolLoader<unknown, unknown, B> {
  const loader = createLocalToolLoader<unknown, unknown, B>({
    authority,
    verifier,
    async settings(input) {
      if (!sameAdoption(input.settings, HELD_TOOL_SETTINGS))
        return invalid('settings', 'a held tool declares no settings')
      return constructionOf(ctx, input.authority)
    },
    async schemas(_input, loaded) {
      const module = scriptModule(ctx)
      if (module === undefined) return unavailable('release snapshot unavailable')
      if (!sameAdoption(loaded.executor, module.executor))
        return invalid('executor', 'a held tool is implemented by the script executor')
      const checked = await checkNeed(loaded.definition)
      if ('failure' in checked) return checked
      rememberHeldDefinition(ctx, loaded.key, loaded.definition)
      return checked
    },
  })
  return {
    async load(input) {
      const fixed = scriptModule(ctx)
      if (fixed === undefined) return unavailable('release snapshot unavailable')
      if (!sameAdoption(input.module.executor, fixed.executor))
        return invalid('module', 'a held tool is implemented by the script executor')
      return loader.load({ ...input, module: fixed })
    },
  }
}
