import { Service, type Context } from '@deepseek-ai/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import type { RuntimeContextOperations } from '@omne-harness/runtime-context-contract'
import {
  createStepDirectory,
  createWorkingDirectoryPublishers,
  type StepDirectory,
  type StepDirectoryPorts,
} from '@omne-harness/session-adapters/cordis'
import type { SessionModesPrincipalsService } from '../../entry/session-modes-principals.ts'

export const sessionWorkingDirectoryKey = 'sessionWorkingDirectory'

type Sources = Pick<StepDirectoryPorts<unknown>, 'defaultDirectory' | 'targets' | 'recover'> &
  Readonly<{
    principals: Pick<SessionModesPrincipalsService, 'forTenant'>
    runtime: Pick<RuntimeContextOperations<unknown>, 'registerProducer'>
  }>

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionWorkingDirectory: SessionWorkingDirectory
  }
}

/**
 * The step action that settles the working directory of a session, with a publisher for each tenant.
 * @owner apps/harness-server/src/rows/session-ad03
 */
export class SessionWorkingDirectory extends Service implements StepDirectory<unknown> {
  readonly refresh: StepDirectory<unknown>['refresh']
  /** Makes the block known for the tenant; it is called before a session scope is restored. */
  readonly ensure: (tenant: TenantId) => Promise<Readonly<{ kind: 'ready' | 'unavailable' }>>

  constructor(ctx: Context, sources: Sources) {
    super(ctx, sessionWorkingDirectoryKey)
    const publishers = createWorkingDirectoryPublishers<unknown>({
      principal: tenant => sources.principals.forTenant(tenant),
      runtime: sources.runtime,
    })
    ctx.effect(() => () => publishers.close())
    const { defaultDirectory, targets, recover } = sources
    const step = createStepDirectory<unknown>({
      defaultDirectory,
      targets,
      recover,
      publish: publishers.publish,
    })
    this.refresh = input => step.refresh(input)
    this.ensure = tenant => publishers.ensure(tenant)
  }
}
