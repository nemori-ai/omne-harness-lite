import type { PackageReader, PackageSourceFailure } from '@omne-harness/assets'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  isPackagePath,
  type PackageDigest,
  type PackageEntry,
  type SkillPackageSnapshot,
} from '@omne-harness/skill-contract'
import {
  packageEntryOf,
  sealEntries,
  type PackageLocator,
  type SkillPackageSource,
  type SourceFailure,
} from '@omne-harness/skill-contract/provider'

export type PackageReaderOf = (
  locator: Readonly<{ ref: string; digest: PackageDigest }>,
) => PackageReader

/** `null`: this assembly keeps no local directory for the package. */
export type PackageDirectoryOf = (
  locator: Readonly<{ ref: string; digest: PackageDigest }>,
) => Promise<Outcome<string | null, 'unavailable'>>

const KEPT_SNAPSHOTS = 256

function failureOf(failure: PackageSourceFailure): SourceFailure {
  switch (failure) {
    case 'package-not-found':
      return 'package-not-found'
    case 'entry-not-found':
      return 'entry-not-found'
    case 'material-unavailable':
      return 'bytes-mismatch'
    case 'unavailable':
      return 'unavailable'
  }
}

type ContentLocator = Readonly<{ ref: string; digest: PackageDigest }>

export function createContentStoreSource(
  options: Readonly<{ readerOf: PackageReaderOf; directoryOf?: PackageDirectoryOf }>,
): SkillPackageSource {
  const { directoryOf } = options
  const sealed = new Map<PackageDigest, SkillPackageSnapshot>()

  function keep(digest: PackageDigest, snapshot: SkillPackageSnapshot): void {
    sealed.delete(digest)
    sealed.set(digest, snapshot)
    const oldest = sealed.keys().next()
    if (sealed.size > KEPT_SNAPSHOTS && !oldest.done) sealed.delete(oldest.value)
  }

  async function snapshotOf(
    locator: ContentLocator,
  ): Promise<Outcome<SkillPackageSnapshot, SourceFailure>> {
    const { digest } = locator
    const known = sealed.get(digest)
    if (known !== undefined) {
      keep(digest, known)
      return succeed(known)
    }
    const reader = options.readerOf({ ref: locator.ref, digest })
    const manifest = await reader.manifest()
    if (!('ok' in manifest)) return fail(failureOf(manifest.failure))
    const entries: PackageEntry[] = []
    for (const entry of manifest.ok.entries) {
      if (!isPackagePath(entry.path)) return fail('entry-unreadable')
      const opened = await reader.open(entry.path, entry.digest)
      if (!('ok' in opened)) return fail(failureOf(opened.failure))
      entries.push(packageEntryOf(entry.path, opened.ok))
    }
    const snapshot = sealEntries({ rootName: digest, entries })
    if (!('ok' in snapshot)) return fail('entry-unreadable')
    if (snapshot.ok.digest !== digest) return fail('bytes-mismatch')
    keep(digest, snapshot.ok)
    return snapshot
  }

  return {
    async snapshot(locator) {
      if (locator.kind !== 'content-store') return fail('package-not-found')
      return snapshotOf(locator)
    },
    async open(locator, digest, path) {
      if (locator.kind !== 'content-store' || digest !== locator.digest)
        return fail('package-not-found')
      const snapshot = await snapshotOf(locator)
      if (!('ok' in snapshot)) return snapshot
      const entry = snapshot.ok.entries.find(one => one.path === path)
      if (entry === undefined) return fail('entry-not-found')
      const opened = await options
        .readerOf({ ref: locator.ref, digest: locator.digest })
        .open(path, entry.digest)
      return 'ok' in opened ? opened : fail(failureOf(opened.failure))
    },
    ...(directoryOf === undefined
      ? {}
      : {
          async directory(locator: PackageLocator, digest: PackageDigest) {
            if (locator.kind !== 'content-store') return succeed(null)
            return directoryOf({ ref: locator.ref, digest })
          },
        }),
  }
}
