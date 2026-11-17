import { expectTypeOf, test } from 'vitest'
import type { AssetLayer } from '@omne-harness/assets'
import type * as root from '@omne-harness/skill-contract'
import type {
  DeclaredProjection,
  ListFailure,
  PackagePath,
  ReadFailure,
  SkillAccess,
  SkillDeclaration,
  SkillName,
  SkillPackageSnapshot,
  SourceLayer,
} from '@omne-harness/skill-contract'
import type { PackageLocator, SkillRef } from '@omne-harness/skill-contract/provider'
// @ts-expect-error the root entry does not name the internal reference
import type { SkillRef as RefOnRoot } from '@omne-harness/skill-contract'
// @ts-expect-error the root entry does not name the package locator
import type { PackageLocator as LocatorOnRoot } from '@omne-harness/skill-contract'

test('a branded value cannot be written as a plain literal', () => {
  // @ts-expect-error a SkillName comes only from isSkillName
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
  expectTypeOf<RefOnRoot | LocatorOnRoot>().toBeAny()
})

test('the access has only read and list', () => {
  expectTypeOf<keyof SkillAccess<unknown, unknown>>().toEqualTypeOf<'read' | 'list'>()
})

test('a declaration and its projection carry no settings', () => {
  expectTypeOf<keyof SkillDeclaration>().toEqualTypeOf<'dependencies'>()
  expectTypeOf<keyof DeclaredProjection>().toEqualTypeOf<'name' | 'description' | 'tools'>()
})

test('each operation names only the failures that it can give', () => {
  type Kind<F extends { kind: string }> = F['kind']
  expectTypeOf<'resource-missing' | 'bad-path'>().not.toExtend<Kind<ListFailure>>()
  expectTypeOf<'outside-package'>().toExtend<Kind<ListFailure>>()
  expectTypeOf<'aborted' | 'version-changed' | 'unsupported'>().toExtend<Kind<ReadFailure>>()
})

test('the Skill source layers are the asset layers, word for word', () => {
  expectTypeOf<SourceLayer>().toEqualTypeOf<AssetLayer>()
})
