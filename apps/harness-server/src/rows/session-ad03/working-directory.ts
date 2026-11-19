import { Service, type Context } from '@deepseek-ai/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { RuntimeContextOperations } from '@omne-harness/runtime-context-contract'
import {
  createStepDirectory,
  createWorkingDirectoryPublisher,
  type StepDirectory,
  type StepDirectoryPorts,
  type WorkingDirectoryPublisher,
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

/** One publisher of the working directory block for each tenant, started when first needed. */
export class SessionWorkingDirectory extends Service implements StepDirectory<unknown> {
  readonly refresh: StepDirectory<unknown>['refresh']

  constructor(ctx: Context, sources: Sources) {
    super(ctx, sessionWorkingDirectoryKey)
    const publishers = new Map<string, WorkingDirectoryPublisher>()
    let active = true
    ctx.effect(() => async () => {
      active = false
      const closing = [...publishers.values()].map(publisher => publisher.close())
      publishers.clear()
      await Promise.all(closing)
    })
    const publisherOf = (tenant: TenantId): WorkingDirectoryPublisher | undefined => {
      const encoded = tenantCodec.encode(tenant)
      if (!active || !encoded.ok) return undefined
      const existing = publishers.get(encoded.value)
      if (existing !== undefined) return existing
      const principal = sources.principals.forTenant(tenant)
      if (principal === undefined) return undefined
      const created = createWorkingDirectoryPublisher<unknown>({
        tenant,
        principal,
        runtime: sources.runtime,
      })
      publishers.set(encoded.value, created)
      return created
    }
    const step = createStepDirectory<unknown>({
      defaultDirectory: sources.defaultDirectory,
      targets: sources.targets,
      recover: sources.recover,
      publish: async (tenant, scope, value) =>
        (await publisherOf(tenant)?.publish(scope, value)) ?? {
          kind: 'unavailable',
          diagnostic: 'the tenant has no working directory publisher',
        },
    })
    this.refresh = input => step.refresh(input)
  }
}
