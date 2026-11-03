// `createDirectorySource`: a `SkillPackageSource` over the current contents of local directories.
// It keeps no index and no cache, so every call reads the directory as it is at that moment.
import { fail } from '@omne-harness/operation-result'
import {
  sealSnapshot,
  type SkillPackageSource,
  type SnapshotDefect,
  type SourceFailure,
} from '@omne-harness/skill-contract/provider'
import { nodeFs, type DirectoryFs } from './fs.ts'
import { collect, readEntry } from './walk.ts'

/**
 * `resolveRoot` gives only roots with a name, and a walk cannot list one path twice or a file
 * above another path. A file system seam that lists a name twice gives a listing that no package
 * can have.
 */
function failureOf(defect: SnapshotDefect): SourceFailure {
  switch (defect.kind) {
    case 'invalid-root-name':
      throw new Error('unreachable: the walk gives only a root with a name')
    case 'duplicate-path':
    case 'prefix-conflict':
      return 'entry-unreadable'
  }
}

/**
 * A source that reads packages from local directories. The locator is
 * `{ kind: 'directory', root }`; a content-store locator names no package of this source. `open`
 * does not look at the snapshot digest: this source does not keep bytes by digest, and the caller
 * compares the bytes with the entry digest.
 */
export function createDirectorySource(
  options: Readonly<{ fs?: DirectoryFs }> = {},
): SkillPackageSource {
  const fs = options.fs ?? nodeFs()
  return {
    async snapshot(locator) {
      if (locator.kind !== 'directory') return fail('package-not-found')
      const collected = await collect(fs, locator.root)
      if (!('ok' in collected)) return collected
      const sealed = sealSnapshot(collected.ok)
      return 'ok' in sealed ? sealed : fail(failureOf(sealed.failure))
    },
    async open(locator, _digest, path) {
      if (locator.kind !== 'directory') return fail('package-not-found')
      return readEntry(fs, locator.root, path)
    },
  }
}
