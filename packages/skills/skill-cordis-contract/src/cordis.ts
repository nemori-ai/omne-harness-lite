// The Cordis service definitions of Skill: the abstract Service of each of the three Skill services
// and of the two demand ports that other domains implement. Each Service writes its key once, in
// `provide`; the exported key constants are taken from it. A Service declares no `inject`: the plugin that uses a port reads it from its own
// context on each call and treats its absence as an unknown answer.
import { type Context, Service } from '@deepseek-ai/cordis'
import type { SkillAccess, SkillCatalog } from '@omne-harness/skill-contract'
import type {
  PackageInspection,
  SkillReadCheck,
  SkillResolution,
} from '@omne-harness/skill-contract/provider'

/**
 * The package inspection of Skill as a service. It checks that a package is a legal Skill package
 * from bytes alone.
 *
 * @owner packages/skills/skill-cordis-contract
 */
export abstract class PackageInspectionService extends Service implements PackageInspection {
  static readonly provide = 'skillPackageInspection'
  constructor(ctx: Context) {
    super(ctx, PackageInspectionService.provide)
  }
  abstract inspect(
    ...args: Parameters<PackageInspection['inspect']>
  ): ReturnType<PackageInspection['inspect']>
}

export const skillPackageInspectionKey = PackageInspectionService.provide

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
 * The Skill access as a service: describe, read, list and export of one Skill, each checked on the
 * spot.
 *
 * @owner packages/skills/skill-cordis-contract
 */
export abstract class SkillAccessService<P, S> extends Service implements SkillAccess<P, S> {
  static readonly provide = 'skillAccess'
  constructor(ctx: Context) {
    super(ctx, SkillAccessService.provide)
  }
  abstract describe(
    ...args: Parameters<SkillAccess<P, S>['describe']>
  ): ReturnType<SkillAccess<P, S>['describe']>
  abstract read(
    ...args: Parameters<SkillAccess<P, S>['read']>
  ): ReturnType<SkillAccess<P, S>['read']>
  abstract list(
    ...args: Parameters<SkillAccess<P, S>['list']>
  ): ReturnType<SkillAccess<P, S>['list']>
  abstract export(
    ...args: Parameters<SkillAccess<P, S>['export']>
  ): ReturnType<SkillAccess<P, S>['export']>
}

export const skillAccessKey = SkillAccessService.provide

/**
 * The read check port of Skill as a service. Another domain provides it by loading a subclass; the
 * Skill plugin reads it on each call and treats its absence as `unknown`. It is an optional
 * dependency, so nobody writes it in `inject`.
 *
 * @owner packages/skills/skill-cordis-contract
 */
export abstract class SkillReadCheckService<P, S> extends Service implements SkillReadCheck<P, S> {
  static readonly provide = 'skillReadCheck'
  constructor(ctx: Context) {
    super(ctx, SkillReadCheckService.provide)
  }
  abstract check(
    ...args: Parameters<SkillReadCheck<P, S>['check']>
  ): ReturnType<SkillReadCheck<P, S>['check']>
}

export const skillReadCheckKey = SkillReadCheckService.provide

/**
 * The resolution port of Skill as a service, with the same rules as the read check port.
 *
 * @owner packages/skills/skill-cordis-contract
 */
export abstract class SkillResolutionService<P, S>
  extends Service
  implements SkillResolution<P, S>
{
  static readonly provide = 'skillResolution'
  constructor(ctx: Context) {
    super(ctx, SkillResolutionService.provide)
  }
  abstract resolve(
    ...args: Parameters<SkillResolution<P, S>['resolve']>
  ): ReturnType<SkillResolution<P, S>['resolve']>
  abstract adopted(
    ...args: Parameters<SkillResolution<P, S>['adopted']>
  ): ReturnType<SkillResolution<P, S>['adopted']>
}

export const skillResolutionKey = SkillResolutionService.provide

declare module '@deepseek-ai/cordis' {
  // The principal and scope types stay `unknown` here; an implementation checks every input at run
  // time, and an assembly with a trusted identity adapter narrows them.
  interface Context {
    skillPackageInspection: PackageInspectionService
    skillCatalog: SkillCatalogService<unknown, unknown>
    skillAccess: SkillAccessService<unknown, unknown>
    skillReadCheck: SkillReadCheckService<unknown, unknown>
    skillResolution: SkillResolutionService<unknown, unknown>
  }
}
