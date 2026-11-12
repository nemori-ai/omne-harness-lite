// `createContentStoreSource`: a `SkillPackageSource` for `{ kind: 'content-store', digest }`
// locators, over the read port of published packages that assets gives. It knows the asset
// contract only: the assembly hands it the function that gives the read port of a package
// digest, for example the `reader` of the local assets member.
//
// A package digest names one content, so the snapshot of a digest never changes: the source seals
// it once from the manifest, one file at a time, and keeps it. A read then opens one file.
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

/** The read port of the package with this digest. */
export type PackageReaderOf = (digest: PackageDigest) => PackageReader

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

export function createContentStoreSource(
  options: Readonly<{ readerOf: PackageReaderOf }>,
): SkillPackageSource {
  const sealed = new Map<PackageDigest, SkillPackageSnapshot>()

  async function snapshotOf(
    digest: PackageDigest,
  ): Promise<Outcome<SkillPackageSnapshot, SourceFailure>> {
    const known = sealed.get(digest)
    if (known !== undefined) return succeed(known)
    const reader = options.readerOf(digest)
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
    sealed.set(digest, snapshot.ok)
    return snapshot
  }

  return {
    async snapshot(locator) {
      if (locator.kind !== 'content-store') return fail('package-not-found')
      return snapshotOf(locator.digest)
    },
    async open(locator, digest, path) {
      if (locator.kind !== 'content-store' || digest !== locator.digest)
        return fail('package-not-found')
      const snapshot = await snapshotOf(locator.digest)
      if (!('ok' in snapshot)) return snapshot
      const entry = snapshot.ok.entries.find(one => one.path === path)
      if (entry === undefined) return fail('entry-not-found')
      const opened = await options.readerOf(locator.digest).open(path, entry.digest)
      return 'ok' in opened ? opened : fail(failureOf(opened.failure))
    },
  }
}
