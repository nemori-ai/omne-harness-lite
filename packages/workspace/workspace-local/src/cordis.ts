import type { Context } from '@deepseek-ai/cordis'
import { storageKey } from '@omne-harness/sql-contract/cordis'
import type {
  ManagementType,
  ManagementTypes,
  WorkspaceCatalog,
  WorkspaceGovernance,
  WorkspaceInstances,
  WorkspaceSources,
} from '@omne-harness/workspace-contract'
import {
  WorkspaceCatalogService,
  WorkspaceGovernanceService,
  WorkspaceInstancesService,
  WorkspaceSourcesService,
  WorkspaceTypesService,
} from '@omne-harness/workspace-cordis-contract/cordis'
import { createWorkspaceLocalApplication, type WorkspaceLocalOptions } from './application.ts'

/** What the assembly gives: everything but the storage, which is injected. */
export type WorkspaceLocalConfiguration = Omit<WorkspaceLocalOptions<unknown>, 'sql'> &
  Readonly<{ sql: Omit<WorkspaceLocalOptions<unknown>['sql'], 'storage'> }>

class LocalGovernance extends WorkspaceGovernanceService {
  readonly register: WorkspaceGovernance<unknown>['register']
  readonly grantParticipation: WorkspaceGovernance<unknown>['grantParticipation']
  readonly grantAdmin: WorkspaceGovernance<unknown>['grantAdmin']
  readonly revokeAdmin: WorkspaceGovernance<unknown>['revokeAdmin']
  readonly remove: WorkspaceGovernance<unknown>['remove']
  readonly leave: WorkspaceGovernance<unknown>['leave']
  readonly destroy: WorkspaceGovernance<unknown>['destroy']
  readonly operation: WorkspaceGovernance<unknown>['operation']
  constructor(ctx: Context, face: WorkspaceGovernance<unknown>) {
    super(ctx)
    this.register = face.register
    this.grantParticipation = face.grantParticipation
    this.grantAdmin = face.grantAdmin
    this.revokeAdmin = face.revokeAdmin
    this.remove = face.remove
    this.leave = face.leave
    this.destroy = face.destroy
    this.operation = face.operation
  }
}

class LocalInstances extends WorkspaceInstancesService {
  readonly associate: WorkspaceInstances<unknown>['associate']
  readonly dissociate: WorkspaceInstances<unknown>['dissociate']
  readonly verify: WorkspaceInstances<unknown>['verify']
  readonly locate: WorkspaceInstances<unknown>['locate']
  constructor(ctx: Context, face: WorkspaceInstances<unknown>) {
    super(ctx)
    this.associate = face.associate
    this.dissociate = face.dissociate
    this.verify = face.verify
    this.locate = face.locate
  }
}

class LocalCatalog extends WorkspaceCatalogService {
  readonly list: WorkspaceCatalog<unknown>['list']
  readonly describe: WorkspaceCatalog<unknown>['describe']
  constructor(ctx: Context, face: WorkspaceCatalog<unknown>) {
    super(ctx)
    this.list = face.list
    this.describe = face.describe
  }
}

class LocalSources extends WorkspaceSourcesService {
  readonly adopt: WorkspaceSources<unknown>['adopt']
  readonly adopted: WorkspaceSources<unknown>['adopted']
  readonly open: WorkspaceSources<unknown>['open']
  constructor(ctx: Context, face: WorkspaceSources<unknown>) {
    super(ctx)
    this.adopt = face.adopt
    this.adopted = face.adopted
    this.open = face.open
  }
}

class LocalTypes extends WorkspaceTypesService {
  private readonly registry: ManagementTypes
  constructor(ctx: Context, registry: ManagementTypes) {
    super(ctx)
    this.registry = registry
  }
  protected add(type: ManagementType) {
    const contribution = this.registry.contribute(type)
    return () => contribution.release()
  }
}

export function createWorkspaceLocalPlugin() {
  return {
    name: 'workspace-local',
    inject: [storageKey],
    async apply(ctx: Context, config: WorkspaceLocalConfiguration) {
      const application = createWorkspaceLocalApplication({
        ...config,
        sql: { ...config.sql, storage: ctx.storage },
      })
      const bound = [
        ctx.plugin(LocalGovernance, application.governance),
        ctx.plugin(LocalInstances, application.instances),
        ctx.plugin(LocalCatalog, application.catalog),
        ctx.plugin(LocalSources, application.sources),
        ctx.plugin(LocalTypes, application.types),
      ]
      await Promise.all(bound.map(fiber => fiber.await()))
    },
  }
}
