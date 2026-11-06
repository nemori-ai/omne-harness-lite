import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import {
  PackageInspectionService,
  SkillAccessService,
  SkillCatalogService,
  SkillReadCheckService,
  SkillResolutionService,
  skillAccessKey,
  skillCatalogKey,
  skillPackageInspectionKey,
  skillReadCheckKey,
  skillResolutionKey,
} from '@omne-harness/skill-cordis-contract/cordis'

it('writes each service key once, on its abstract Service, and exports a constant equal to it', () => {
  expect(PackageInspectionService.provide).toBe('skillPackageInspection')
  expect(skillPackageInspectionKey).toBe(PackageInspectionService.provide)
  expect(SkillCatalogService.provide).toBe('skillCatalog')
  expect(skillCatalogKey).toBe(SkillCatalogService.provide)
  expect(SkillAccessService.provide).toBe('skillAccess')
  expect(skillAccessKey).toBe(SkillAccessService.provide)
  expect(SkillReadCheckService.provide).toBe('skillReadCheck')
  expect(skillReadCheckKey).toBe(SkillReadCheckService.provide)
  expect(SkillResolutionService.provide).toBe('skillResolution')
  expect(skillResolutionKey).toBe(SkillResolutionService.provide)
})

it('exports exactly the five abstract Service classes and the five key constants', async () => {
  const cordis: Record<string, unknown> = await import('@omne-harness/skill-cordis-contract/cordis')
  expect(Object.keys(cordis).sort()).toEqual([
    'PackageInspectionService',
    'SkillAccessService',
    'SkillCatalogService',
    'SkillReadCheckService',
    'SkillResolutionService',
    'skillAccessKey',
    'skillCatalogKey',
    'skillPackageInspectionKey',
    'skillReadCheckKey',
    'skillResolutionKey',
  ])
})

const unknownFailure = { failure: { kind: 'unknown' } } as const

class Inspection extends PackageInspectionService {
  async inspect() {
    return { failure: { kind: 'source-unavailable' } } as const
  }
}
class Catalog extends SkillCatalogService<unknown, unknown> {
  async summaries() {
    return { ok: [] }
  }
  async search() {
    return { ok: [] }
  }
}
class Access extends SkillAccessService<unknown, unknown> {
  async describe() {
    return unknownFailure
  }
  async read() {
    return unknownFailure
  }
  async list() {
    return unknownFailure
  }
  async export() {
    return unknownFailure
  }
}
class Check extends SkillReadCheckService<unknown, unknown> {
  async check() {
    return { kind: 'unknown' } as const
  }
}
class Resolution extends SkillResolutionService<unknown, unknown> {
  async resolve() {
    return { kind: 'unknown' } as const
  }
  async adopted() {
    return { failure: 'unknown' } as const
  }
}

const loadable = [
  ['PackageInspectionService', Inspection, skillPackageInspectionKey],
  ['SkillCatalogService', Catalog, skillCatalogKey],
  ['SkillAccessService', Access, skillAccessKey],
  ['SkillReadCheckService', Check, skillReadCheckKey],
  ['SkillResolutionService', Resolution, skillResolutionKey],
] as const

it.each(loadable)(
  'provides a loaded subclass of %s under its key and removes it when the fiber unloads',
  async (_name, Sub, key) => {
    const ctx = new Context()
    const fiber = await ctx.plugin(Sub)
    expect(ctx.get(key)).toBeInstanceOf(Sub)
    await fiber.dispose()
    expect(ctx.get(key)).toBeUndefined()
  },
)
