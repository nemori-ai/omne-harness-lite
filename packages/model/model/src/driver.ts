import { randomUUID } from 'node:crypto'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  decodeDispatchId,
  decodeOutputCursor,
  type ModelCommands,
  type ModelDriver,
  type ModelDriveInput,
  type ModelFailure,
  type ModelInstanceHost,
  type ModelClock,
  type ModelSendBoundary,
  type SendDemand,
  type Publication,
} from '@omne-harness/model-contract'
import { createObservation } from './observation.ts'
import { createReceiver, newOperation } from './receive.ts'

type Prepare = Parameters<ModelCommands<unknown>['prepareDispatch']>[0]
type Stage<P> =
  | { kind: 'idle' }
  | { kind: 'prepare'; input: Prepare; pending: boolean }
  | { kind: 'send'; demand: SendDemand<P> }
  | { kind: 'receive'; receiver: ReturnType<typeof createReceiver<P>> }
  | { kind: 'done' }
  | { kind: 'failed'; failure: ModelFailure }
type Activity<P> = {
  claim: ModelDriveInput<P>
  view: ReturnType<typeof createObservation<P>>
  publication: Publication
  stage: Stage<P>
}
const blocked = (diagnostic: string) => ({
  failure: { kind: 'unavailable', dependency: 'model-runtime', diagnostic } as const,
})
function generated<T>(value: { ok: T } | { failure: unknown }): T {
  if ('ok' in value) return value.ok
  throw new Error('invalid generated Model identity')
}
export function createModelDriver<P>(
  commands: ModelCommands<P>,
  instances: ModelInstanceHost<P>,
  clock: ModelClock,
  configuration: {
    observerBufferBytes: number
    observerCheckIntervalMs: number
    outputBatchBytes: number
    outputBatchDelayMs: number
  },
  send: ModelSendBoundary<P>,
) {
  const activities = new Map<string, Activity<P>>()
  const running = new Set<string>()
  function keyOf(input: Pick<ModelDriveInput<P>, 'tenant' | 'call'>) {
    const tenant = tenantCodec.encode(input.tenant)
    return tenant.ok ? JSON.stringify([tenant.value, input.call]) : null
  }
  async function refresh(input: Pick<ModelDriveInput<P>, 'tenant' | 'call'>) {
    const key = keyOf(input)
    const active = key && activities.get(key)
    if (!active) return
    const epoch = active.view.epoch()
    const current = await commands.loadRecovery(active.claim)
    if ('ok' in current) active.view.refresh(current.ok.state, epoch)
  }
  const driver: ModelDriver<P> = {
    async drive(original, signal) {
      const { principal, tenant, call, instance, operation, continuity } = original
      const input = {
        principal,
        tenant,
        ...structuredClone({ call, instance, operation, continuity }),
      }
      if (signal.aborted) return { ok: undefined }
      const initial = await commands.loadRecovery(input)
      if ('failure' in initial) return initial
      if (signal.aborted) return { ok: undefined }
      const key = keyOf(input)
      if (!key) return { failure: { kind: 'denied', action: 'tenant' } }
      if (running.has(key)) return blocked('drive-already-running')
      running.add(key)
      try {
        let active = activities.get(key)
        const previous = active
        if (
          previous &&
          previous.stage.kind !== 'idle' &&
          previous.stage.kind !== 'done' &&
          previous.stage.kind !== 'failed' &&
          (previous.claim.operation !== input.operation ||
            previous.claim.instance !== input.instance ||
            (['owner', 'record', 'revision', 'digest'] as const).some(
              field => previous.claim.continuity[field] !== input.continuity[field],
            ))
        )
          return blocked('pending-work-requires-original-claim')
        // Each owner replays its own fixed write. Sender-private operations must reach sender.
        for (const unresolved of initial.ok.unresolved) {
          const owned =
            unresolved === input.operation ||
            (active?.stage.kind === 'prepare' && unresolved === active.stage.input.operation) ||
            active?.stage.kind === 'send' ||
            (active?.stage.kind === 'receive' &&
              unresolved === active.stage.receiver.pendingOperation())
          if (owned) continue
          const known = await commands.query({ ...input, operation: unresolved })
          if ('failure' in known) return known
          if (known.ok.kind === 'unknown')
            return { failure: { kind: 'commit-unknown', operation: unresolved } }
          return blocked('unresolved-operation-without-original-input')
        }
        const execution = await commands.claim(input)
        if ('failure' in execution) return execution
        if (signal.aborted) return { ok: undefined }
        const recovery = await commands.loadRecovery(input)
        if ('failure' in recovery) return recovery
        const records = await commands.dispatches(input)
        if ('failure' in records) return records
        if (!active || active.view.handle.instance !== input.instance) {
          const view = createObservation({
            access: input,
            instance: input.instance,
            directory: instances.directory,
            clock,
            bufferBytes: configuration.observerBufferBytes,
            checkIntervalMs: configuration.observerCheckIntervalMs,
            initial:
              !records.ok.length && !recovery.ok.unresolved.length
                ? {
                    call,
                    cursor: generated(decodeOutputCursor('0')),
                    blocks: [],
                    state: recovery.ok.state,
                  }
                : null,
          })
          const published = await instances.publish(execution.ok, view.handle)
          if ('failure' in published) return published
          active = {
            claim: input,
            view,
            publication: published.ok,
            stage: records.ok.length ? { kind: 'done' } : { kind: 'idle' },
          }
          activities.set(key, active)
        }
        if (active.stage.kind === 'idle') {
          if (
            records.ok.length ||
            recovery.ok.state.control.kind !== 'none' ||
            recovery.ok.state.phase === 'settled'
          )
            return { ok: undefined }
          active.stage = {
            kind: 'prepare',
            pending: false,
            input: {
              ...execution.ok,
              expected: recovery.ok.state.revision,
              operation: newOperation(),
              dispatch: generated(decodeDispatchId(`mdisp_${randomUUID()}`)),
              supplier: structuredClone(recovery.ok.request.suppliers[0]),
              policyDecision: null,
            },
          }
        }
        if (active.stage.kind === 'prepare') {
          const entry = active.stage
          if (execution.ok.generation !== entry.input.generation)
            return blocked('pending-prepare-generation-changed')
          let committed = false
          if (entry.pending) {
            const known = await commands.query({ ...input, operation: entry.input.operation })
            if ('failure' in known) return known
            committed = known.ok.kind === 'committed'
            if (known.ok.kind === 'unknown')
              return { failure: { kind: 'commit-unknown', operation: entry.input.operation } }
          }
          entry.pending = true
          const prepared = await commands.prepareDispatch(entry.input)
          if ('failure' in prepared) {
            if (!committed && definitelyRefused(prepared.failure)) active.stage = { kind: 'idle' }
            return prepared
          }
          active.stage = {
            kind: 'send',
            demand: {
              principal,
              tenant,
              call,
              execution: execution.ok,
              dispatch: entry.input.dispatch,
              request: recovery.ok.request,
              supplier: entry.input.supplier,
              consumer: recovery.ok.state.consumer,
              initiator: recovery.ok.initiator,
            },
          }
          await refresh(input)
        }
        if (active.stage.kind === 'send') {
          const demand = active.stage.demand
          const sent = await send.send(demand, signal)
          await refresh(input)
          if (sent.kind === 'unknown') return blocked(sent.diagnostic)
          if (sent.kind === 'not-started') {
            active.stage = { kind: 'failed', failure: sent.failure }
            return { failure: sent.failure }
          }
          const view = active.view
          active.stage = {
            kind: 'receive',
            receiver: createReceiver({
              commands,
              clock,
              demand,
              window: sent.window,
              facts: sent.facts,
              batchBytes: configuration.outputBatchBytes,
              batchDelayMs: configuration.outputBatchDelayMs,
              beginContent: () => view.beginContent(),
              rejectContent: () => view.rejectContent(),
              confirm: snapshot => view.confirm(snapshot),
              refresh: () => refresh(input),
            }),
          }
        }
        if (active.stage.kind === 'receive') return active.stage.receiver.run(signal)
        if (active.stage.kind === 'failed') return { failure: active.stage.failure }
        return { ok: undefined }
      } catch {
        return blocked('drive-unconfirmed')
      } finally {
        running.delete(key)
      }
    },
  }
  return { driver, refresh }
}
function definitelyRefused(failure: ModelFailure): boolean {
  return failure.kind !== 'commit-unknown' && failure.kind !== 'unavailable'
}
