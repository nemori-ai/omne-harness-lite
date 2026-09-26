import { expectTypeOf, test } from 'vitest'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import type { BodyContract, AttributeDeclaration } from '@omne-harness-lite/asset-model'
import {
  readSkillMd,
  readSkillPackage,
  skillBodyContract,
  skillDependencies,
} from '@omne-harness-lite/skill-package'
import type {
  ResourceEntry,
  SkillDefinitionRecord,
  SkillManifest,
  SkillPackage,
  SkillPackageEntry,
  SkillSetting,
  ToolReference,
} from '@omne-harness-lite/skill-package'

test('numeric format preserves the existing lossless number type', () => {
  const d: SkillDefinitionRecord = { format: new LosslessNumber('1.0') }
  expectTypeOf(d.format).toEqualTypeOf<number | LosslessNumber>()
})
test('body and manifest are required with no second asset identity', () => {
  // @ts-expect-error body is required
  const noBody: SkillPackage = { manifest: { name: 'x', description: 'd' }, resources: [] }
  // @ts-expect-error seventh manifest member is not accepted
  const m: SkillManifest = { name: 'x', description: 'd', userInvocable: false }
  expectTypeOf(noBody).toEqualTypeOf<SkillPackage>()
  expectTypeOf(m).toEqualTypeOf<SkillManifest>()
})
test('resource representation cannot grant execution permission', () => {
  // @ts-expect-error executable does not belong to the resource representation
  const r: ResourceEntry = { path: 'scripts/run.sh', executable: true }
  expectTypeOf(r).toEqualTypeOf<ResourceEntry>()
})
test('tool references have a single shared category/identity definition', () => {
  const r: ToolReference = { category: 'tool', name: 'read' }
  // @ts-expect-error skill cannot compose skill
  const bad: ToolReference = { category: 'skill', name: 'x' }
  expectTypeOf(r).toEqualTypeOf<ToolReference>()
  expectTypeOf(bad).toEqualTypeOf<ToolReference>()
})
test('author settings exclude governance and retain required preference defaults', () => {
  const s: SkillSetting = {
    item: 'token',
    kind: 'setting',
    category: 'placement_identity',
    domain: { kind: 'open', schema: true },
  }
  expectTypeOf(s).toExtend<AttributeDeclaration>()
  // @ts-expect-error preference settings require a default
  const missing: SkillSetting = {
    item: 'tone',
    kind: 'setting',
    category: 'preference',
    domain: { kind: 'open', schema: true },
  }
  const governance: SkillSetting = {
    item: 'x',
    kind: 'setting',
    // @ts-expect-error governance is never body-derived
    category: 'governance',
    domain: { kind: 'open', schema: true },
  }
  expectTypeOf(missing).toEqualTypeOf<SkillSetting>()
  expectTypeOf(governance).toEqualTypeOf<SkillSetting>()
})
test('definition cannot add resident or permissions members', () => {
  // @ts-expect-error resident belongs to assembly references
  const d: SkillDefinitionRecord = { format: 1, resident: true }
  expectTypeOf(d).toEqualTypeOf<SkillDefinitionRecord>()
})
test('directory entries distinguish observed outside/unresolved links from usable files', () => {
  const inside: SkillPackageEntry = { kind: 'file', path: 'a', linkResolution: 'inside' }
  // @ts-expect-error unresolved link is never represented as a readable file
  const wrong: SkillPackageEntry = { kind: 'file', path: 'a', linkResolution: 'outside' }
  expectTypeOf(readSkillPackage).parameter(0).toEqualTypeOf<readonly SkillPackageEntry[]>()
  expectTypeOf(inside).toExtend<SkillPackageEntry>()
  expectTypeOf(wrong).toEqualTypeOf<SkillPackageEntry>()
})
test('pure public APIs and discriminated body port are typed independently of runtime', () => {
  expectTypeOf(readSkillMd).parameter(0).toBeString()
  expectTypeOf(skillDependencies).parameter(0).toEqualTypeOf<SkillPackage>()
  expectTypeOf(skillBodyContract).toEqualTypeOf<BodyContract<'skill'>>()
  // @ts-expect-error category discriminant cannot populate the tool slot
  const wrong: BodyContract<'tool'> = skillBodyContract
  expectTypeOf(wrong).toEqualTypeOf<BodyContract<'tool'>>()
})
