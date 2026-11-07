import { createToolForwardRuntime } from '@omne-harness/tool'
import type { ToolForwardRuntime } from '@omne-harness/tool-contract/provider'
import type { Context } from '@deepseek-ai/cordis'
import { fail } from '@omne-harness/operation-result'
import type {
  ToolInstanceHost,
  ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import { ToolInstanceHostService } from '@omne-harness/tool-cordis-contract/cordis'
import { createRuntimeAuthorExecution, type RuntimeAuthorExecution } from './runtime-author.ts'
import {
  createRuntimeDependencies,
  createRuntimeStages,
  createRuntimeSourceAccess,
  waitRuntime,
  runtimeUnavailable,
  type LocalToolRuntimeInput,
  type RuntimeCompositionInput,
  type RuntimeEnvironment,
} from './runtime-composition.ts'
import { createRuntimeExecutor } from './runtime-executor.ts'
import { publishRuntimeEnvironment } from './runtime-environments.ts'
import { publishRuntimeFacade } from './runtime-facade.ts'
import { publishRuntimeInstances } from './runtime-instances.ts'
import {
  createRuntimeRecords,
  publishRuntimeRecords,
  type RuntimeRecords,
} from './runtime-records.ts'
import { createLocalToolInstanceHost, createLocalToolInstanceIdentities } from './instance-host.ts'
import type { DeliveryPosition } from './result-delivery.ts'
import { createLocalToolControlSubjects } from './control-subject-adapter.ts'

export type { LocalToolRuntimeInput } from './runtime-composition.ts'
export type { RuntimeAuthorExecution } from './runtime-author.ts'

/** Each returned plugin belongs to its own fiber. All share one durable Tool ordering domain. */
export function createLocalToolRuntimePlugins(given: LocalToolRuntimeInput) {
  const lifetime = new AbortController()
  const resolveSource = createRuntimeSourceAccess({
    store: given.store,
    sources: given.sources,
    access: given.access,
    recovery: given.subjects,
  })
  const input: RuntimeCompositionInput = {
    ...given,
    controlSubjects: createLocalToolControlSubjects({
      ...given.subjects,
      store: given.store,
      qualify: request => given.access.guard.qualify(request),
      commitAttempts: given.configuration.ledgerCommitAttempts,
    }),
    resolveAccess: async wake =>
      (await waitRuntime(() => resolveSource(wake), lifetime.signal)) ??
      runtimeUnavailable('invocation-source'),
  }
  if (input.store.durability !== 'durable')
    throw new TypeError('The production Tool runtime requires a durable store.')
  for (const [key, value] of Object.entries({
    capacity: input.capacity,
    observersPerCall: input.observersPerCall,
    observerQueueFrames: input.observerQueueFrames,
    observerResidenceMs: input.observerResidenceMs,
  }))
    if (!Number.isSafeInteger(value) || value < 1)
      throw new TypeError(`${key}: expected a positive safe integer`)
  let environment: RuntimeEnvironment | null = null
  let records: RuntimeRecords | null = null
  let host: ToolInstanceHost<unknown> | null = null
  let executor: ReturnType<typeof createRuntimeExecutor> | null = null
  let retired = false
  let forwarding: ToolForwardRuntime<unknown> | undefined
  const authorExecution = createRuntimeAuthorExecution(input)
  const stages = createRuntimeStages(input, () => environment)
  const receivers: { current: DeliveryPosition<unknown, ToolMessageContentBlock>['receiver'] } = {
    current: async () =>
      fail({
        kind: 'unavailable',
        dependency: 'toolRuntime',
        diagnostic: 'No original result receiver registry.',
      }),
  }
  const dependencies = (ctx: Context) => {
    if (records === null) throw new Error('Tool records are not ready.')
    return createRuntimeDependencies(
      ctx,
      input,
      stages,
      records,
      () => host,
      wake =>
        !retired &&
        executor !== null &&
        (wake === null ? executor.live() : executor.remember(wake)),
      wake => executor?.rejectAdmission(wake),
      wake => executor?.knows(wake) ?? false,
    )
  }
  const close = async () => {
    retired = true
    forwarding = undefined
    lifetime.abort()
    authorExecution.close()
    await executor?.close()
  }
  // A named type keeps the declaration on RuntimeAuthorExecution; an inferred one would inline
  // exchange-refs types that this member does not depend on.
  const publicAuthorExecution: RuntimeAuthorExecution = {
    scope: authorExecution.scope,
    settle: authorExecution.settle,
  }
  return {
    authorExecution: publicAuthorExecution,
    forwarding: () => forwarding,
    records: {
      name: 'local-tool-records',
      apply(ctx: Context) {
        records ??= createRuntimeRecords(input, stages)
        publishRuntimeRecords(ctx, records)
      },
    },
    instanceHost: {
      name: 'local-tool-instance-host',
      async apply(ctx: Context) {
        if (host !== null || retired)
          throw new Error('The Tool instance host cannot be reinstalled in this composition.')
        const created = await createLocalToolInstanceHost({
          identities: createLocalToolInstanceIdentities(),
          access: input.access.guard,
          resolveAccess: input.resolveAccess,
          capacity: input.capacity,
        })
        if ('failure' in created) throw new Error(`Tool instance host: ${created.failure.kind}`)
        host = created.ok
        const owned = host
        class InstanceHost extends ToolInstanceHostService<unknown> {
          install = owned.install
          schedule = owned.schedule
          publish = owned.publish
          withdraw = owned.withdraw
          directory = owned.directory
        }
        new InstanceHost(ctx)
      },
    },
    instances: {
      name: 'local-tool-instances',
      inject: ['toolPublicationAuthority'],
      apply(ctx: Context) {
        publishRuntimeInstances(ctx, input.access.guard)
      },
    },
    environments: {
      name: 'local-tool-environments',
      inject: { executionEnvironment: { caller: 'integrator' as const } },
      apply(ctx: Context) {
        const current = publishRuntimeEnvironment(ctx, input)
        environment = current
        ctx.effect(() => () => {
          if (environment === current) environment = null
        })
      },
    },
    executor: {
      name: 'local-tool-executor',
      inject: ['toolCommands', 'toolInstanceHost', 'toolClock'],
      apply(ctx: Context) {
        if (executor !== null || retired)
          throw new Error('This Tool executor generation has retired.')
        executor = createRuntimeExecutor({
          ctx,
          settings: input,
          dependencies: dependencies(ctx),
          receiver: consumer => receivers.current(consumer),
        })
        ctx.effect(() => close)
      },
    },
    runtime: {
      name: 'local-tool-runtime',
      inject: ['toolCommands', 'toolReads'],
      apply(ctx: Context) {
        const current = dependencies(ctx)
        forwarding = createToolForwardRuntime(current, current.forwardSource)
        publishRuntimeFacade(ctx, input, current, receivers)
        ctx.effect(() => () => {
          forwarding = undefined
        })
      },
    },
    close,
    diagnostics: () => ({
      retired,
      pendingOutputCustody: authorExecution.pending(),
      retainedAuthorReturns: authorExecution.retainedReturns(),
      executor: executor?.diagnostics() ?? null,
    }),
  }
}
