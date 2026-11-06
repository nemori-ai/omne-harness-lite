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

it('provides a loaded subclass under its key and removes it when the fiber unloads', async () => {
  class Check extends SkillReadCheckService<unknown, unknown> {
    async check() {
      return { kind: 'refused' } as const
    }
  }
  class Resolution extends SkillResolutionService<unknown, unknown> {
    async resolve() {
      return { kind: 'none' } as const
    }
    async adopted() {
      return { ok: [] }
    }
  }
  const ctx = new Context()
  const checkFiber = await ctx.plugin(Check)
  const resolutionFiber = await ctx.plugin(Resolution)
  expect(ctx.get(skillReadCheckKey)).toBeInstanceOf(Check)
  expect(ctx.get(skillResolutionKey)).toBeInstanceOf(Resolution)
  await checkFiber.dispose()
  await resolutionFiber.dispose()
  expect(ctx.get(skillReadCheckKey)).toBeUndefined()
  expect(ctx.get(skillResolutionKey)).toBeUndefined()
})
