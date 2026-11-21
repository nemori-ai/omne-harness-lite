import { Service, type Context } from '@deepseek-ai/cordis'
import type {
  ManagementType,
  WorkspaceCatalog,
  WorkspaceGovernance,
  WorkspaceInstances,
  WorkspaceSources,
} from '@omne-harness/workspace-contract'

/** @owner packages/workspace/workspace-cordis-contract */
export abstract class WorkspaceGovernanceService
  extends Service
  implements WorkspaceGovernance<unknown>
{
  static readonly provide = 'workspaceGovernance'

  constructor(ctx: Context) {
    super(ctx, WorkspaceGovernanceService.provide)
  }

  abstract readonly register: WorkspaceGovernance<unknown>['register']
  abstract readonly grantParticipation: WorkspaceGovernance<unknown>['grantParticipation']
  abstract readonly grantAdmin: WorkspaceGovernance<unknown>['grantAdmin']
  abstract readonly revokeAdmin: WorkspaceGovernance<unknown>['revokeAdmin']
  abstract readonly remove: WorkspaceGovernance<unknown>['remove']
  abstract readonly leave: WorkspaceGovernance<unknown>['leave']
  abstract readonly destroy: WorkspaceGovernance<unknown>['destroy']
  abstract readonly operation: WorkspaceGovernance<unknown>['operation']
}
export const workspaceGovernanceKey = WorkspaceGovernanceService.provide

/** @owner packages/workspace/workspace-cordis-contract */
export abstract class WorkspaceInstancesService
  extends Service
  implements WorkspaceInstances<unknown>
{
  static readonly provide = 'workspaceInstances'

  constructor(ctx: Context) {
    super(ctx, WorkspaceInstancesService.provide)
  }

  abstract readonly associate: WorkspaceInstances<unknown>['associate']
  abstract readonly dissociate: WorkspaceInstances<unknown>['dissociate']
  abstract readonly verify: WorkspaceInstances<unknown>['verify']
  abstract readonly locate: WorkspaceInstances<unknown>['locate']
}
export const workspaceInstancesKey = WorkspaceInstancesService.provide

/** @owner packages/workspace/workspace-cordis-contract */
export abstract class WorkspaceCatalogService extends Service implements WorkspaceCatalog<unknown> {
  static readonly provide = 'workspaceCatalog'

  constructor(ctx: Context) {
    super(ctx, WorkspaceCatalogService.provide)
  }

  abstract readonly list: WorkspaceCatalog<unknown>['list']
  abstract readonly describe: WorkspaceCatalog<unknown>['describe']
}
export const workspaceCatalogKey = WorkspaceCatalogService.provide

/** @owner packages/workspace/workspace-cordis-contract */
export abstract class WorkspaceSourcesService extends Service implements WorkspaceSources<unknown> {
  static readonly provide = 'workspaceSources'

  constructor(ctx: Context) {
    super(ctx, WorkspaceSourcesService.provide)
  }

  abstract readonly adopt: WorkspaceSources<unknown>['adopt']
  abstract readonly adopted: WorkspaceSources<unknown>['adopted']
  abstract readonly open: WorkspaceSources<unknown>['open']
}
export const workspaceSourcesKey = WorkspaceSourcesService.provide

/** @owner packages/workspace/workspace-cordis-contract */
// The extension point `workspace.types`. A contribution is withdrawn when its contributor's scope ends.
export abstract class WorkspaceTypesService extends Service {
  static readonly provide = 'workspaceTypes'

  constructor(ctx: Context) {
    super(ctx, WorkspaceTypesService.provide)
  }

  contribute(type: ManagementType): void {
    this.ctx.effect(() => this.add(type), 'workspaceTypes.contribute')
  }

  protected abstract add(type: ManagementType): () => void
}
export const workspaceTypesKey = WorkspaceTypesService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    workspaceGovernance: WorkspaceGovernanceService
    workspaceInstances: WorkspaceInstancesService
    workspaceCatalog: WorkspaceCatalogService
    workspaceSources: WorkspaceSourcesService
    workspaceTypes: WorkspaceTypesService
  }
}
