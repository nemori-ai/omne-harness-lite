import type { Context } from '@deepseek-ai/cordis'
import { heldEffect, type CategoryEffect } from '@omne-harness/assets'
import {
  assetCategoriesKey,
  assetManagementKey,
  assetPublishingKey,
} from '@omne-harness/assets-cordis-contract'
import {
  attachExtensionsSource,
  type ExtensionsCallSource,
  type ExtensionsFaces,
  type HeldSettings,
} from '@omne-harness/assets-tools'
import { tenantCodec, workspaceCodec } from '@omne-harness/legal-identity'
import {
  pinnedFiles,
  type FixedToolRequest,
  type ToolCallDirectory,
} from '@omne-harness/tool-contract'
import type { CallAccess, ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { workspaceInstancesKey } from '@omne-harness/workspace-cordis-contract/cordis'
import { tenantActingSettingsKey } from '../governance/tenant-settings-service.ts'
import { settingsSecretItemsKey } from '../settings/index.ts'
import { admittedDirectory } from '../tool-runtime/environment.ts'
import { heldSettingsOf } from './extension-settings.ts'
import { extensionRevisionOf } from './extension-points.ts'
import { directoryIn, placeIn, type Working } from './workspace-directory.ts'

type Parent = CallAccess<unknown> & Readonly<{ request: FixedToolRequest }>

export type ExtensionsPorts = Readonly<{
  faces(): ExtensionsFaces | undefined
  /** Where the call works, admitted now, with the files scope pinned to it: absent when it has none, unavailable when that cannot be asked. */
  workingDirectory(): Promise<Working | 'absent' | 'unavailable'>
  /** The settings of the tenant layer for this call; undefined when they cannot be had now. */
  settings(): HeldSettings | undefined
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
        (await effectOf(input.capability.category)?.impact.of({ ...input, tenant })) ?? UNREAD,
    },
    placement: {
      of: async input =>
        (await effectOf(input.capability.category)?.placement.of({ ...input, tenant })) ?? UNREAD,
    },
    settings: () => ports.settings(),
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
  const tenantText = encoded.value
  const { principal, tenant } = parent
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
      settings() {
        const acting = ctx.get(tenantActingSettingsKey, false)
        const management = ctx.get(assetManagementKey)?.management
        if (acting === undefined || management === undefined) return undefined
        return heldSettingsOf({
          acting,
          principal,
          tenant,
          describe: capability =>
            management.describe({ tenant: tenantText, principal, capability }),
          secrets: () => ctx.get(settingsSecretItemsKey, false),
        })
      },
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
