import type { Context } from '@deepseek-ai/cordis'
import type { LoopExtensionDeclaration } from '@omne-harness/agent-contract'
import {
  capabilityId,
  digestBytes,
  type PackageReader,
  type TenantPublishing,
} from '@omne-harness/assets'
import {
  LOOP_EXTENSION_CATEGORY,
  RUN_SETTING,
  type ExtensionSources,
  type TenantExtensionSources,
} from '@omne-harness/loop-extension-contract'
import type { TenantSettings } from '@omne-harness/settings'
import { savedTenant } from '../../r9/support.ts'
import { loginAccess } from '../../model/public-stream-support.ts'
import type { EntryEnv } from '../../../src/types.ts'

type Tree = Readonly<{ scope: Context; env: EntryEnv; home: string }>

export const assetOf = (name: string) => `${LOOP_EXTENSION_CATEGORY}/${name}`

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
    return published.version
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
    return settings.set({
      ...item,
      operation: operation(`run-${name}`),
      expectedRevision: described.item.revision,
      value: { kind: 'ordinary', value: on },
    })
  }

  return { tenantRef, access, publish, run }
}

/**
 * The release has no write path yet for a plain setting of an asset that is not a tool: the settings
 * writer plans only for the targets of the release tools. This stands in for that one write, around the
 * real tenant sources of the release: `run` answers on for the named extensions, and a change gives the
 * signal a settings writer gives after its commit. Publishing, holding and everything else stay real.
 * It also takes the sources away and brings them back, for the Run that waits while the view cannot be read.
 */
export function runSwitch(tree: Tree) {
  const service = serviceOf<ExtensionSources<unknown>>(tree, 'loopExtensionSources')
  const present = service.of.bind(service)
  const on = new Set<string>()
  const listeners = new Set<() => void>()
  const wrapped = new WeakMap<TenantExtensionSources, TenantExtensionSources>()
  let changes = 0
  let away = false
  const wrap = (real: TenantExtensionSources): TenantExtensionSources => ({
    ...real,
    async run(held) {
      return on.has(held.capability.name) ? { kind: 'value', value: true } : real.run(held)
    },
    async basis() {
      const basis = await real.basis()
      return basis === undefined
        ? undefined
        : { ...basis, settings: `${basis.settings}+${changes}` }
    },
    changes: {
      subscribe(listener) {
        const leave = real.changes.subscribe(listener)
        listeners.add(listener)
        return () => {
          leave()
          listeners.delete(listener)
        }
      },
    },
  })
  service.of = async access => {
    const real = away ? undefined : await present(access)
    if (real === undefined) return undefined
    const known = wrapped.get(real) ?? wrap(real)
    wrapped.set(real, known)
    return known
  }
  return {
    set(name: string, run: boolean) {
      if (run) on.add(name)
      else on.delete(name)
      changes += 1
      for (const listener of listeners) listener()
    },
    away(gone: boolean) {
      away = gone
    },
  }
}
