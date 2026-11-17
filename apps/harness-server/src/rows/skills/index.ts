import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import type { SkillAccess, SkillCatalog } from '@omne-harness/skill-contract'
import {
  SkillAccessService,
  SkillCatalogService,
  skillAccessKey,
  skillCatalogKey,
} from '@omne-harness/skill-cordis-contract/cordis'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { defineRow } from '../../row.ts'
import { releaseOf } from '../../entry/tool-release.ts'
import { productionStorageCatalog } from '../storage/production-catalog.ts'
import { routedSkills, TenantSkillsHost } from './tenant-skills.ts'

export const skillsRowConfig = z.strictObject({
  packageRoot: z.string().min(1),
  ranking: z.strictObject({ k1: z.number().positive(), b: z.number().min(0).max(1) }),
})

type Catalog = SkillCatalog<unknown, unknown>
type Access = SkillAccess<unknown, unknown>

class TenantSkillCatalog extends SkillCatalogService<unknown, unknown> {
  constructor(
    ctx: Context,
    private readonly routed: Catalog,
  ) {
    super(ctx)
  }
  summaries(...args: Parameters<Catalog['summaries']>) {
    return this.routed.summaries(...args)
  }
  search(...args: Parameters<Catalog['search']>) {
    return this.routed.search(...args)
  }
}

class TenantSkillAccess extends SkillAccessService<unknown, unknown> {
  constructor(
    ctx: Context,
    private readonly routed: Access,
  ) {
    super(ctx)
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
    injects: [storageKey, tenantDomainLookupKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'composition' },
  async body(ctx, raw) {
    const config = skillsRowConfig.parse(raw)
    const release = releaseOf(ctx)
    const host = new TenantSkillsHost({
      domains: ctx.tenantDomainLookup,
      storage: ctx.storage,
      materials: await productionStorageCatalog(async () => release),
      packageRoot: config.packageRoot,
      ranking: config.ranking,
    })
    const routed = routedSkills(host)
    new TenantSkillCatalog(ctx, routed.catalog)
    new TenantSkillAccess(ctx, routed.access)
    ctx.effect(
      () => () => {
        void host.close()
      },
      'skills.close',
    )
    return {
      async stop() {
        await host.close()
        return { kind: 'settled' }
      },
    }
  },
})
