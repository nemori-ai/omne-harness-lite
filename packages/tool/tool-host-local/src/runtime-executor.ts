import type { Context, Fiber } from '@deepseek-ai/cordis'
import { succeed } from '@omne-harness/operation-result'
import { canonicalDigest, createToolDriver, type ToolDependencies } from '@omne-harness/tool'
import type { DurableEvidence } from '@omne-harness/tool-contract'
import type {
  ToolDriver,
  ToolInstanceHost,
  ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import { createLocalToolResultDelivery } from './result-delivery.ts'
import { createRuntimePublication } from './runtime-publication.ts'
import type { LocalToolRuntimeInput } from './runtime-composition.ts'
import type { ToolEnvironmentValue } from './author-environment.ts'

type Wake = Parameters<ToolInstanceHost<unknown>['schedule']>[0]
type Publication = ReturnType<typeof createRuntimePublication>
type Entry = { wake: Wake; publication: Publication | null; fiber: Fiber | null }

export function createRuntimeExecutor(
  input: Readonly<{
    ctx: Context
    settings: LocalToolRuntimeInput
    dependencies: ToolDependencies<unknown, ToolMessageContentBlock, ToolEnvironmentValue>
    receiver: Parameters<
      typeof createLocalToolResultDelivery<unknown, ToolMessageContentBlock>
    >[0]['position']['receiver']
  }>,
) {
  const { settings, dependencies } = input
  const abort = new AbortController()
  const calls = new Map<string, Entry>()
  const delivery = createLocalToolResultDelivery({
    store: settings.store,
    commands: dependencies.commands,
    reads: dependencies.reads,
    identities: dependencies.operationIdentities,
    access: settings.access.guard,
    position: { access: settings.resolveAccess, receiver: input.receiver },
    capacity: settings.capacity,
    async accountAtFreeze(access) {
      const account = await dependencies.reads.account(access)
      return 'failure' in account &&
        account.failure.kind === 'invalid' &&
        account.failure.field === 'call' &&
        account.failure.reason === 'no-account'
        ? succeed(null)
        : account
    },
  })
  const driver = createToolDriver(dependencies, {
    stepsPerRun: settings.configuration.driverStepsPerRun ?? 16,
    retryDelayMs: settings.configuration.driverRetryDelayMs ?? 1000,
  })
  const keyOf = (wake: Wake) => canonicalDigest([wake.tenant, wake.call])
  const remember = (wake: Wake): boolean => {
    const key = keyOf(wake)
    if (calls.has(key)) return !abort.signal.aborted
    if (abort.signal.aborted || calls.size >= settings.capacity) return false
    calls.set(key, { wake, publication: null, fiber: null })
    return true
  }
  const publish = (
    step: Parameters<ToolDriver<unknown>['run']>[0],
    recovery: Extract<
      Awaited<ReturnType<typeof dependencies.commands.loadRecovery>>,
      { ok: unknown }
    >,
    entry: Entry,
  ) => {
    const original = recovery.ok
    if (
      original.execution === null ||
      original.execution.instance !== step.instance ||
      entry.fiber !== null ||
      !['live', 'ended'].includes(original.state.execution.kind)
    )
      return
    const execution = original.execution
    const authority: DurableEvidence = original.state.source
    entry.fiber = input.ctx.plugin({
      name: `tool-instance-${canonicalDigest(execution)}`,
      inject: ['toolInstances', 'toolPublicationAuthority'],
      async apply(ctx: Context) {
        const publication = createRuntimePublication({
          execution,
          access: settings.access.guard,
          reads: dependencies.reads,
          capacity: settings.observersPerCall,
          bufferBytes: settings.configuration.observerBufferBytes,
          bufferFrames: settings.observerQueueFrames,
          residenceMs: settings.observerResidenceMs,
        })
        entry.publication = publication
        await publication.refresh(step, original.admission)
        const hostReceipt = await dependencies.instances.publish(execution, publication.handle)
        if ('failure' in hostReceipt)
          throw new Error(`Tool instance publication: ${hostReceipt.failure.kind}`)
        ctx.effect(() => async () => {
          publication.close()
          if (entry.publication === publication) entry.publication = null
          await dependencies.instances.withdraw(hostReceipt.ok)
        })
        const registered = await ctx.toolInstances.register({
          publication: [execution, publication.handle],
          authority,
        })
        if ('failure' in registered)
          throw new Error(`Tool directory publication: ${registered.failure.kind}`)
      },
    })
  }
  const installed = dependencies.instances.install({
    async run(step) {
      if (!remember(step)) return
      const entry = calls.get(keyOf(step))
      if (entry === undefined) return
      const before = await dependencies.commands.loadRecovery(step)
      if ('failure' in before) return
      // A new executor cannot attach an old execution by resolving the latest providers.
      if (before.ok.execution !== null && before.ok.execution.instance !== step.instance) return
      await driver.run(step)
      if (abort.signal.aborted) return
      const after = await dependencies.commands.loadRecovery(step)
      if ('failure' in after) return
      publish(step, after, entry)
      await entry.publication?.refresh(step, after.ok.admission)
      // The delivery worker owns its own wait. It never occupies the host's driver queue.
      void delivery
        .drive({ ...step, signal: abort.signal })
        .then(async delivered => {
          if (
            'failure' in delivered ||
            delivered.ok.pending !== 0 ||
            after.ok.state.phase !== 'settled'
          )
            return
          const current = await dependencies.commands.loadRecovery(step)
          if (
            'ok' in current &&
            current.ok.tasks.length === 0 &&
            calls.get(keyOf(step)) === entry
          ) {
            // Keep the published final route until executor retirement; it does not need retries.
            completed.add(keyOf(step))
          }
        })
        .catch(() => undefined)
    },
  })
  const completed = new Set<string>()
  const retryMs = settings.configuration.driverRetryDelayMs ?? 1000
  const timer = setInterval(() => {
    for (const [key, entry] of calls) {
      if (completed.has(key)) continue
      void dependencies.instances.schedule(entry.wake).catch(() => undefined)
    }
  }, retryMs)
  timer.unref()
  let closing: Promise<void> | null = null
  return {
    remember,
    live: () => !abort.signal.aborted,
    diagnostics: () => ({
      knownCalls: calls.size,
      completed: completed.size,
      retired: abort.signal.aborted,
    }),
    close(): Promise<void> {
      if (closing !== null) return closing
      abort.abort()
      clearInterval(timer)
      for (const entry of calls.values()) entry.publication?.close()
      closing = Promise.all([
        installed.release(),
        delivery.close(),
        ...[...calls.values()].flatMap(entry =>
          entry.fiber === null ? [] : [entry.fiber.dispose()],
        ),
      ]).then(() => undefined)
      return closing
    },
  }
}
