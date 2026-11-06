// The Skill plugin over local directories: it builds the three Skill services over the directory
// source and provides them on the loading fiber. The two demand ports (read check, resolution)
// belong to other domains. The plugin reads each of them from its own load context on every call,
// and without one the answer is `unknown`, never a pass.
import type { Context } from '@deepseek-ai/cordis'
import { fail } from '@omne-harness/operation-result'
import { createPackageInspection, createSkillAccess, createSkillCatalog } from '@omne-harness/skill'
import type { SkillAccess, SkillCatalog } from '@omne-harness/skill-contract'
import type {
  PackageInspection,
  SkillReadCheck,
  SkillResolution,
} from '@omne-harness/skill-contract/provider'
import {
  PackageInspectionService,
  SkillAccessService,
  SkillCatalogService,
  SkillReadCheckService,
  SkillResolutionService,
  skillReadCheckKey,
  skillResolutionKey,
} from '@omne-harness/skill-cordis-contract/cordis'
import { createDirectorySource } from './directory-source.ts'

/** A Standard Schema that accepts only an absent or empty configuration. */
type EmptyConfig = {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    validate(
      value: unknown,
    ): { readonly value: object } | { readonly issues: readonly { readonly message: string }[] }
  }
}

const emptyConfig: EmptyConfig = {
  '~standard': {
    version: 1,
    vendor: 'omne-harness',
    validate(value: unknown) {
      if (value == null) return { value: {} }
      if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
        return { value: {} }
      return { issues: [{ message: 'configuration accepts no fields' }] }
    },
  },
}

class HostPackageInspection extends PackageInspectionService {
  private readonly inspection: PackageInspection
  constructor(ctx: Context, inspection: PackageInspection) {
    super(ctx)
    this.inspection = inspection
  }
  inspect(...args: Parameters<PackageInspection['inspect']>) {
    return this.inspection.inspect(...args)
  }
}

class HostSkillCatalog extends SkillCatalogService<unknown, unknown> {
  private readonly catalog: SkillCatalog<unknown, unknown>
  constructor(ctx: Context, catalog: SkillCatalog<unknown, unknown>) {
    super(ctx)
    this.catalog = catalog
  }
  summaries(...args: Parameters<SkillCatalog<unknown, unknown>['summaries']>) {
    return this.catalog.summaries(...args)
  }
  search(...args: Parameters<SkillCatalog<unknown, unknown>['search']>) {
    return this.catalog.search(...args)
  }
}

class HostSkillAccess extends SkillAccessService<unknown, unknown> {
  private readonly access: SkillAccess<unknown, unknown>
  constructor(ctx: Context, access: SkillAccess<unknown, unknown>) {
    super(ctx)
    this.access = access
  }
  describe(...args: Parameters<SkillAccess<unknown, unknown>['describe']>) {
    return this.access.describe(...args)
  }
  read(...args: Parameters<SkillAccess<unknown, unknown>['read']>) {
    return this.access.read(...args)
  }
  list(...args: Parameters<SkillAccess<unknown, unknown>['list']>) {
    return this.access.list(...args)
  }
  export(...args: Parameters<SkillAccess<unknown, unknown>['export']>) {
    return this.access.export(...args)
  }
}

/** The read check port that asks the `skillReadCheck` service on each call (IC-9). */
function readCheckOf(ctx: Context): SkillReadCheck<unknown, unknown> {
  return {
    async check(...args) {
      const port = ctx.get(skillReadCheckKey)
      if (port === undefined) return { kind: 'unknown' }
      return port.check(...args)
    },
  }
}

/** The resolution port that asks the `skillResolution` service on each call (IC-9). */
function resolutionOf(ctx: Context): SkillResolution<unknown, unknown> {
  return {
    async resolve(...args) {
      const port = ctx.get(skillResolutionKey)
      if (port === undefined) return { kind: 'unknown' }
      return port.resolve(...args)
    },
    async adopted(...args) {
      const port = ctx.get(skillResolutionKey)
      if (port === undefined) return fail('unknown')
      return port.adopted(...args)
    },
  }
}

/**
 * Provides `skillPackageInspection`, `skillCatalog` and `skillAccess` over the directory source on
 * the loading fiber. It takes no configuration. It registers no removal: the three services go
 * away when the fiber unloads.
 */
export const skillPlugin = {
  name: 'skill',
  Config: emptyConfig,
  apply(ctx: Context) {
    const source = createDirectorySource()
    const ports = { readCheck: readCheckOf(ctx), resolution: resolutionOf(ctx) }
    new HostPackageInspection(ctx, createPackageInspection(source))
    new HostSkillCatalog(ctx, createSkillCatalog(ports))
    new HostSkillAccess(ctx, createSkillAccess({ ...ports, source }))
  },
}
