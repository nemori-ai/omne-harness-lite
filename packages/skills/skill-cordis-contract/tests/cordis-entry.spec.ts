import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import {
  SkillAccessService,
  SkillCatalogService,
  skillAccessKey,
  skillCatalogKey,
} from '@omne-harness/skill-cordis-contract/cordis'

it('writes each service key once, on its abstract Service, and exports a constant equal to it', () => {
  expect(SkillCatalogService.provide).toBe('skillCatalog')
  expect(skillCatalogKey).toBe(SkillCatalogService.provide)
  expect(SkillAccessService.provide).toBe('skillAccess')
  expect(skillAccessKey).toBe(SkillAccessService.provide)
})

it('exports exactly the two abstract Service classes and the two key constants', async () => {
  const cordis: Record<string, unknown> = await import('@omne-harness/skill-cordis-contract/cordis')
  expect(Object.keys(cordis).sort()).toEqual([
    'SkillAccessService',
    'SkillCatalogService',
    'skillAccessKey',
    'skillCatalogKey',
  ])
})

const unknownFailure = { failure: { kind: 'unknown' } } as const

class Catalog extends SkillCatalogService<unknown, unknown> {
  async summaries() {
    return { ok: [] }
  }
  async search() {
    return { ok: [] }
  }
}
class Access extends SkillAccessService<unknown, unknown> {
  async read() {
    return unknownFailure
  }
  async list() {
    return unknownFailure
  }
}

const loadable = [
  ['SkillCatalogService', Catalog, skillCatalogKey],
  ['SkillAccessService', Access, skillAccessKey],
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
