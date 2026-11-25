import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import { broughtDefinitionsPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import { OFFICIAL_SKILLS as SKIN_SKILLS } from '@omne-harness/plugin-host-local'
import { OFFICIAL_SKILLS as SKILL_SKILLS } from '@omne-harness/skill-host-local'
import type { SkillAccess, SkillCatalog } from '@omne-harness/skill-contract'
import { skillCategoryPlugin } from '@omne-harness/skill-host-local/cordis'
import { workspaceSourcesKey } from '@omne-harness/workspace-cordis-contract/cordis'
import {
  SkillAccessService,
  SkillCatalogService,
  skillAccessKey,
  skillCatalogKey,
  skillSkillsPoint,
} from '@omne-harness/skill-cordis-contract/cordis'
import { defineRow } from '../../row.ts'
import { tenantAssetsKey } from '../tenant-assets/service.ts'
import { officialSkillPorts, officialSkills } from './official-skills.ts'
import { provideSessionSkills, sessionSkillsKey } from './session-skills.ts'
import { routedSkills, sessionSkillsOf, tenantSkills, TenantSkillsHost } from './tenant-skills.ts'

export const skillsRowConfig = z.strictObject({
  ranking: z.strictObject({ k1: z.number().positive(), b: z.number().min(0).max(1) }),
})

type Catalog = SkillCatalog<unknown, unknown>
type Access = SkillAccess<unknown, unknown>

class TenantSkillCatalog extends SkillCatalogService<unknown, unknown> {
  private readonly routed: Catalog
  constructor(ctx: Context, routed: Catalog) {
    super(ctx)
    this.routed = routed
  }
  summaries(...args: Parameters<Catalog['summaries']>) {
    return this.routed.summaries(...args)
  }
  search(...args: Parameters<Catalog['search']>) {
    return this.routed.search(...args)
  }
}

class TenantSkillAccess extends SkillAccessService<unknown, unknown> {
  private readonly routed: Access
  constructor(ctx: Context, routed: Access) {
    super(ctx)
    this.routed = routed
  }
  read(...args: Parameters<Access['read']>) {
    return this.routed.read(...args)
  }
  list(...args: Parameters<Access['list']>) {
    return this.routed.list(...args)
  }
}

export const skillsRow = defineRow({
  row: 'skills',
  implementation: 'real',
  manifest: {
    provides: [skillCatalogKey, skillAccessKey, sessionSkillsKey],
    injects: [tenantAssetsKey, assetCategoriesKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'composition' },
  async body(ctx, raw) {
    const config = skillsRowConfig.parse(raw)
    ctx.plugin(skillCategoryPlugin)
    const brought = await officialSkills([...SKIN_SKILLS, ...SKILL_SKILLS])
    const held = brought.map(({ name, item, body, files }) => ({ name, item, body, files }))
    ctx.plugin(broughtDefinitionsPlugin('skills-official', skillSkillsPoint.name, held))
    const official = officialSkillPorts(brought, () => ctx.tenantAssets.official())
    const workspace = {
      sources: () => ctx.get(workspaceSourcesKey),
      contractOf: (category: string) => ctx.assetCategories.view.lookup(category),
    }
    const host = new TenantSkillsHost({
      async open(tenant, tenantRef) {
        const assets = await ctx.tenantAssets.open(tenantRef)
        return assets === undefined
          ? undefined
          : tenantSkills(
              assets,
              tenant,
              config.ranking,
              workspace,
              ctx.tenantAssets.layerSources(tenantRef),
              official,
              category => ctx.tenantAssets.heldNames(tenantRef, category),
            )
      },
    })
    const routed = routedSkills(host)
    new TenantSkillCatalog(ctx, routed.catalog)
    new TenantSkillAccess(ctx, routed.access)
    provideSessionSkills(ctx, sessionSkillsOf(host))
    ctx.effect(() => () => host.close(), 'skills.close')
    return {
      async stop() {
        host.close()
        return { kind: 'settled' }
      },
    }
  },
})
