import { fail } from '@omne-harness/operation-result'
import {
  sealSnapshot,
  type SkillPackageSource,
  type SnapshotDefect,
  type SourceFailure,
} from '@omne-harness/skill-contract/provider'
import { nodeFs, type DirectoryFs } from './fs.ts'
import { collect, readEntry } from './walk.ts'

function failureOf(defect: SnapshotDefect): SourceFailure {
  switch (defect.kind) {
    case 'invalid-root-name':
      throw new Error('unreachable: the walk gives only a root with a name')
    case 'duplicate-path':
    case 'prefix-conflict':
      return 'entry-unreadable'
  }
}

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
