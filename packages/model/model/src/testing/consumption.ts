import { checkedEvidence } from './value.ts'
import type {
  AckReceipt,
  CustodyState,
  ModelCommands,
  ReadStart,
} from '@omne-harness/model-contract'
import { decodeReadId, decodeResultVersion } from '@omne-harness/model-contract'
import {
  MemoryState,
  authFailure,
  bump,
  missingReceipt,
  unresolved,
  type MemoryCall,
} from './state.ts'
import { invalid, readId } from './value.ts'

function expireReads(call: MemoryCall, now: () => string, idleMs: number): void {
  for (const read of call.reads.values()) {
    if (
      read.state.kind === 'reading' &&
      Date.parse(now()) - Date.parse(read.lastProgress) >= idleMs
    )
      read.state = { kind: 'ended', reason: 'stalled' }
  }
}
function releaseMaterial(call: MemoryCall): void {
  call.request = null
  call.snapshots.clear()
  for (const dispatch of call.dispatches) {
    dispatch.blocks = []
    dispatch.assembly = null
    dispatch.nextSeq.clear()
    dispatch.trims.clear()
    dispatch.hadContent.clear()
    dispatch.windows.clear()
  }
}
export function consumptionCommands<P>(
  store: MemoryState<P>,
): Pick<ModelCommands<P>, 'acquireRead' | 'nextRead' | 'endRead' | 'handoff' | 'advanceCleanup'> {
  return {
    acquireRead: input =>
      store.run(() =>
        store.write<ReadStart>({
          input,
          method: 'acquireRead',
          fields: { result: input.result },
          check: (call, root) => {
            const auth = store.authorize(input, 'content', call, input.call)
            if ('failure' in auth) {
              const old = root.operations.get(input.operation)?.receipt
              if (old?.kind === 'read' && old.read !== null)
                store.updateRead(input, old.read, 'end')
              return auth.failure
            }
            return null
          },
          apply: draft => {
            const call = draft.call
            if (!call) return { failure: invalid('call', 'not-found') }
            if ('failure' in decodeResultVersion(input.result))
              return { failure: invalid('result', 'identity') }
            if (call.state.phase !== 'settled') return { failure: { kind: 'not-settled' } }
            if (call.state.settlement.version !== input.result)
              return { failure: invalid('result', 'not-original') }
            if (call.state.custody.kind === 'acknowledged')
              return {
                ok: {
                  value: { kind: 'acknowledged', custody: structuredClone(call.state.custody) },
                  receipt: { kind: 'read', read: null },
                },
              }
            const read = readId()
            const state = store.page(call, 0)
            call.reads.set(read, {
              id: read,
              lastProgress: store.options.clock.now(),
              furthest: 0,
              state: { kind: 'reading', offset: 0 },
            })
            bump(call)
            return {
              ok: {
                value: { kind: 'started', read, value: structuredClone(state) },
                receipt: { kind: 'read', read },
              },
            }
          },
          replay: (call, binding) => {
            if (!call || binding.receipt.kind !== 'read') return missingReceipt()
            const id = binding.receipt.read
            if (id === null)
              return call.state.custody.kind === 'acknowledged'
                ? { ok: { kind: 'acknowledged', custody: structuredClone(call.state.custody) } }
                : missingReceipt()
            const read = call.reads.get(id)
            if (!read) return missingReceipt()
            const refreshed = store.updateRead(input, id, 'refresh')
            if ('failure' in refreshed) return refreshed
            return {
              ok: {
                kind: 'started',
                read: id,
                value: refreshed.ok.kind === 'ended' ? refreshed.ok : store.page(call, 0),
              },
            }
          },
        }),
      ),
    nextRead: input =>
      store.run(() =>
        'failure' in decodeReadId(input.read)
          ? { failure: invalid('read', 'identity') }
          : store.updateRead(input, input.read, 'next', input.after),
      ),
    endRead: input =>
      store.run(() =>
        'failure' in decodeReadId(input.read)
          ? { failure: invalid('read', 'identity') }
          : store.updateRead(input, input.read, 'end'),
      ),
    handoff: input =>
      store.run(() =>
        store.write<AckReceipt>({
          input,
          method: 'handoff',
          fields: { result: input.result, evidence: input.evidence },
          check: call => authFailure(store.authorize(input, 'handoff', call, input.call)),
          apply: draft => {
            const call = draft.call
            if (!call) return { failure: invalid('call', 'not-found') }
            if (call.state.phase !== 'settled') return { failure: { kind: 'not-settled' } }
            if (input.result !== call.state.settlement.version)
              return { failure: { kind: 'handoff-invalid', reason: 'result-version' } }
            const source =
              input.evidence.kind === 'processed'
                ? input.evidence.completion
                : input.evidence.custody
            if (source.owner !== call.state.consumer.owner)
              return { failure: { kind: 'handoff-invalid', reason: 'consumer-owner' } }
            const adapter = store.adapter(call)
            if ('kind' in adapter) return { failure: adapter }
            const proof = checkedEvidence(
              adapter.handoff({
                tenant: input.tenant,
                call: input.call,
                consumer: structuredClone(call.state.consumer),
                execution: call.execution,
                result: input.result,
                evidence: structuredClone(input.evidence),
              }),
            )
            if ('failure' in proof) return proof
            if (call.state.custody.kind === 'producer') {
              call.state = {
                ...call.state,
                custody: {
                  kind: 'acknowledged',
                  operation: input.operation,
                  receipt: structuredClone(proof.ok),
                  cleanup: 'pending',
                  diagnostic: null,
                },
              }
              bump(call)
            }
            if (call.state.custody.kind !== 'acknowledged') return missingReceipt()
            return {
              ok: {
                value: {
                  call: input.call,
                  result: input.result,
                  custody: structuredClone(call.state.custody),
                },
                receipt: { kind: 'handoff' },
              },
            }
          },
          replay: call => {
            if (
              !call ||
              call.state.phase !== 'settled' ||
              call.state.custody.kind !== 'acknowledged'
            )
              return missingReceipt()
            return {
              ok: {
                call: input.call,
                result: call.state.settlement.version,
                custody: structuredClone(call.state.custody),
              },
            }
          },
        }),
      ),
    advanceCleanup: input =>
      store.run(() =>
        store.write<CustodyState>({
          input,
          method: 'advanceCleanup',
          fields: { instance: input.instance, generation: input.generation },
          check: call => store.execution(input, call),
          apply: draft => {
            const call = draft.call
            if (!call) return { failure: invalid('call', 'not-found') }
            if (call.state.custody.kind !== 'acknowledged')
              return { failure: invalid('custody', 'not-acknowledged') }
            if (call.state.custody.cleanup === 'released')
              return {
                ok: { value: structuredClone(call.state.custody), receipt: { kind: 'cleanup' } },
              }
            expireReads(call, () => store.options.clock.now(), store.options.limits.readIdleMs)
            const active = [...call.reads.values()].some(r => r.state.kind === 'reading')
            const pending =
              unresolved(draft.tenant, input.call).length > 0 ||
              call.dispatches.some(
                d => d.record.send === 'unknown' || [...d.windows.values()].includes('open'),
              )
            const diagnostic =
              call.cleanupFailure ??
              (active ? 'active-read' : pending ? 'unresolved-write-or-receive' : null)
            const cleanup = diagnostic === null ? 'released' : 'blocked'
            call.state = { ...call.state, custody: { ...call.state.custody, cleanup, diagnostic } }
            if (cleanup === 'released') releaseMaterial(call)
            bump(call)
            return {
              ok: { value: structuredClone(call.state.custody), receipt: { kind: 'cleanup' } },
            }
          },
          replay: call => (call ? { ok: structuredClone(call.state.custody) } : missingReceipt()),
        }),
      ),
  }
}
