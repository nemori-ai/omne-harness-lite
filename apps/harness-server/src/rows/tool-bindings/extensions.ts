import type { Context } from '@deepseek-ai/cordis'
import {
  heldEffect,
  publishRefusal,
  type CapabilityId,
  type CategoryEffect,
  type PublishStanding,
} from '@omne-harness/assets'
import {
  assetCategoriesKey,
  assetManagementKey,
  assetPublishingKey,
} from '@omne-harness/assets-cordis-contract'
import {
  attachExtensionsSource,
  type ExtensionsCallSource,
  type ExtensionsFaces,
} from '@omne-harness/assets-tools'
import { tenantCodec, workspaceCodec } from '@omne-harness/legal-identity'
import {
  pinnedFiles,
  type FixedToolRequest,
  type ToolCallDirectory,
} from '@omne-harness/tool-contract'
import type { CallAccess, ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { workspaceInstancesKey } from '@omne-harness/workspace-cordis-contract/cordis'
import { publishStandingOf } from '../tenant-assets/held-standing.ts'
import { admittedDirectory } from '../tool-runtime/environment.ts'
import { extensionRevisionOf } from './extension-points.ts'
import { directoryIn, placeIn, type Working } from './workspace-directory.ts'

type Parent = CallAccess<unknown> & Readonly<{ request: FixedToolRequest }>

export type ExtensionsPorts = Readonly<{
  faces(): ExtensionsFaces | undefined
  /** How a new holding of the tenant would stand against the wider layers: what the publish itself asks. */
  standing(capability: CapabilityId, tenant: string): PublishStanding
  /** Where the call works, admitted now, with the files scope pinned to it: absent when it has none, unavailable when that cannot be asked. */
  workingDirectory(): Promise<Working | 'absent' | 'unavailable'>
  revision(): string | null
}>

/** What one call of OmneExtensions is given. Every answer is for the tenant of the call, whatever a question names. */
export function createExtensionsSource(
  ports: ExtensionsPorts,
  call: Readonly<{ tenant: string; principal: unknown }>,
): ExtensionsCallSource {
  const { tenant, principal } = call
  // The owner of the category tells of its own; of a category whose owner tells nothing, the assets tell.
  const effectOf = (category: string): CategoryEffect | undefined => {
    const faces = ports.faces()
    if (faces === undefined) return undefined
    const told = faces.categories.effectOf(category)
    if (told !== undefined) return told
    return heldEffect({
      point(named) {
        const listing = faces.categories.describe(named)
        return listing !== undefined && 'point' in listing ? listing.point : undefined
      },
      async standing(capability) {
        const described = await faces.management.describe({ tenant, principal, capability })
        return described.kind === 'asset' ? described.standing : undefined
      },
    })
  }
  const UNREAD = { kind: 'unavailable', reason: 'the assets cannot be read now' } as const
  const refusedImpact = (capability: CapabilityId) => {
    const refused = publishRefusal(ports.standing(capability, tenant), capability)
    if (refused === undefined) return undefined
    if (refused.kind !== 'invalid')
      return {
        kind: 'unavailable',
        reason: 'whether a wider layer holds this name cannot be read now',
      } as const
    const listing = ports.faces()?.categories.describe(capability.category)
    const point = listing !== undefined && 'point' in listing ? listing.point : capability.category
    const says = `→ would be refused: ${refused.reason}`
    const line = { mark: '!', of: null, point, key: capability.name, says } as const
    return {
      kind: 'changes',
      lines: [line],
      loads: null,
      advice: 'Publish it under another name.',
    } as const
  }
  return {
    tenant,
    principal,
    faces: () => ports.faces(),
    async directory(path) {
      const working = await ports.workingDirectory()
      return working === 'absent' || working === 'unavailable'
        ? working
        : directoryIn(working, path)
    },
    async place(path, from) {
      const working = await ports.workingDirectory()
      if (working === 'absent' || working === 'unavailable') return { kind: working }
      return placeIn(working, path, from).catch(() => ({ kind: 'unavailable' }) as const)
    },
    impact: {
      of: async input =>
        (input.change === 'publish' ? refusedImpact(input.capability) : undefined) ??
        (await effectOf(input.capability.category)?.impact.of({ ...input, tenant })) ??
        UNREAD,
    },
    placement: {
      of: async input =>
        (await effectOf(input.capability.category)?.placement.of({ ...input, tenant })) ?? UNREAD,
    },
    revision: () => ports.revision(),
  }
}

/** The directory the request pins. The request may be a copy, so the identity of its workspace is read again from its text. */
function pinnedOf(request: FixedToolRequest): ToolCallDirectory | undefined | null {
  const pinned = request.directory
  if (pinned === undefined || pinned.workspace === null) return pinned
  const parsed = workspaceCodec.parse(String((pinned.workspace.id as { text?: unknown }).text))
  return parsed.ok ? { ...pinned, workspace: { ...pinned.workspace, id: parsed.value } } : null
}

/** OmneExtensions acts for the tenant of the call, with its principal; the model gives neither. */
export function bindReleaseExtensions(
  ctx: Context,
  parent: Parent,
  scope: ToolExecutionScope,
): ToolExecutionScope {
  const encoded = tenantCodec.encode(parent.tenant)
  if (!encoded.ok) return scope
  const source = createExtensionsSource(
    {
      faces() {
        const categories = ctx.get(assetCategoriesKey)?.view
        const management = ctx.get(assetManagementKey)?.management
        const publishing = ctx.get(assetPublishingKey)
        return categories === undefined || management === undefined || publishing === undefined
          ? undefined
          : { categories, management, publishing }
      },
      standing: (capability, tenant) => publishStandingOf(ctx, capability, tenant),
      async workingDirectory() {
        const directory = pinnedOf(parent.request)
        if (directory === undefined) return 'absent'
        if (directory === null) return 'unavailable'
        const admitted = await admittedDirectory(() => ctx.get(workspaceInstancesKey, false), {
          principal: parent.principal,
          tenant: parent.tenant,
          request: { directory },
        })
        if (!('ok' in admitted)) return 'unavailable'
        return admitted.ok == null
          ? 'absent'
          : { path: admitted.ok.path, files: pinnedFiles(directory) }
      },
      revision: () => extensionRevisionOf(ctx),
    },
    { tenant: encoded.value, principal: parent.principal },
  )
  return attachExtensionsSource(scope, source)
}
