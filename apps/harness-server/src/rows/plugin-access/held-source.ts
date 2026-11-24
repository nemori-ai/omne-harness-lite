import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { AssetChanges } from '@omne-harness/assets-cordis-contract/cordis'
import type { PluginSource } from '@omne-harness/plugin-access'
import { createKeptContents, heldPlugins, readHeldPart } from '@omne-harness/plugin-host-local'
import { heldPluginPorts } from '../plugin-host/held-ports.ts'
import type { TenantAssetsService } from '../tenant-assets/service.ts'
import { nodeFileIo, type FileIo } from './file-io.ts'

export type HeldSourcePorts = Readonly<{
  /** The assets of the tenants, taken at each call; nothing when they are not there now. */
  assets(): Pick<TenantAssetsService, 'standing' | 'open' | 'layerSources'> | undefined
  changes(): AssetChanges | undefined
  io?: FileIo
}>

const UNAVAILABLE = Object.freeze({ kind: 'unavailable' as const })
const NOTHING = Object.freeze({ kind: 'read' as const, plugins: [] })

/** How much content is kept between the parts of the files read last. */
const KEPT_BYTES = 64 * 1024 * 1024

type Range = Readonly<{ offset: number; limit: number }>

/** One part of a file of a published version, read from its directory: a published version does not change, so that part alone is read. */
async function rangeOf(io: FileIo, path: string, bytes: number, { offset, limit }: Range) {
  const now = await stat(path).catch(() => undefined)
  if (now?.size !== bytes) return UNAVAILABLE
  const part = await io.range(path, offset, Math.min(limit, Math.max(0, bytes - offset)))
  const end = Math.min(offset, bytes) + part.byteLength
  return { kind: 'read' as const, part, next: end < bytes ? end : null, bytes }
}

/** The plugins a tenant holds as assets, as a source of plugin/v1. A tenant never registered holds nothing. */
export function createHeldSource(ports: HeldSourcePorts): PluginSource & { close(): void } {
  const io = ports.io ?? nodeFileIo
  const contents = createKeptContents(KEPT_BYTES)
  const kept = new Map<string, ReturnType<typeof reading>>()
  const watched = new Map<string, () => void>()

  /** Whether a listing of this tenant may be kept: only while the change signal says when it goes stale. */
  function watches(tenant: string): boolean {
    if (watched.has(tenant)) return true
    const stop = ports.changes()?.subscribe(tenant, {
      changed: () => void kept.delete(tenant),
      closed() {
        kept.delete(tenant)
        watched.delete(tenant)
      },
    })
    if (stop === undefined) return false
    watched.set(tenant, stop)
    return true
  }

  function held(tenant: string): ReturnType<typeof reading> {
    const known = kept.get(tenant)
    if (known !== undefined) return known
    if (!watches(tenant)) return reading(tenant)
    const now = reading(tenant)
    kept.set(tenant, now)
    const forget = (): void => void (kept.get(tenant) === now && kept.delete(tenant))
    void now.then(answer => 'assets' in answer || forget(), forget)
    return now
  }

  async function reading(tenant: string) {
    const assets = ports.assets()
    if (assets === undefined) return UNAVAILABLE
    const standing = await assets.standing(tenant)
    if (standing === 'unregistered') return NOTHING
    if (standing === 'unknown') return UNAVAILABLE
    const read = await heldPlugins(heldPluginPorts(assets), tenant)
    return read.kind === 'read' ? { ...read, assets } : UNAVAILABLE
  }
  return {
    async list({ tenant }) {
      const now = await held(tenant)
      if (now.kind !== 'read') return UNAVAILABLE
      const offered = now.plugins.map(({ version, manifest, manifestText, files }) => ({
        version,
        manifest,
        manifestText,
        files,
      }))
      return { kind: 'read', offered }
    },
    async read({ tenant }, at) {
      const now = await held(tenant)
      if (now.kind !== 'read') return UNAVAILABLE
      const plugin = now.plugins.find(each => each.name === at.name && each.version === at.version)
      if (plugin === undefined || !('assets' in now)) return { kind: 'absent', what: 'plugin' }
      const file = plugin.files.find(each => each.path === at.path)
      if (file === undefined) return { kind: 'absent', what: 'file' }
      const local = await now.assets.open(tenant)
      if (local === undefined) return UNAVAILABLE
      const { asset: assetRef, version } = plugin.held
      const place = await local.packages.locate({ assetRef, version })
      if (place.kind === 'unavailable') return UNAVAILABLE
      if (place.kind === 'absent') {
        const reader = local.packages.reader({ assetRef, version })
        return readHeldPart(reader, file, at.offset, at.limit, contents)
      }
      return rangeOf(io, join(place.path, ...file.path.split('/')), file.bytes, at)
    },
    subscribe(tenant, listener) {
      const stop = ports
        .changes()
        ?.subscribe(tenant, { changed: listener, closed: () => undefined })
      return stop ?? (() => undefined)
    },
    close() {
      for (const stop of watched.values()) stop()
      watched.clear()
      kept.clear()
    },
  }
}
