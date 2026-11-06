import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import {
  PackageInspectionService,
  SkillAccessService,
  SkillCatalogService,
  SkillReadCheckService,
  SkillResolutionService,
} from '@omne-harness/skill-cordis-contract/cordis'

it('writes each service key once, on its abstract Service', () => {
  expect(PackageInspectionService.provide).toBe('skillPackageInspection')
  expect(SkillCatalogService.provide).toBe('skillCatalog')
  expect(SkillAccessService.provide).toBe('skillAccess')
  expect(SkillReadCheckService.provide).toBe('skillReadCheck')
  expect(SkillResolutionService.provide).toBe('skillResolution')
})

it('exports exactly the five abstract Service classes', async () => {
  const cordis: Record<string, unknown> = await import('@omne-harness/skill-cordis-contract/cordis')
  expect(Object.keys(cordis).sort()).toEqual([
    'PackageInspectionService',
    'SkillAccessService',
    'SkillCatalogService',
    'SkillReadCheckService',
    'SkillResolutionService',
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
  expect(ctx.get(SkillReadCheckService.provide)).toBeInstanceOf(Check)
  expect(ctx.get(SkillResolutionService.provide)).toBeInstanceOf(Resolution)
  await checkFiber.dispose()
  await resolutionFiber.dispose()
  expect(ctx.get(SkillReadCheckService.provide)).toBeUndefined()
  expect(ctx.get(SkillResolutionService.provide)).toBeUndefined()
})
