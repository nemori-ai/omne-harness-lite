import {
  decodeModelCallId,
  decodeModelOperationId,
  decodeRevision,
} from '@omne-harness/model-contract'
import type {
  CallState,
  ModelFailure,
  ModelOperationId,
  Mutation,
} from '@omne-harness/model-contract'
import type { ScriptedPrincipal } from '@omne-harness/model-contract/testing'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import { failingObligations, failures, patched, type Subject } from './conformance-support.ts'
import { must, startedDispatch } from './scripted-support.ts'

const otherOperation = must(decodeModelOperationId('mop_somewhere-else'))
const otherCall = must(decodeModelCallId('mcall_somewhere-else'))
const isReserved = (operation: ModelOperationId) => operation.startsWith('mop_--')

/**
 * A provider that answers the retry of a write with a conflict when the write that first answered
 * `commit-unknown` did take effect (`took` reads that off the call), and gives every other answer
 * as the scripted provider does. A write that was dropped is retried as a new one.
 */
function conflictOnRetryOfAppliedWrite(
  action: 'cancel' | 'acknowledge',
  took: (state: CallState) => boolean,
) {
  return (subject: Subject) => {
    const admitted = new Map<string, ModelOperationId>()
    const applied = new Set<string>()
    const conflict = (operation: ModelOperationId) =>
      fail({ kind: 'conflict', operation, revision: must(decodeRevision('1')) } as const)
    const { calls } = subject.provider.runtime
    async function noteIfApplied(
      input: Mutation<ScriptedPrincipal>,
      outcome: Outcome<unknown, ModelFailure>,
    ) {
      const admission = admitted.get(input.call)
      if (admission === undefined || !('failure' in outcome)) return
      if (outcome.failure.kind !== 'commit-unknown') return
      const seen = await calls.inspect({ ...input, admission })
      if ('ok' in seen && seen.ok.kind === 'found' && took(seen.ok.state))
        applied.add(input.operation)
    }
    return patched(subject, {
      calls: scripted => ({
        ...scripted,
        async admit(input) {
          admitted.set(input.call, input.operation)
          return scripted.admit(input)
        },
        async cancel(input) {
          if (applied.has(input.operation)) return conflict(input.operation)
          const outcome = await scripted.cancel(input)
          if (action === 'cancel') await noteIfApplied(input, outcome)
          return outcome
        },
      }),
      consumption: consumption => ({
        ...consumption,
        async acknowledge(input) {
          if (applied.has(input.operation)) return conflict(input.operation)
          const outcome = await consumption.acknowledge(input)
          if (action === 'acknowledge') await noteIfApplied(input, outcome)
          return outcome
        },
      }),
    })
  }
}

