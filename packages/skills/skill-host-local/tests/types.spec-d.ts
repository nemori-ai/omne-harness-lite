// The failure set of the directory source stays the closed source failure set of the contract,
// and the seam keeps exactly its four reads.
import { expectTypeOf, test } from 'vitest'
import type { Outcome } from '@omne-harness/operation-result'
import type { Bytes, SkillPackageSnapshot } from '@omne-harness/skill-contract'
import { createDirectorySource, type DirectoryFs } from '@omne-harness/skill-host-local'
import type * as root from '@omne-harness/skill-host-local'

type Failure =
  | 'package-not-found'
  | 'entry-not-found'
  | 'bytes-mismatch'
  | 'outside-package'
  | 'unavailable'
  | 'entry-unreadable'

test('snapshot and open answer only the six source failures', () => {
  const source = createDirectorySource()
  expectTypeOf(source.snapshot).returns.resolves.toEqualTypeOf<
    Outcome<SkillPackageSnapshot, Failure>
  >()
  expectTypeOf(source.open).returns.resolves.toEqualTypeOf<Outcome<Bytes, Failure>>()
})

test('the seam has four reads and the source takes it as its only option', () => {
  expectTypeOf<keyof DirectoryFs>().toEqualTypeOf<'readdir' | 'lstat' | 'realpath' | 'readFile'>()
  expectTypeOf(createDirectorySource)
    .parameter(0)
    .toEqualTypeOf<Readonly<{ fs?: DirectoryFs }> | undefined>()
})

test('the only run time export of the root entry is createDirectorySource', () => {
  expectTypeOf<keyof typeof root>().toEqualTypeOf<'createDirectorySource'>()
})
