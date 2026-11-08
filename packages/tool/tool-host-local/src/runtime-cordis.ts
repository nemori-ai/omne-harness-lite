import { createToolForwardRuntime } from '@omne-harness/tool'
import type { ToolForwardRuntime } from '@omne-harness/tool-contract/provider'
import type { Context } from '@deepseek-ai/cordis'
import { fail, succeed } from '@omne-harness/operation-result'
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
  const bodyUnavailable = (operation: string) =>
    Promise.resolve(
      fail({
        kind: 'unavailable' as const,
        operation,
        reason: 'The body writer records are unavailable.',
      }),
    )
  const authorExecution = createRuntimeAuthorExecution({
    ...input,
    bodyWrites: {
      begin: request =>
        records?.ledger.bodyWrites.begin(request) ?? bodyUnavailable(request.operation),
      append: request =>
        records?.ledger.bodyWrites.append(request) ?? bodyUnavailable(request.operation),
      seal: request =>
        records?.ledger.bodyWrites.seal(request) ?? bodyUnavailable(request.operation),
      inspect: request => records?.ledger.bodyWrites.inspect(request) ?? bodyUnavailable('inspect'),
      close: request =>
        records?.ledger.bodyWrites.close(request) ?? bodyUnavailable(request.operation),
      reconcile: request =>
        records?.ledger.bodyWrites.reconcile(request) ?? bodyUnavailable('reconcile'),
    },
    custody: {
      preserve: request =>
        records === null
          ? Promise.resolve(runtimeUnavailable('toolRawCustody'))
          : records.ledger.rawCustody.preserve(request),
      inspect: request =>
        records === null
          ? Promise.resolve(runtimeUnavailable('toolRawCustody'))
          : records.ledger.rawCustody.inspect(request),
    },
    finalCustody: {
      preserveFinal: request =>
        records === null
          ? Promise.resolve(runtimeUnavailable('toolFinalCustody'))
          : records.ledger.finalCustody.preserveFinal(request),
    },
  })
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
      (wake, purpose) =>
        !retired &&
        executor !== null &&
        (wake === null ? executor.live() : executor.remember(wake, purpose)),
      wake => executor?.rejectAdmission(wake),
      wake => executor?.knows(wake) ?? false,
    )
  }
  const close = async () => {
    retired = true
    forwarding = undefined
    lifetime.abort()
    const bodyClose = await authorExecution.close()
    await executor?.close()
    if ('failure' in bodyClose)
      throw new Error(
        `Tool body custody remains unresolved during retirement: ${bodyClose.failure.kind}`,
      )
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
    async forwardedResult(request: Parameters<typeof input.sources.forwardedResult>[0]) {
      if (retired) return runtimeUnavailable('forwarded-result')
      const answer = await input.sources.forwardedResult(request)
      return retired ? runtimeUnavailable('forwarded-result') : answer
    },
    async recoverBodies(wake: Parameters<ToolInstanceHost<unknown>['schedule']>[0]) {
      if (retired || records === null) return runtimeUnavailable('tool-body-recovery')
      const access = await input.resolveAccess(wake)
      if ('failure' in access) return access
      const recovery = await records.ledger.commands.loadRecovery(access.ok)
      if ('failure' in recovery) return recovery
      if (recovery.ok.state.phase === 'settled' || recovery.ok.start === null)
        return succeed({ queued: false })
      if (retired || executor === null || host === null)
        return runtimeUnavailable('tool-body-recovery')
      const known = executor.knows(wake)
      if (!executor.remember(wake, 'body-recovery'))
        return runtimeUnavailable('tool-body-recovery-capacity')
      const scheduled = await host.schedule(wake)
      if ('failure' in scheduled && !known) executor.rejectAdmission(wake)
      return scheduled
    },
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
          bodyWrites: {
            reconcile: request =>
              records?.ledger.bodyWrites.reconcile(request) ?? bodyUnavailable('reconcile'),
          },
          resultDelivery: {
            read: request =>
              records === null || retired
                ? runtimeUnavailable('toolResultDelivery')
                : records.ledger.delivery.read(request),
          },
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
      pendingBodyScopes: authorExecution.pendingBodyScopes(),
      executor: executor?.diagnostics() ?? null,
    }),
  }
}