describe('the conformance suite on acceptance', () => {
  it('fails a provider whose repeated admission is not marked as recovered', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          async admit(input) {
            const outcome = await calls.admit(input)
            return 'ok' in outcome ? succeed({ ...outcome.ok, recovered: false }) : outcome
          },
        }),
      }),
    )
    expect(failing).toEqual(['admission-repeat-recognised'])
    expect(reasons).toEqual([expect.stringContaining('the repeat is not marked as recovered')])
  })

  it('fails a provider whose repeated admission answers another revision', async () => {
    const { failing, reasons } = await failures(subject => {
      let answered = 0
      return patched(subject, {
        calls: calls => ({
          ...calls,
          async admit(input) {
            const outcome = await calls.admit(input)
            answered += 1
            if (!('ok' in outcome) || !outcome.ok.recovered) return outcome
            return succeed({
              ...outcome.ok,
              revision: must(decodeRevision(String(answered + 100))),
            })
          },
        }),
      })
    })
    expect(failing).toEqual(['admission-repeat-recognised'])
    expect(reasons).toEqual([expect.stringContaining('the repeat has revision 102, not 1')])
  })

  it('fails a provider that takes a changed admission for a repeat', async () => {
    const { failing, reasons } = await failures(subject => {
      const first = new Map<string, Parameters<typeof subject.provider.runtime.calls.admit>[0]>()
      return patched(subject, {
        calls: calls => ({
          ...calls,
          async admit(input) {
            const known = first.get(input.operation)
            if (known === undefined) first.set(input.operation, input)
            return calls.admit(known?.call === input.call ? known : input)
          },
        }),
      })
    })
    expect(failing).toEqual(['admission-conflict-on-different-input'])
    expect(reasons).toEqual([
      expect.stringContaining('the changed admission succeeded where it must not'),
    ])
  })

  it('fails a provider that lets a cancel reuse the operation of an admission', async () => {
    const { failing, reasons } = await failures(subject => {
      const admitted = new Set<string>()
      return patched(subject, {
        calls: calls => ({
          ...calls,
          async admit(input) {
            const outcome = await calls.admit(input)
            if ('ok' in outcome) admitted.add(input.operation)
            return outcome
          },
          cancel: input =>
            calls.cancel(
              admitted.has(input.operation) ? { ...input, operation: otherOperation } : input,
            ),
        }),
      })
    })
    expect(failing).toEqual(['operation-not-reused-across-methods'])
    expect(reasons).toEqual([
      expect.stringContaining(
        'a cancel that reuses the admission operation succeeded where it must not',
      ),
    ])
  })

  it('fails a provider whose accepted call shows a send that started', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          async dispatches() {
            return succeed([startedDispatch])
          },
        }),
      }),
    )
    expect(failing).toEqual(['admission-is-not-a-send'])
    expect(reasons).toEqual([expect.stringContaining('an accepted call shows a started send')])
  })

  it('fails a provider that takes a reserved operation in a cancel', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          cancel: input =>
            calls.cancel(
              isReserved(input.operation) ? { ...input, operation: otherOperation } : input,
            ),
        }),
      }),
    )
    expect(failing).toEqual(['reserved-operation-refused'])
    expect(reasons).toEqual([
      expect.stringContaining('cancel with a reserved operation succeeded where it must not'),
    ])
  })

  it('fails a provider that refuses an admission but keeps the call', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          async admit(input) {
            if (!isReserved(input.operation)) return calls.admit(input)
            await calls.admit({ ...input, operation: otherOperation })
            return fail({ kind: 'invalid', field: 'operation', reason: 'reserved' })
          },
        }),
      }),
    )
    expect(failing).toEqual(['refused-admission-forms-no-call'])
    expect(reasons).toEqual([
      expect.stringContaining('the admission of the same call after the refusal failed with'),
    ])
  })

  it('fails a provider that recognises a refused admission as a recovered call', async () => {
    const { failing, reasons } = await failures(subject => {
      const left = new Set<string>()
      return patched(subject, {
        calls: calls => ({
          ...calls,
          async admit(input) {
            if (isReserved(input.operation)) {
              left.add(input.call)
              return fail({ kind: 'invalid', field: 'operation', reason: 'reserved' })
            }
            return left.has(input.call)
              ? succeed({ call: input.call, revision: must(decodeRevision('1')), recovered: true })
              : calls.admit(input)
          },
        }),
      })
    })
    expect(failing).toEqual(['refused-admission-forms-no-call'])
    expect(reasons).toEqual(['the refused admission left a call behind'])
  })

  it('fails a provider that takes a reserved operation in an admission', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          admit: input =>
            calls.admit(
              isReserved(input.operation) ? { ...input, operation: otherOperation } : input,
            ),
        }),
      }),
    )
    expect(failing).toEqual(['reserved-operation-refused', 'refused-admission-forms-no-call'])
    expect(reasons[0]).toContain('admit with a reserved operation succeeded where it must not')
    expect(reasons[1]).toContain(
      'the admission with a reserved operation succeeded where it must not',
    )
  })

  it('fails a provider that names another operation in its unknown commit', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          async admit(input) {
            const outcome = await calls.admit(input)
            return 'failure' in outcome && outcome.failure.kind === 'commit-unknown'
              ? fail({ kind: 'commit-unknown', operation: otherOperation })
              : outcome
          },
        }),
      }),
    )
    expect(failing).toEqual(['commit-unknown-keeps-operation'])
    expect(reasons).toEqual([expect.stringContaining('the unknown commit names another operation')])
  })

  it('fails a provider that gives a second call the operation of an unknown commit', async () => {
    const { failing, reasons } = await failures(subject => {
      const owner = new Map<string, string>()
      return patched(subject, {
        calls: calls => ({
          ...calls,
          async admit(input) {
            const first = owner.get(input.operation)
            if (first === undefined) owner.set(input.operation, input.call)
            return first === undefined || first === input.call
              ? calls.admit(input)
              : calls.admit({ ...input, operation: otherOperation })
          },
        }),
      })
    })
    expect(failing).toEqual(['commit-unknown-keeps-operation'])
    expect(reasons).toEqual([
      expect.stringContaining(
        'another call that reuses the operation after applied succeeded where it must not',
      ),
    ])
  })

  it('fails a provider that reports an applied write as not accepted', async () => {
    const { failing, reasons } = await failures(subject => {
      const unknown = new Set<string>()
      return patched(subject, {
        calls: calls => ({
          ...calls,
          async admit(input) {
            const outcome = await calls.admit(input)
            if ('failure' in outcome && outcome.failure.kind === 'commit-unknown')
              unknown.add(input.operation)
            return outcome
          },
          async inspect(input) {
            return unknown.has(input.admission)
              ? succeed({ kind: 'not-accepted', operation: input.admission })
              : calls.inspect(input)
          },
        }),
      })
    })
    expect(failing).toEqual(['commit-unknown-not-reported-as-refusal'])
    expect(reasons).toEqual([
      expect.stringContaining('an applied write is reported as not accepted'),
    ])
  })

  it('fails a provider whose retried cancel answers another control', async () => {
    const { failing, reasons } = await failures(subject => {
      const unknown = new Set<string>()
      return patched(subject, {
        calls: calls => ({
          ...calls,
          async cancel(input) {
            const outcome = await calls.cancel(input)
            if ('failure' in outcome && outcome.failure.kind === 'commit-unknown')
              unknown.add(input.operation)
            return 'ok' in outcome &&
              outcome.ok.kind === 'requested' &&
              unknown.has(input.operation)
              ? succeed({ ...outcome.ok, operation: otherOperation })
              : outcome
          },
        }),
      })
    })
    expect(failing).toEqual(['commit-unknown-cancel-recovers-original'])
    expect(reasons).toEqual([expect.stringContaining('the retry gives another control')])
  })

  it('fails a provider that answers the retry of an applied unknown cancel with a conflict', async () => {
    const { failing, reasons } = await failures(
      conflictOnRetryOfAppliedWrite('cancel', state => state.control.kind === 'requested'),
    )
    expect(failing).toEqual(['commit-unknown-cancel-recovers-original'])
    expect(reasons).toEqual([expect.stringContaining('the retry of the cancel failed with')])
  })

  it('fails a provider that answers the retry of an applied unknown acknowledgement with a conflict', async () => {
    const { failing, reasons } = await failures(
      conflictOnRetryOfAppliedWrite('acknowledge', state => state.custody.kind === 'acknowledged'),
    )
    expect(failing).toEqual(['commit-unknown-acknowledge-recovers-original'])
    expect(reasons).toEqual([
      expect.stringContaining('the retry of the acknowledgement failed with'),
    ])
  })

  it('fails a provider whose retried acknowledgement leaves another operation on the call', async () => {
    const { failing, reasons } = await failures(subject => {
      let unknown = false
      return patched(subject, {
        calls: calls => ({
          ...calls,
          async inspect(input) {
            const outcome = await calls.inspect(input)
            if (!unknown || !('ok' in outcome) || outcome.ok.kind !== 'found') return outcome
            const { state } = outcome.ok
            return state.custody.kind === 'acknowledged'
              ? succeed({
                  kind: 'found',
                  state: { ...state, custody: { ...state.custody, operation: otherOperation } },
                })
              : outcome
          },
        }),
        consumption: consumption => ({
          ...consumption,
          async acknowledge(input) {
            const outcome = await consumption.acknowledge(input)
            if ('failure' in outcome && outcome.failure.kind === 'commit-unknown') unknown = true
            return outcome
          },
        }),
      })
    })
    expect(failing).toEqual(['commit-unknown-acknowledge-recovers-original'])
    expect(reasons).toEqual([
      expect.stringContaining('the call does not show the acknowledgement of the retry'),
    ])
  })
})

