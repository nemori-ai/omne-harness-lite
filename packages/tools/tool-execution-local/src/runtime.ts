import { createHash } from 'node:crypto'
import { setTimeout } from 'node:timers/promises'
import { copyJsonValue, type JsonValue } from '@omne-harness-lite/content-blocks'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { readRunnerChain } from '@omne-harness-lite/loop-extension-runner'
import type {
  ToolRuntimeConfig,
  ToolRuntimeDependencies,
  ToolRuntimeInstance,
  ToolRuntimeOperations,
} from '@omne-harness-lite/tool-execution-runtime'
import { createExecutionOwner } from './execution-owner.ts'
import { createResultPreparation } from './execution-result.ts'
import { createRuntimeJournal } from './runtime-journal.ts'
import { recoverExecutions } from './runtime-recovery.ts'
import { jsonObject } from './json-values.ts'

function captureRuntimeConfiguration(supplied: ToolRuntimeConfig): ToolRuntimeConfig {
  const copied = copyJsonValue(supplied)
  if ('failed' in copied) throw new TypeError('ordinary tool runtime configuration required')
  const value = copied.ok
  if (
    !jsonObject(value) ||
    Object.keys(value).sort().join(',') !== 'frameQueueBytes,resultStorage,tailRetry'
  )
    throw new TypeError('ordinary tool runtime configuration required')
  const policy = value.tailRetry
  if (
    !jsonObject(policy) ||
    Object.keys(policy).sort().join(',') !== 'attempts,maxDelayMs,minDelayMs'
  )
    throw new TypeError('ordinary retry configuration required')
  return copied.ok as unknown as ToolRuntimeConfig
}

function requireRuntimeFrameBudget(config: ToolRuntimeConfig): void {
  if (!Number.isSafeInteger(config.frameQueueBytes) || config.frameQueueBytes < 0)
    throw new TypeError('invalid tool runtime policy')
}

function requireRuntimeTailRetry(config: ToolRuntimeConfig): void {
  if (
    !Number.isSafeInteger(config.tailRetry?.attempts) ||
    config.tailRetry.attempts < 1 ||
    !Number.isFinite(config.tailRetry.minDelayMs) ||
    config.tailRetry.minDelayMs < 0 ||
    !Number.isFinite(config.tailRetry.maxDelayMs) ||
    config.tailRetry.maxDelayMs < config.tailRetry.minDelayMs
  )
    throw new TypeError('invalid tool runtime policy')
}

/** Independent root factory. Construction dependencies never enter persisted input or tool dependencies. */
export function createToolRuntime(
  supplied: ToolRuntimeConfig,
  dependencies: ToolRuntimeDependencies,
): ToolRuntimeInstance {
  const config = captureRuntimeConfiguration(supplied)
  requireRuntimeFrameBudget(config)
  requireRuntimeTailRetry(config)
  if (typeof config.resultStorage !== 'string' || config.resultStorage.length === 0)
    throw new TypeError('invalid tool runtime policy')
  const retry = async (attempt: number) => {
    const delay = Math.min(
      config.tailRetry.maxDelayMs,
      config.tailRetry.minDelayMs * 2 ** Math.min(attempt, 30),
    )
    if (delay > 0) await setTimeout(delay)
  }
  const journal = createRuntimeJournal(dependencies)
  let state: 'recovering' | 'ready' | 'failed' | 'closed' = 'recovering'
  const owner = createExecutionOwner({
    ...dependencies,
    journal,
    attempts: config.tailRetry.attempts,
    frameQueueBytes: config.frameQueueBytes,
    retry,
    async selectChain(request) {
      const pass = `tool-after-${createHash('sha256')
        .update(
          JSON.stringify([
            request.scope.tenant,
            request.scope.session,
            request.origin,
            request.call.callId,
          ]),
        )
        .digest('hex')}`
      const held = await dependencies.runnerHost.acquireReplay(
        {
          manifest: request.scope.session,
          anchor: pass,
          run: request.origin.run,
          position: 'after_action',
          dimension: { scope: 'each' },
          subject: { callId: request.call.callId, outcome: 'completed' },
        },
        new AbortController().signal,
      )
      if ('failure' in held) return 'unavailable'
      try {
        if (
          !held.isActive() ||
          held.binding.session !== request.scope.session ||
          !tenantIdEquals(held.binding.tenant, request.scope.tenant) ||
          held.binding.logGeneration !== dependencies.backing.ownerGeneration
        )
          return 'unavailable'
        const chain = await readRunnerChain({
          session: request.scope.session,
          binding: held.binding,
          sources: held.sources,
        })
        if (!Array.isArray(chain) || !held.isActive()) return 'unavailable'
        const captured = copyJsonValue(chain)
        return 'failed' in captured ? 'unavailable' : { chain: captured.ok, pass }
      } finally {
        held.release()
      }
    },
    async bindWriter(request, selected) {
      const storage = selected?.definition.needs?.attachmentStorage ?? config.resultStorage
      if (selected?.definition.needs?.attachmentStorage) {
        const readable = await dependencies.results.available(
          request.access,
          request.scope,
          storage,
        )
        if (readable.kind !== 'available') return 'unavailable'
      }
      const bound = await dependencies.results.bindWriter(
        request.access,
        { ...request.scope, callId: request.call.callId },
        storage,
      )
      return bound.kind === 'bound' ? bound.writer : 'unavailable'
    },
    prepareDelivery(request) {
      return createResultPreparation({
        ...request,
        ...(request.terminal.outcome === 'interrupted'
          ? { interruptionCode: 'user_interrupted' as const }
          : {}),
      })(request.terminal)
    },
  })
  const recover = () =>
    recoverExecutions({ dependencies, journal, attempts: config.tailRetry.attempts, retry })
  const ready = recover().then(
    () => {
      if (state === 'recovering') state = 'ready'
    },
    error => {
      if (state !== 'closed') state = 'failed'
      throw error
    },
  )
  // Root callers may await ready later; retaining the original rejection avoids an unhandled rejection.
  void ready.catch(() => {})
  const unavailable = () => ({
    kind: 'rejected' as const,
    reason:
      state === 'closed'
        ? ('ownerStopped' as const)
        : state === 'recovering'
          ? ('runtimeNotReady' as const)
          : ('runtimeUnavailable' as const),
  })
  const operations = Object.freeze<ToolRuntimeOperations>({
    submit(request) {
      return state === 'ready' ? owner.operations.submit(request) : Promise.resolve(unavailable())
    },
    acquire(access, ref) {
      return state === 'ready'
        ? owner.operations.acquire(access, ref)
        : Promise.resolve(unavailable())
    },
    stop(access, ref, reason) {
      return state === 'ready'
        ? owner.operations.stop(access, ref, reason)
        : Promise.resolve('unavailable')
    },
    answer(access, ref, waitIndex, answer: JsonValue) {
      return state === 'ready'
        ? owner.operations.answer(access, ref, waitIndex, answer)
        : Promise.resolve(state === 'closed' ? 'ownerStopped' : 'unavailable')
    },
  })
  let closing: Promise<void> | undefined
  return Object.freeze({
    operations,
    ready,
    idle: owner.idle,
    close() {
      if (closing) return closing
      state = 'closed'
      const task = (async () => {
        try {
          await ready
        } catch {
          await recover()
        }
        await owner.close()
      })()
      closing = task
      void task.catch(() => {
        closing = undefined
      })
      return task
    },
  })
}
