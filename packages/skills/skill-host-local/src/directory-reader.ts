import type { PackageReader } from '@omne-harness/assets'
import type { PackageLocator, SkillPackageSource } from '@omne-harness/skill-contract/provider'

/** A skill package in a directory as the assets read a package: listed and opened through the source, each file by the digest it was listed with. */
export function directoryPackageReader(source: SkillPackageSource, root: string): PackageReader {
  const locator: PackageLocator = { kind: 'directory', root }
  return {
    async manifest() {
      const snapshot = await source.snapshot(locator)
      if (!('ok' in snapshot)) return { failure: 'unavailable' }
      return {
        ok: {
          entries: snapshot.ok.entries.map(entry => ({
            path: entry.path,
            bytes: entry.size,
            digest: entry.digest,
          })),
        },
      }
    },
    async open(path, expected) {
      const snapshot = await source.snapshot(locator)
      if (!('ok' in snapshot)) return { failure: 'unavailable' }
      const entry = snapshot.ok.entries.find(one => one.path === path && one.digest === expected)
      if (entry === undefined) return { failure: 'entry-not-found' }
      const bytes = await source.open(locator, snapshot.ok.digest, entry.path)
      return 'ok' in bytes ? bytes : { failure: 'unavailable' }
    },
  }
}