describe('the conformance suite on the ways that acceptance can go wrong in another part', () => {
  it('fails a provider whose repeated admission names another call', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          async admit(input) {
            const outcome = await calls.admit(input)
            return 'ok' in outcome && outcome.ok.recovered
              ? succeed({ ...outcome.ok, call: otherCall })
              : outcome
          },
        }),
      }),
    )
    expect(failing).toEqual(['admission-repeat-recognised', 'commit-unknown-keeps-operation'])
    expect(reasons[0]).toBe(`the repeat names ${otherCall}, not mcall_cf-repeat`)
  })

  it('fails a provider whose conflict names another operation', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          async admit(input) {
            const outcome = await calls.admit(input)
            return 'failure' in outcome && outcome.failure.kind === 'conflict'
              ? fail({ ...outcome.failure, operation: otherOperation })
              : outcome
          },
        }),
      }),
    )
    expect(failing).toEqual(['admission-conflict-on-different-input'])
    expect(reasons[0]).toContain('the conflict names another operation')
  })

  it('fails a provider that answers a changed admission with another kind of failure', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          async admit(input) {
            const outcome = await calls.admit(input)
            return 'failure' in outcome && outcome.failure.kind === 'conflict'
              ? fail({ kind: 'denied', action: 'admit' })
              : outcome
          },
        }),
      }),
    )
    expect(failing).toEqual(['admission-conflict-on-different-input'])
    expect(reasons[0]).toBe(
      'the changed admission failed with {"kind":"denied","action":"admit"}, not conflict',
    )
  })

  it('keeps an accepted call whose dispatch list shows a send that has not started', async () => {
    const failing = await failingObligations(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          async dispatches(input) {
            const outcome = await calls.dispatches(input)
            return 'ok' in outcome && outcome.ok.length === 0
              ? succeed([{ ...startedDispatch, send: 'prepared' }])
              : outcome
          },
        }),
      }),
    )
    expect(failing).toEqual([])
  })

  it('fails a provider whose refusal of a reserved operation names another field', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          async admit(input) {
            return isReserved(input.operation)
              ? fail({ kind: 'invalid', field: 'request', reason: 'reserved' })
              : calls.admit(input)
          },
        }),
      }),
    )
    expect(failing).toEqual(['reserved-operation-refused'])
    expect(reasons[0]).toContain('admit names the field')
  })

  it('fails a provider that refuses a reserved operation as denied', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          async cancel(input) {
            return isReserved(input.operation)
              ? fail({ kind: 'denied', action: 'cancel' })
              : calls.cancel(input)
          },
        }),
      }),
    )
    expect(failing).toEqual(['reserved-operation-refused'])
    expect(reasons[0]).toContain('not invalid')
  })

  it('fails a provider whose retry after an unknown commit names another call', async () => {
    const { failing, reasons } = await failures(subject => {
      const unknown = new Set<string>()
      return patched(subject, {
        calls: calls => ({
          ...calls,
          async admit(input) {
            const outcome = await calls.admit(input)
            if ('failure' in outcome && outcome.failure.kind === 'commit-unknown')
              unknown.add(input.operation)
            return 'ok' in outcome && unknown.has(input.operation)
              ? succeed({ ...outcome.ok, call: otherCall })
              : outcome
          },
        }),
      })
    })
    expect(failing).toEqual(['commit-unknown-keeps-operation'])
    expect(reasons[0]).toContain('the retry names')
  })

  it('fails a provider that refuses a cancel that reuses an admission operation and applies it all the same', async () => {
    const { failing, reasons } = await failures(subject => {
      const admitted = new Set<string>()
      return patched(subject, {
        calls: calls => ({
          ...calls,
          async admit(input) {
            const outcome = await calls.admit(input)
            if ('ok' in outcome) admitted.add(input.operation)
            return outcome
          },
          async cancel(input) {
            if (!admitted.has(input.operation)) return calls.cancel(input)
            await calls.cancel({ ...input, operation: otherOperation })
            return fail({
              kind: 'conflict',
              operation: input.operation,
              revision: must(decodeRevision('1')),
            })
          },
        }),
      })
    })
    expect(failing).toEqual(['operation-not-reused-across-methods'])
    expect(reasons[0]).toContain('the refused cancel changed the call')
  })

  it('fails a provider whose unknown cancel names another operation', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          async cancel(input) {
            const outcome = await calls.cancel(input)
            return 'failure' in outcome && outcome.failure.kind === 'commit-unknown'
              ? fail({ kind: 'commit-unknown', operation: otherOperation })
              : outcome
          },
        }),
      }),
    )
    expect(failing).toEqual(['commit-unknown-cancel-recovers-original'])
    expect(reasons[0]).toContain('the unknown cancel names another operation')
  })

  it('fails a provider whose retried cancel gives no control', async () => {
    const { failing, reasons } = await failures(subject => {
      const unknown = new Set<string>()
      return patched(subject, {
        calls: calls => ({
          ...calls,
          async cancel(input) {
            const outcome = await calls.cancel(input)
            if ('failure' in outcome && outcome.failure.kind === 'commit-unknown')
              unknown.add(input.operation)
            return 'ok' in outcome && unknown.has(input.operation)
              ? succeed({ kind: 'none' })
              : outcome
          },
        }),
      })
    })
    expect(failing).toEqual(['commit-unknown-cancel-recovers-original'])
    expect(reasons[0]).toContain('the retry gives another control')
  })

  it('fails a provider whose retried acknowledgement leaves the call with the producer', async () => {
    const { failing, reasons } = await failures(subject => {
      let unknown = false
      return patched(subject, {
        calls: calls => ({
          ...calls,
          async inspect(input) {
            const outcome = await calls.inspect(input)
            if (!unknown || !('ok' in outcome) || outcome.ok.kind !== 'found') return outcome
            return succeed({
              kind: 'found',
              state: { ...outcome.ok.state, custody: { kind: 'producer' } },
            })
          },
        }),
        consumption: consumption => ({
          ...consumption,
          async acknowledge(input) {
            const outcome = await consumption.acknowledge(input)
            if ('failure' in outcome && outcome.failure.kind === 'commit-unknown') unknown = true
            return outcome
          },
        }),
      })
    })
    expect(failing).toEqual(['commit-unknown-acknowledge-recovers-original'])
    expect(reasons[0]).toContain('the call does not show the acknowledgement of the retry')
  })
})
