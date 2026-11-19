// The two ends of producer custody besides acknowledgement: abandoning a settled result that no
// consumer will save, and cleaning up once custody ended either way (T4).
import { decodeResultVersion } from '@omne-harness/model-contract'
import type { AbandonBasis, AbandonReceipt, CustodyState } from '@omne-harness/model-contract'
import type { ModelCommands } from '@omne-harness/model-contract/provider'
import type { BoundCommandAccess } from './initial.ts'
import { authFailure, missingReceipt, unresolved } from './judge.ts'
import { bump, expireReads, releaseMaterial, type ModelCommandCore } from './state.ts'
import type { CallDocument } from './types.ts'
import { digest, invalid } from './value.ts'

const REFUSALS: readonly string[] = ['denied', 'invalid', 'conflict']

function basisFailure(basis: AbandonBasis) {
  const valid =
    basis?.kind === 'refused'
      ? REFUSALS.includes(basis.refusal)
      : basis?.kind === 'unreadable' && typeof basis.reason === 'string' && basis.reason !== ''
  return valid ? null : invalid('basis', 'not-a-refusal-or-unreadable')
}

function abandoned(call: CallDocument): AbandonReceipt | null {
  const { state } = call
  if (state.phase !== 'settled' || state.custody.kind !== 'abandoned') return null
  return {
    call: state.call,
    result: state.settlement.version,
    custody: structuredClone(state.custody),
  }
}

export function custodyCommands<P>(
  core: ModelCommandCore<P>,
  bound?: BoundCommandAccess<P>,
): Pick<ModelCommands<P>, 'abandon' | 'advanceCleanup'> {
  return {
    abandon: input =>
      core.runWrite(input, () =>
        core.write<AbandonReceipt>({
          input,
          method: 'abandon',
          fields: { result: input.result, basis: input.basis },
          check: call => authFailure(core.authorize(input, 'handoff', call, input.call)),
          apply: draft => {
            const call = draft.call
            if (!call) return { failure: invalid('call', 'not-found') }
            if ('failure' in decodeResultVersion(input.result))
              return { failure: invalid('result', 'identity') }
            if (call.state.phase !== 'settled') return { failure: { kind: 'not-settled' } }
            if (call.state.settlement.version !== input.result)
              return { failure: invalid('result', 'not-original') }
            const refused = basisFailure(input.basis)
            if (refused) return { failure: refused }
            if (call.state.custody.kind === 'acknowledged')
              return { failure: invalid('custody', 'acknowledged') }
            if (call.state.custody.kind === 'producer') {
              const revision = bump(call)
              const record = `${input.call}/${input.result}/abandoned`
              const custody = {
                kind: 'abandoned' as const,
                operation: input.operation,
                basis: structuredClone(input.basis),
                record: { owner: 'model-memory', record, revision, digest: digest(input.basis) },
                cleanup: 'pending' as const,
                diagnostic: null,
              }
              call.state = { ...call.state, custody }
            }
            const receipt = abandoned(call)
            if (receipt === null) return missingReceipt()
            return { ok: { value: receipt, receipt: { kind: 'abandon' } } }
          },
          replay: call => {
            const receipt = call ? abandoned(call) : null
            return receipt === null ? missingReceipt() : { ok: receipt }
          },
        }),
      ),
    advanceCleanup: input =>
      core.runWrite(input, () =>
        core.write<CustodyState>({
          input,
          method: 'advanceCleanup',
          fields: { instance: input.instance, generation: input.generation },
          check: call => core.execution(input, call, bound),
          apply: draft => {
            const call = draft.call
            if (!call) return { failure: invalid('call', 'not-found') }
            if (call.state.custody.kind === 'producer')
              return { failure: invalid('custody', 'not-acknowledged') }
            if (call.state.custody.cleanup === 'released')
              return {
                ok: { value: structuredClone(call.state.custody), receipt: { kind: 'cleanup' } },
              }
            expireReads(call, () => core.options.clock.now(), core.options.limits.readIdleMs)
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
