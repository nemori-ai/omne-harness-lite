// `createContentStoreSource`: a `SkillPackageSource` for `{ kind: 'content-store', digest, ref }`
// locators, over the read port of published packages that assets gives. It knows the asset
// contract only: the assembly hands it the function that gives the read port of a package, for
// example the `reader` of the local assets member. `ref` is the opaque reference that the content
// store gave; the source passes it on as it is and does not interpret it.
//
// A package digest names one content, so the snapshot of a digest never changes: the source seals
// it once from the manifest, one file at a time, and keeps the snapshots used last. A read then
// opens one file.
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
  type SkillPackageSource,
  type SourceFailure,
} from '@omne-harness/skill-contract/provider'

/** The read port of the package that the content store names with `ref` and `digest`. */
export type PackageReaderOf = (
  locator: Readonly<{ ref: string; digest: PackageDigest }>,
) => PackageReader

/** How many sealed snapshots the source keeps: the ones used last. */
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
  options: Readonly<{ readerOf: PackageReaderOf }>,
): SkillPackageSource {
  /** In the order of use, the oldest first. */
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
    // The entries come from the bytes, and the manifest is checked, not trusted: the bytes must
    // give the digest that names the package.
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
  }
}
