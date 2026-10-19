import type {
  ExecutionRef,
  ModelOperationId,
  ModelSendBoundary,
  ModelTransport,
  SendDemand,
  SendResult,
  TransportFact,
  MaterializedTransport,
  PreparedTransport,
} from '@omne-harness/model-contract'
import { MemoryState } from './state.ts'
import type { ModelCommands } from '@omne-harness/model-contract'
import { digest, tenantKey, unavailable } from './value.ts'

export type TestSendPlan<Script> = Readonly<{
  execution: ExecutionRef
  dispatch: SendDemand<never>['dispatch']
  admission: ModelOperationId
  materializationOperation: ModelOperationId
  windowOperation: ModelOperationId
  sendOperation: ModelOperationId
  window: string
  script: Script
}>
export type TransportCounters = Readonly<{
  prepare: number
  materialize: number
  start: number
  closePrepared: number
  closeMaterialized: number
}>
export type ScriptFactory<Script> = (script: Script) => {
  transport: ModelTransport
  counts(): TransportCounters
}
export function createMemorySend<P, Script>(
  store: MemoryState<P>,
  commands: ModelCommands<P>,
  scripts: readonly TestSendPlan<Script>[],
  makeTransport: ScriptFactory<Script>,
) {
  const plans = new Map<string, TestSendPlan<Script>>()
  const counts = new Map<string, () => TransportCounters>()
  const releaseFailures = new Map<string, string[]>()
  const attempts = new Map<string, { fingerprint: string }>()
  function key(input: Pick<SendDemand<P>, 'tenant' | 'call' | 'dispatch'>): string {
    const tenant = tenantKey(input.tenant)
    if (typeof tenant !== 'string') throw new TypeError('send plan requires a valid tenant')
    return `${tenant}/${input.call}/${input.dispatch}`
  }
  for (const plan of scripts) {
    const id = key({ ...plan.execution, dispatch: plan.dispatch })
    if (plans.has(id)) throw new TypeError('duplicate send plan')
    plans.set(id, {
      ...plan,
      execution: { ...plan.execution },
      script: structuredClone(plan.script),
    })
  }
  async function perform(
    input: SendDemand<P>,
    signal: AbortSignal,
    plan: TestSendPlan<Script>,
  ): Promise<SendResult> {
    const source = makeTransport(plan.script)
    counts.set(key(input), source.counts)
    let prepared: PreparedTransport | undefined
    let materialized: MaterializedTransport | undefined
    let started = false
    let closed: Promise<void> | undefined
    function close(): Promise<void> {
      closed ??= (async () => {
        try {
          await materialized?.close()
        } finally {
          await prepared?.close()
        }
      })().catch(error => {
        releaseFailures.set(key(input), ['transport-resource-close-failed'])
        throw error
      })
      return closed
    }
    const notStarted = (diagnostic: string): SendResult => ({
      kind: 'not-started',
      failure: unavailable('model-send', diagnostic),
    })
    async function currentRevision() {
      const result = await commands.recall({ ...input, admission: plan.admission })
      return 'ok' in result && result.ok.kind === 'found'
        ? { ok: result.ok.state.revision }
        : 'failure' in result
          ? result
          : { failure: unavailable('model-send', 'original-admission-unavailable') }
    }
    try {
      if (signal.aborted) return notStarted('cancelled-before-prepare')
      const preparation = await source.transport.prepare(input.request, input.supplier)
      if ('failure' in preparation) return { kind: 'not-started', failure: preparation.failure }
      prepared = preparation.ok
      const conversion = await prepared.materialize(signal)
      if ('failure' in conversion) return { kind: 'not-started', failure: conversion.failure }
      materialized = conversion.ok
      if (signal.aborted) return notStarted('cancelled-before-materialization-commit')
      const revision = await currentRevision()
      if ('failure' in revision) return { kind: 'not-started', failure: revision.failure }
      const materialization = await commands.recordMaterialization({
        ...input.execution,
        operation: plan.materializationOperation,
        expected: revision.ok,
        dispatch: input.dispatch,
        receipt: materialized.receipt,
      })
      if ('failure' in materialization)
        return materialization.failure.kind === 'commit-unknown'
          ? {
              kind: 'unknown',
              dispatch: input.dispatch,
              diagnostic: 'materialization-commit-unknown',
            }
          : { kind: 'not-started', failure: materialization.failure }
      const window = await commands.openReceiveWindow({
        ...input.execution,
        operation: plan.windowOperation,
        expected: materialization.ok.revision,
        dispatch: input.dispatch,
        window: plan.window,
      })
      if ('failure' in window)
        return window.failure.kind === 'commit-unknown'
          ? {
              kind: 'unknown',
              dispatch: input.dispatch,
              diagnostic: 'receive-window-commit-unknown',
            }
          : { kind: 'not-started', failure: window.failure }
      const stream = store.startSend(input, materialized, signal)
      if ('failure' in stream) {
        if (
          stream.failure.kind === 'unavailable' &&
          stream.failure.diagnostic === 'transport-start-unknown'
        ) {
          started = true
          await close()
          return {
            kind: 'unknown',
            dispatch: input.dispatch,
            diagnostic: 'transport-start-unknown',
          }
        }
        return { kind: 'not-started', failure: stream.failure }
      }
      started = true
      const recorded = await commands.recordSend({
        ...input.execution,
        operation: plan.sendOperation,
        expected: window.ok,
        dispatch: input.dispatch,
        state: 'started',
      })
      if ('failure' in recorded) {
        await close()
        return {
          kind: 'unknown',
          dispatch: input.dispatch,
          diagnostic: 'started-record-unconfirmed',
        }
      }
      const iterator = stream.ok[Symbol.asyncIterator]()
      const abort = () => {
        void (async () => {
          try {
            await iterator.return?.()
          } finally {
            await close()
          }
        })().catch(() => {
          releaseFailures.set(key(input), ['cancel-release-failed'])
        })
      }
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
      const finish = async () => {
        signal.removeEventListener('abort', abort)
        await close()
      }
      const facts: AsyncIterable<TransportFact> = {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              try {
                const result = await iterator.next()
                if (result.done) await finish()
                return result
              } catch (error) {
                await finish()
                throw error
              }
            },
            async return() {
              try {
                await iterator.return?.()
              } finally {
                await finish()
              }
              return { done: true, value: undefined }
            },
            async throw(error: unknown) {
              try {
                if (iterator.throw) return await iterator.throw(error)
                throw error
              } finally {
                await finish()
              }
            },
          }
        },
      }
      return { kind: 'started', facts }
    } catch {
      if (started) {
        try {
          await close()
        } catch {
          releaseFailures.set(key(input), ['transport-resource-close-failed'])
        }
        return {
          kind: 'unknown',
          dispatch: input.dispatch,
          diagnostic: 'transport-start-or-record-failed',
        }
      }
      return notStarted('transport-prepare-failed')
    } finally {
      if (!started) await close()
    }
  }
  const send: ModelSendBoundary<P> = {
    send(input, signal) {
      const keyResult = store.identity(input)
      if (typeof keyResult !== 'string')
        return Promise.resolve({ kind: 'not-started', failure: keyResult })
      const authorized = store.exclusive(() =>
        store.read(input, 'send', call => {
          const failure = store.execution(input.execution, call)
          return failure ? { failure } : { ok: true }
        }),
      )
      if ('failure' in authorized)
        return Promise.resolve({ kind: 'not-started', failure: authorized.failure })
      const id = key(input)
      const plan = plans.get(id)
      if (
        !plan ||
        digest({ instance: plan.execution.instance, generation: plan.execution.generation }) !==
          digest({ instance: input.execution.instance, generation: input.execution.generation })
      )
        return Promise.resolve({
          kind: 'not-started',
          failure: unavailable('model-send', 'no-plan'),
        })
      const fingerprint = digest({
        execution: { instance: input.execution.instance, generation: input.execution.generation },
        request: input.request,
        supplier: input.supplier,
        consumer: input.consumer,
        initiator: input.initiator,
      })
      const previous = attempts.get(id)
      if (previous)
        return Promise.resolve(
          previous.fingerprint === fingerprint
            ? {
                kind: 'unknown',
                dispatch: input.dispatch,
                diagnostic: 'original-send-already-attempted',
              }
            : {
                kind: 'not-started',
                failure: { kind: 'invalid', field: 'dispatch', reason: 'send-input-conflict' },
              },
        )
      const result = perform(input, signal, plan)
      attempts.set(id, { fingerprint })
      return result
    },
  }
  return {
    send,
    control: {
      failures(input: Pick<SendDemand<P>, 'tenant' | 'call' | 'dispatch'>) {
        return [...(releaseFailures.get(key(input)) ?? [])]
      },
      counts(input: Pick<SendDemand<P>, 'tenant' | 'call' | 'dispatch'>) {
        return (
          counts.get(key(input))?.() ?? {
            prepare: 0,
            materialize: 0,
            start: 0,
            closePrepared: 0,
            closeMaterialized: 0,
          }
        )
      },
    },
  }
}
