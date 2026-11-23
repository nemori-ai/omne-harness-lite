import type { Member, PluginManifest, SideName } from './manifest.ts'
import type { PackageFile } from './package.ts'

/** One plugin as a source gives it: a version that is the digest of its content, its manifest, its files. */
export type Offered = Readonly<{
  version: string
  manifest: PluginManifest
  files: readonly PackageFile[]
}>

/** One plugin as one side is to load it. */
export type Wanted = Readonly<{
  name: string
  version: string
  members: readonly Member[]
  needs: readonly string[]
  files: readonly PackageFile[]
}>

/** What one side is to load of what a source offers: by name; a name offered twice is not loaded. */
export function wantedOf(offered: readonly Offered[], side: SideName): readonly Wanted[] {
  const names = offered.map(each => each.manifest.name)
  const once = (name: string): boolean => names.indexOf(name) === names.lastIndexOf(name)
  return offered
    .flatMap(({ version, manifest, files }) => {
      const mine = manifest[side]
      if (mine === undefined || !once(manifest.name)) return []
      const { members, needs = [] } = mine
      return [{ name: manifest.name, version, members, needs, files }]
    })
    .sort((left, right) => (left.name < right.name ? -1 : 1))
}
