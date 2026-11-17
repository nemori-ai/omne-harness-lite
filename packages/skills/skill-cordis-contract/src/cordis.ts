import { type Context, Service } from '@deepseek-ai/cordis'
import type { SkillAccess, SkillCatalog } from '@omne-harness/skill-contract'

/**
 * The Skill catalog as a service. It lists and searches the current lawful set that the caller may
 * read.
 *
 * @owner packages/skills/skill-cordis-contract
 */
export abstract class SkillCatalogService<P, S> extends Service implements SkillCatalog<P, S> {
  static readonly provide = 'skillCatalog'
  constructor(ctx: Context) {
    super(ctx, SkillCatalogService.provide)
  }
  abstract summaries(
    ...args: Parameters<SkillCatalog<P, S>['summaries']>
  ): ReturnType<SkillCatalog<P, S>['summaries']>
  abstract search(
    ...args: Parameters<SkillCatalog<P, S>['search']>
  ): ReturnType<SkillCatalog<P, S>['search']>
}

export const skillCatalogKey = SkillCatalogService.provide

/**
 * The Skill access as a service: read and list of one Skill, each checked on the spot.
 *
 * @owner packages/skills/skill-cordis-contract
 */
export abstract class SkillAccessService<P, S> extends Service implements SkillAccess<P, S> {
  static readonly provide = 'skillAccess'
  constructor(ctx: Context) {
    super(ctx, SkillAccessService.provide)
  }
  abstract read(
    ...args: Parameters<SkillAccess<P, S>['read']>
  ): ReturnType<SkillAccess<P, S>['read']>
  abstract list(
    ...args: Parameters<SkillAccess<P, S>['list']>
  ): ReturnType<SkillAccess<P, S>['list']>
}

export const skillAccessKey = SkillAccessService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    skillCatalog: SkillCatalogService<unknown, unknown>
    skillAccess: SkillAccessService<unknown, unknown>
  }
}
