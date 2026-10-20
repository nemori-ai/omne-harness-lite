import { randomUUID } from 'node:crypto'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  decodeDispatchId,
  decodeModelOperationId,
  type ModelCommands,
  type ModelDriver,
  type ModelDriveInput,
  type ModelFailure,
} from '@omne-harness/model-contract'

type Prepare = Parameters<ModelCommands<unknown>['prepareDispatch']>[0]
type PendingPrepare<P> = Readonly<{ claim: ModelDriveInput<P>; prepare: Prepare }>
const blocked = (diagnostic: string) => ({
  failure: { kind: 'unavailable', dependency: 'model-runtime', diagnostic } as const,
})
function generated<T>(value: { ok: T } | { failure: unknown }): T {
  if ('ok' in value) return value.ok
  throw new Error('invalid generated Model identity')
}
export function createFirstDispatchDriver<P>(commands: ModelCommands<P>): ModelDriver<P> {
  const pending = new Map<string, PendingPrepare<P>>()
  const running = new Set<string>()
  return {
    async drive(original, signal) {
      const { principal, tenant: scope, call, instance, operation, continuity } = original
      const input = {
        principal,
        tenant: scope,
        ...structuredClone({ call, instance, operation, continuity }),
      }
      if (signal.aborted) return { ok: undefined }
      const initial = await commands.loadRecovery(input)
      if ('failure' in initial) return initial
      if (signal.aborted) return { ok: undefined }
      const tenant = tenantCodec.encode(input.tenant)
      if (!tenant.ok) return { failure: { kind: 'denied', action: 'tenant' } }
      const key = JSON.stringify([tenant.value, input.call])
      if (running.has(key)) return blocked('first-dispatch-already-running')
      running.add(key)
      try {
        const attempt = pending.get(key)
        if (
          attempt &&
          (attempt.claim.operation !== input.operation ||
            attempt.claim.instance !== input.instance ||
            (['owner', 'record', 'revision', 'digest'] as const).some(
              field => attempt.claim.continuity[field] !== input.continuity[field],
            ))
        )
          return blocked('pending-prepare-requires-original-claim')
        for (const operation of initial.ok.unresolved) {
          const known = await commands.query({ ...input, operation })
          if ('failure' in known) return known
          if (known.ok.kind === 'unknown') return { failure: { kind: 'commit-unknown', operation } }
          if (signal.aborted) return { ok: undefined }
          if (operation !== input.operation && operation !== attempt?.prepare.operation)
            return blocked('unresolved-operation-without-original-input')
        }
        const execution = await commands.claim(input)
        if ('failure' in execution) return execution
        if (signal.aborted) return { ok: undefined }
        const recovery = await commands.loadRecovery(input)
        if ('failure' in recovery) return recovery
        if (signal.aborted) return { ok: undefined }
        if (attempt && execution.ok.generation !== attempt.prepare.generation)
          return blocked('pending-prepare-generation-changed')
        const records = await commands.dispatches(input)
        if ('failure' in records) return records
        if (attempt) {
          const known = await commands.query({ ...input, operation: attempt.prepare.operation })
          if ('failure' in known) return known
          if (known.ok.kind === 'unknown')
            return { failure: { kind: 'commit-unknown', operation: attempt.prepare.operation } }
          if (known.ok.kind === 'committed') {
            if (!records.ok.some(record => record.dispatch === attempt.prepare.dispatch))
              return blocked('committed-prepare-without-dispatch')
            pending.delete(key)
            return { ok: undefined }
          }
        }
        if (signal.aborted) return { ok: undefined }
        if (
          records.ok.length ||
          recovery.ok.state.control.kind !== 'none' ||
          recovery.ok.state.phase === 'settled'
        )
          return { ok: undefined }
        const prepare = attempt?.prepare ?? {
          ...execution.ok,
          expected: recovery.ok.state.revision,
          operation: generated(decodeModelOperationId(`mop_${randomUUID()}`)),
          dispatch: generated(decodeDispatchId(`mdisp_${randomUUID()}`)),
          supplier: structuredClone(recovery.ok.request.suppliers[0]),
          policyDecision: null,
        }
        pending.set(key, { claim: input, prepare })
        const result = await commands.prepareDispatch(prepare)
        if ('ok' in result || definitelyRefused(result.failure)) pending.delete(key)
        return 'failure' in result ? result : { ok: undefined }
      } finally {
        running.delete(key)
      }
    },
  }
}
function definitelyRefused(failure: ModelFailure): boolean {
  return failure.kind !== 'commit-unknown' && failure.kind !== 'unavailable'
}
