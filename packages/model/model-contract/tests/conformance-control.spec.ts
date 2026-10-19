import { decodeModelCallId, decodeModelOperationId } from '@omne-harness/model-contract'
import { succeed } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import { failures, patched } from './conformance-support.ts'
import { evidence, must, startedDispatch } from './scripted-support.ts'

const mallory = { name: 'mallory' }
const fanned = (operation: string) => must(decodeModelOperationId(`${operation}-fan`))
const named = (name: string) => must(decodeModelOperationId(`mop_${name}`))

describe('the conformance suite on control', () => {
  it('fails a provider whose repeated cancel answers its own operation', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          async cancel(input) {
            const outcome = await calls.cancel(input)
            return 'ok' in outcome && outcome.ok.kind === 'requested'
              ? succeed({ ...outcome.ok, operation: input.operation })
              : outcome
          },
        }),
      }),
    )
    expect(failing).toEqual(['repeat-cancel-returns-original-control'])
    expect(reasons).toEqual([expect.stringContaining('the second cancel gives')])
  })

  it('fails a provider whose cancel claims that the model stopped', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          async cancel(input) {
            const outcome = await calls.cancel(input)
            return 'ok' in outcome && outcome.ok.kind === 'requested'
              ? succeed({ ...outcome.ok, upstream: 'stopped' })
              : outcome
          },
        }),
      }),
    )
    expect(failing).toEqual(['cancel-does-not-claim-stop'])
    expect(reasons).toEqual([expect.stringContaining('the cancel claims that the model stopped')])
  })

  it('fails a provider that acknowledges the call it interrupted', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          async inspect(input) {
            const outcome = await calls.inspect(input)
            if (!('ok' in outcome) || outcome.ok.kind !== 'found') return outcome
            const { state } = outcome.ok
            if (state.phase !== 'settled' || state.settlement.termination.kind !== 'interrupted')
              return outcome
            const custody = {
              kind: 'acknowledged',
              operation: input.admission,
              receipt: evidence('automatic'),
              cleanup: 'pending',
              diagnostic: null,
            } as const
            return succeed({ kind: 'found', state: { ...state, custody } })
          },
        }),
      }),
    )
    expect(failing).toEqual(['cancelled-call-ends-interrupted-unacknowledged'])
    expect(reasons).toEqual([expect.stringContaining('the cancel acknowledged the result')])
  })

  it('fails a provider whose cancel reaches the other calls', async () => {
    const { failing, reasons } = await failures(subject => {
      const known = new Set<string>()
      return patched(subject, {
        calls: calls => ({
          ...calls,
          async admit(input) {
            const outcome = await calls.admit(input)
            if ('ok' in outcome) known.add(input.call)
            return outcome
          },
          async cancel(input) {
            for (const call of known)
              if (call !== input.call)
                await calls.cancel({
                  ...input,
                  call: must(decodeModelCallId(call)),
                  operation: fanned(input.operation),
                })
            return calls.cancel(input)
          },
        }),
      })
    })
    expect(failing).toEqual(['cancel-confined-to-target-call'])
    expect(reasons).toEqual([
      expect.stringContaining('the cancel of another call changed this one'),
    ])
  })

  it('fails a provider that lets a principal without the right cancel', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          cancel: input => calls.cancel({ ...input, principal: mallory }),
        }),
      }),
    )
    expect(failing).toEqual(['unauthorised-cancel-denied'])
    expect(reasons).toEqual([
      expect.stringContaining('the cancel without the right succeeded where it must not'),
    ])
  })

  it('fails a provider that sends again after a cancel', async () => {
    const { failing, reasons } = await failures(subject => {
      const cancelled = new Set<string>()
      let extra = 0
      return patched(subject, {
        calls: calls => ({
          ...calls,
          async cancel(input) {
            const outcome = await calls.cancel(input)
            cancelled.add(input.call)
            return outcome
          },
          async dispatches(input) {
            const outcome = await calls.dispatches(input)
            if (!cancelled.has(input.call) || !('ok' in outcome)) return outcome
            extra += 1
            return succeed([...outcome.ok, ...Array.from({ length: extra }, () => startedDispatch)])
          },
        }),
      })
    })
    expect(failing).toEqual(['cancel-sends-nothing-more'])
    expect(reasons[0]).toContain('sends started after the cancel')
  })
})

