import { digestBytes } from '@omne-harness/assets'
import type { LocalPackages } from '@omne-harness/assets-local'
import { loadDirectoryFile } from '@omne-harness/assembly-cordis'
import type { PackageFile } from '@omne-harness/plugin-protocol'

export type HeldRef = Readonly<{ asset: string; version: string }>

/** Loads one file of a held version from its directory on this machine, once its bytes match the digest the package lists. */
export async function loadHeldFile(
  packages: Pick<LocalPackages, 'locate'> | undefined,
  held: HeldRef,
  file: PackageFile,
  load?: (url: string) => Promise<unknown>,
): Promise<unknown> {
  if (packages === undefined) throw new Error('the assets of the tenant cannot be opened now')
  const place = await packages.locate({ assetRef: held.asset, version: held.version })
  if (place.kind === 'unavailable') throw new Error('the package cannot be read now')
  if (place.kind === 'absent')
    throw new Error('this version has no directory on this machine to load from')
  const loaded = await loadDirectoryFile(
    place.path,
    file.path,
    bytes => digestBytes(bytes) === file.digest,
    load,
  )
  if (loaded.kind === 'loaded') return loaded.module
  if (loaded.reason === 'outside') throw new Error(`${file.path} is not a file inside the package`)
  if (loaded.reason === 'unreadable') throw loaded.cause
  throw new Error(`${file.path} does not match its digest`)
}
