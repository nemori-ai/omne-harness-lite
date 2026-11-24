import type { Context } from '@deepseek-ai/cordis'
import type { LoopExtensionDeclaration } from '@omne-harness/agent-contract'
import {
  capabilityId,
  digestBytes,
  type PackageReader,
  type TenantManagement,
  type TenantPublishing,
} from '@omne-harness/assets'
import {
  LOOP_EXTENSION_CATEGORY,
  RUN_SETTING,
  type ExtensionSources,
} from '@omne-harness/loop-extension-contract'
import type { TenantSettings } from '@omne-harness/settings'
import { savedTenant } from '../../r9/support.ts'
import { loginAccess } from '../../model/public-stream-support.ts'
import type { EntryEnv } from '../../../src/types.ts'

type Tree = Readonly<{ scope: Context; env: EntryEnv; home: string }>

export const assetOf = (name: string) => `${LOOP_EXTENSION_CATEGORY}/${name}`
const WRITTEN = 'written'

export function packageOf(files: Readonly<Record<string, string>>): PackageReader {
  const bytes = new Map(
    Object.entries(files).map(([path, text]) => [path, new TextEncoder().encode(text)] as const),
  )
  return {
    async manifest() {
      const entries = [...bytes].map(([path, value]) => ({
        path,
        bytes: value.length,
        digest: digestBytes(value),
      }))
      return { ok: { entries } }
    },
    async open(path) {
      const found = bytes.get(path)
      return found === undefined ? { failure: 'entry-not-found' } : { ok: found }
    },
  }
}

const serviceOf = <T>(tree: Tree, key: string): T => {
  const found = tree.scope.get(key) as T | undefined
  if (found === undefined) throw new Error(`${key} is not provided`)
  return found
}

/** A tenant of the release tree as its own principal: it publishes through the asset publishing entry and writes its settings through the tenant settings entry. */
export async function tenantOf(tree: Tree) {
  const tenantRef = savedTenant(tree.home)
  const access = await loginAccess(tree)
  const publishing = serviceOf<TenantPublishing<unknown>>(tree, 'assetPublishing')
  const settings = serviceOf<TenantSettings<unknown>>(tree, 'tenantSettings')
  let operations = 0
  const operation = (what: string) => `${what}-${(operations += 1)}-${Date.now()}`

  const management = serviceOf<{ management: TenantManagement<unknown> }>(
    tree,
    'assetManagement',
  ).management
  const holdings = new Map<string, string>()

  /** Publishes a version of one extension and holds it; returns the version it got. */
  async function publish(
    declaration: LoopExtensionDeclaration,
    files: Readonly<Record<string, string>> = {},
  ): Promise<string> {
    const capability = capabilityId(LOOP_EXTENSION_CATEGORY, declaration.name)
    if (!capability.ok) throw new Error('not a capability identity')
    const published = await publishing.publish({
      operationId: operation(`publish-${declaration.name}`),
      tenant: tenantRef,
      principal: access.principal,
      capability: capability.id,
      content: {
        kind: 'directory',
        from: packageOf({ ...files, 'extension.json': JSON.stringify(declaration) }),
      },
    })
    if (published.kind !== 'published') throw new Error(JSON.stringify(published))
    holdings.set(declaration.name, published.holdingRef)
    return published.version
  }

  /** Enables or disables the holding of one extension through the management entry a tenant uses. */
  async function setEnabled(name: string, enabled: boolean) {
    const holding = holdings.get(name)
    if (holding === undefined) throw new Error(`${name} is not held`)
    return management.setEnabled({
      operationId: operation(`enable-${name}`),
      tenant: tenantRef,
      principal: access.principal,
      holding,
      enabled,
    })
  }

  /** Writes the run setting of one extension through the settings entry a tenant uses, and gives its answer. */
  async function run(name: string, on: boolean) {
    const item = {
      ...access,
      owner: { kind: 'asset' as const, category: LOOP_EXTENSION_CATEGORY, name },
      item: RUN_SETTING,
    }
    const described = await settings.describe(item)
    if (described.kind !== 'described') return described
    const written = await settings.set({
      ...item,
      operation: operation(`run-${name}`),
      expectedRevision: described.item.revision,
      value: { kind: 'ordinary', value: on },
    })
    if (written.kind !== WRITTEN) throw new Error(JSON.stringify(written))
    return written
  }

  return { tenantRef, access, publish, run, setEnabled }
}

/**
 * Takes the tenant sources of the loop extensions away and brings them back, for the Run that waits
 * while the view cannot be read. Nothing else is stood in: publishing, holding and settings are real.
 */
export function sourcesGate(tree: Tree) {
  const service = serviceOf<ExtensionSources<unknown>>(tree, 'loopExtensionSources')
  const present = service.of.bind(service)
  let away = false
  service.of = async access => (away ? undefined : present(access))
  return {
    away(gone: boolean) {
      away = gone
    },
  }
}
