// The type exports of `./provider`: this file checks the shape of each named type and the set of
// runtime exports at the type level. The full set of names, types included, is checked in
// public-entry.spec.ts, which reads src/provider.ts and refuses star exports.
import { expectTypeOf, test } from 'vitest'
import type * as provider from '@omne-harness/skill-contract/provider'
import type {
  CatalogResolution,
  PackageInspection,
  PackageLocator,
  ReadVerdict,
  Reply,
  Resolution,
  SkillPackageSource,
  SkillReadCheck,
  SkillRef,
  SkillResolution,
  SnapshotDefect,
  SourceFailure,
} from '@omne-harness/skill-contract/provider'

test('the provider entry exports each port and answer type', () => {
  expectTypeOf<SkillPackageSource>().toHaveProperty('snapshot')
  expectTypeOf<SkillPackageSource>().toHaveProperty('open')
  expectTypeOf<SkillResolution<unknown, unknown>>().toHaveProperty('resolve')
  expectTypeOf<SkillResolution<unknown, unknown>>().toHaveProperty('adopted')
  expectTypeOf<SkillReadCheck<unknown, unknown>>().toHaveProperty('check')
  expectTypeOf<PackageInspection>().toHaveProperty('inspect')
  expectTypeOf<Resolution['kind']>().toEqualTypeOf<
    'known-unavailable' | 'adopted' | 'basis-not-lawful' | 'none' | 'unknown'
  >()
  expectTypeOf<CatalogResolution['kind']>().toEqualTypeOf<'adopted' | 'known-unavailable'>()
  expectTypeOf<ReadVerdict['kind']>().toEqualTypeOf<'granted' | 'refused' | 'unknown'>()
  expectTypeOf<Reply<number>>().resolves.toEqualTypeOf<{ ok: number } | { failure: 'unknown' }>()
  expectTypeOf<SourceFailure>().toEqualTypeOf<
    | 'package-not-found'
    | 'entry-not-found'
    | 'bytes-mismatch'
    | 'outside-package'
    | 'unavailable'
    | 'entry-unreadable'
  >()
  expectTypeOf<SnapshotDefect['kind']>().toEqualTypeOf<
    'invalid-root-name' | 'duplicate-path' | 'prefix-conflict'
  >()
  expectTypeOf<PackageLocator['kind']>().toEqualTypeOf<'directory' | 'content-store'>()
  expectTypeOf<SkillRef>().toHaveProperty('locator').toEqualTypeOf<PackageLocator>()
})

test('the only runtime export of the provider entry is sealSnapshot', () => {
  expectTypeOf<keyof typeof provider>().toEqualTypeOf<'sealSnapshot'>()
})
