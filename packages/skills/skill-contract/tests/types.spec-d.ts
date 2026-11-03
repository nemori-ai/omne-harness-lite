// Type-level promises: brands come only from their validating functions, the root entry does not
// name the internal reference or the package locator, and each failure union names only the kinds
// that its operation can give.
import { expectTypeOf, test } from 'vitest'
import type * as root from '@omne-harness/skill-contract'
import type {
  DescribeFailure,
  ExportFailure,
  ListFailure,
  PackagePath,
  ReadFailure,
  SkillName,
  SkillPackageSnapshot,
} from '@omne-harness/skill-contract'
import type { PackageLocator, SkillRef } from '@omne-harness/skill-contract/provider'

test('a branded value cannot be written as a plain literal', () => {
  // @ts-expect-error a SkillName comes only from toSkillName
  const name: SkillName = 'review'
  // @ts-expect-error a PackagePath comes only from toPackagePath
  const path: PackagePath = 'SKILL.md'
  expectTypeOf(name).toEqualTypeOf<SkillName>()
  expectTypeOf(path).toEqualTypeOf<PackagePath>()
})

test('a snapshot cannot be built from its fields', () => {
  const fields = { rootName: 'review', entries: [], digest: `sha256:${'0'.repeat(64)}` }
  expectTypeOf(fields).not.toExtend<SkillPackageSnapshot>()
})

test('the root entry names neither the internal reference nor the package locator', () => {
  expectTypeOf<keyof typeof root>().not.toExtend<'SkillRef' | 'PackageLocator' | 'sealSnapshot'>()
  expectTypeOf<SkillRef>().toHaveProperty('locator').toEqualTypeOf<PackageLocator>()
})

test('each operation names only the failures that it can give', () => {
  type Kind<F extends { kind: string }> = F['kind']
  expectTypeOf<'adopted-material-changed'>().not.toExtend<Kind<ExportFailure>>()
  expectTypeOf<'source-unavailable' | 'version-changed'>().not.toExtend<Kind<DescribeFailure>>()
  expectTypeOf<'resource-missing' | 'bad-path'>().not.toExtend<Kind<ListFailure>>()
  expectTypeOf<'aborted' | 'version-changed' | 'unsupported'>().toExtend<Kind<ReadFailure>>()
})
