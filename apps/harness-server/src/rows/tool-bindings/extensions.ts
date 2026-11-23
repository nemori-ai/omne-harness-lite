import { readdir, realpath, stat } from 'node:fs/promises'
import { join, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import {
  digestBytes,
  heldEffect,
  type CategoryEffect,
  type PackageReader,
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
import type { FixedToolRequest, ToolCallDirectory } from '@omne-harness/tool-contract'
import type { CallAccess, ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { workspaceInstancesKey } from '@omne-harness/workspace-cordis-contract/cordis'
import { nodeFileIo } from '../plugin-access/file-io.ts'
import { admittedDirectory } from '../tool-runtime/environment.ts'
import { extensionRevisionOf } from './extension-points.ts'

type Parent = CallAccess<unknown> & Readonly<{ request: FixedToolRequest }>

export type ExtensionsPorts = Readonly<{
  faces(): ExtensionsFaces | undefined
  /** The directory the call works in, admitted now: absent when it has none, unavailable when that cannot be asked. */
  workingDirectory(): Promise<string | 'absent' | 'unavailable'>
  revision(): string | null
}>

const hidden = (name: string): boolean => name.startsWith('.')
const safe = (path: string): boolean =>
  path !== '' &&
  !path.startsWith('/') &&
  !path.includes('\\') &&
  path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')

/** A directory on disk as a package: its files, none whose name begins with a dot, each opened only as it was listed. */
function directoryPackage(root: string): PackageReader {
  return {
    async manifest() {
      try {
        const found = await readdir(root, { recursive: true, withFileTypes: true })
        const files = found
          .filter(entry => entry.isFile())
          .map(entry =>
            join(entry.parentPath, entry.name)
              .slice(root.length + 1)
              .split(sep),
          )
          .filter(segments => !segments.some(hidden))
        const entries = await Promise.all(
          files.map(async segments => {
            const file = join(root, ...segments)
            const [{ size }, { digest }] = await Promise.all([
              stat(file),
              nodeFileIo.digest(file, false),
            ])
            return { path: segments.join('/'), bytes: size, digest: `sha256:${digest}` }
          }),
        )
        return { ok: { entries: entries.sort((left, right) => (left.path < right.path ? -1 : 1)) } }
      } catch {
        return { failure: 'unavailable' }
      }
    },
    async open(path, expected) {
      if (!safe(path)) return { failure: 'entry-not-found' }
      try {
        const file = join(root, ...path.split('/'))
        const { size } = await stat(file)
        const bytes = await nodeFileIo.range(file, 0, size)
        return digestBytes(bytes) === expected ? { ok: bytes } : { failure: 'material-unavailable' }
      } catch {
        return { failure: 'entry-not-found' }
      }
    },
  }
}

async function directoryIn(
  working: string,
  path: string,
): Promise<PackageReader | 'absent' | 'unavailable'> {
  if (!safe(path)) return 'absent'
  try {
    const inside = await realpath(working)
    const root = await realpath(join(inside, ...path.split('/'))).catch(() => undefined)
    if (root === undefined || !root.startsWith(inside + sep)) return 'absent'
    return (await stat(root)).isDirectory() ? directoryPackage(root) : 'absent'
  } catch {
    return 'unavailable'
  }
}

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
    impact: {
      of: async input =>
        (await effectOf(input.capability.category)?.impact.of({ ...input, tenant })) ?? UNREAD,
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
        return admitted.ok?.path ?? 'absent'
      },
      revision: () => extensionRevisionOf(ctx),
    },
    { tenant: encoded.value, principal: parent.principal },
  )
  return attachExtensionsSource(scope, source)
}