describe('the conformance suite on the other ways that control can go wrong', () => {
  it('fails a provider whose cancel answers with the control of another operation', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          async cancel(input) {
            const outcome = await calls.cancel(input)
            return 'ok' in outcome && outcome.ok.kind === 'requested'
              ? succeed({ ...outcome.ok, operation: named('mine') })
              : outcome
          },
        }),
      }),
    )
    expect(failing).toEqual([
      'commit-unknown-cancel-recovers-original',
      'repeat-cancel-returns-original-control',
    ])
    expect(reasons[1]).toContain('not the control of mop_cf-cancel-first')
  })

  it('fails a provider whose cancel gives no control', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          async cancel(input) {
            const outcome = await calls.cancel(input)
            return 'ok' in outcome ? succeed({ kind: 'none' }) : outcome
          },
        }),
      }),
    )
    expect(failing).toEqual([
      'commit-unknown-cancel-recovers-original',
      'repeat-cancel-returns-original-control',
      'cancel-does-not-claim-stop',
    ])
    expect(reasons[1]).toContain('the first cancel gives {"kind":"none"}')
    expect(reasons[2]).toContain('the cancel gives no control')
  })

  it('fails a provider that shows the cancelled call as completed', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          async inspect(input) {
            const outcome = await calls.inspect(input)
            if (!('ok' in outcome) || outcome.ok.kind !== 'found') return outcome
            const { state } = outcome.ok
            if (state.phase !== 'settled' || state.settlement.termination.kind !== 'interrupted')
              return outcome
            const termination = { kind: 'completed', reason: 'stop' } as const
            return succeed({
              kind: 'found',
              state: { ...state, settlement: { ...state.settlement, termination } },
            })
          },
        }),
      }),
    )
    expect(failing).toEqual(['cancelled-call-ends-interrupted-unacknowledged'])
    expect(reasons[0]).toContain('not as interrupted')
  })

  it('fails a provider that shows the cancelled call as interrupted by another control', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          async inspect(input) {
            const outcome = await calls.inspect(input)
            if (!('ok' in outcome) || outcome.ok.kind !== 'found') return outcome
            const { state } = outcome.ok
            if (state.phase !== 'settled' || state.settlement.termination.kind !== 'interrupted')
              return outcome
            const termination = { kind: 'interrupted', control: named('other') } as const
            return succeed({
              kind: 'found',
              state: { ...state, settlement: { ...state.settlement, termination } },
            })
          },
        }),
      }),
    )
    expect(failing).toEqual(['cancelled-call-ends-interrupted-unacknowledged'])
    expect(reasons[0]).toContain('was interrupted by')
  })

  it('fails a provider that refuses a cancel for want of the right and keeps it as a control', async () => {
    const { failing, reasons } = await failures(subject => {
      const refusedFor = new Set<string>()
      return patched(subject, {
        calls: calls => ({
          ...calls,
          async cancel(input) {
            const outcome = await calls.cancel(input)
            if (
              'failure' in outcome &&
              outcome.failure.kind === 'denied' &&
              input.tenant === subject.tenant
            )
              refusedFor.add(input.call)
            return outcome
          },
          async inspect(input) {
            const outcome = await calls.inspect(input)
            if (!refusedFor.has(input.call) || !('ok' in outcome) || outcome.ok.kind !== 'found')
              return outcome
            const control = {
              kind: 'requested',
              operation: named('kept'),
              propagation: 'pending',
              upstream: 'unknown',
            } as const
            return succeed({ kind: 'found', state: { ...outcome.ok.state, control } })
          },
        }),
      })
    })
    expect(failing).toEqual(['unauthorised-cancel-denied'])
    expect(reasons[0]).toContain('a refused cancel left a control')
  })

  it('fails a provider that sends again only when it is asked a second time after a cancel', async () => {
    const { failing, reasons } = await failures(subject => {
      const polls = new Map<string, number>()
      const cancelled = new Set<string>()
      return patched(subject, {
        calls: calls => ({
          ...calls,
          async cancel(input) {
            cancelled.add(input.call)
            return calls.cancel(input)
          },
          async dispatches(input) {
            const outcome = await calls.dispatches(input)
            if (!cancelled.has(input.call) || !('ok' in outcome)) return outcome
            const polled = (polls.get(input.call) ?? 0) + 1
            polls.set(input.call, polled)
            return polled < 2 ? outcome : succeed([...outcome.ok, startedDispatch])
          },
        }),
      })
    })
    expect(failing).toEqual(['cancel-sends-nothing-more'])
    expect(reasons[0]).toContain('sends started later still')
  })

  it('fails a provider whose running call shows no send that started', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          async dispatches() {
            return succeed([])
          },
        }),
      }),
    )
    expect(failing).toEqual(['cancel-sends-nothing-more'])
    expect(reasons[0]).toContain('shows no send that started')
  })
})
