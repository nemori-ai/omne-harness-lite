import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import type { SkillAccess, SkillCatalog } from '@omne-harness/skill-contract'
import { skillCategoryPlugin } from '@omne-harness/skill-host-local/cordis'
import {
  SkillAccessService,
  SkillCatalogService,
  skillAccessKey,
  skillCatalogKey,
} from '@omne-harness/skill-cordis-contract/cordis'
import { defineRow } from '../../row.ts'
import { tenantAssetsKey } from '../tenant-assets/service.ts'
import { routedSkills, tenantSkills, TenantSkillsHost } from './tenant-skills.ts'

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
    provides: [skillCatalogKey, skillAccessKey],
    injects: [tenantAssetsKey, assetCategoriesKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'composition' },
  async body(ctx, raw) {
    const config = skillsRowConfig.parse(raw)
    ctx.plugin(skillCategoryPlugin)
    const host = new TenantSkillsHost({
      async open(tenant, tenantRef) {
        const assets = await ctx.tenantAssets.open(tenantRef)
        return assets === undefined ? undefined : tenantSkills(assets, tenant, config.ranking)
      },
    })
    const routed = routedSkills(host)
    new TenantSkillCatalog(ctx, routed.catalog)
    new TenantSkillAccess(ctx, routed.access)
    ctx.effect(() => () => host.close(), 'skills.close')
    return {
      async stop() {
        host.close()
        return { kind: 'settled' }
      },
    }
  },
})
