import { referenceParts } from './reference-input.ts'
import {
  decodeModelCallId,
  decodeModelOperationId,
  decodeReadId,
  decodeResultVersion,
} from '@omne-harness/model-contract'
import type {
  AckInput,
  AckReceipt,
  CallAccess,
  CallState,
  CustodyState,
  DurableEvidence,
  ModelConsumption,
  ModelFailure,
  ReadState,
  ResultPart,
} from '@omne-harness/model-contract'
import {
  checkModelProviderConformance,
  createScriptedConformanceSubject,
  type ScriptedPrincipal,
} from '@omne-harness/model-contract/testing'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import {
  failingObligations,
  failures,
  hooked,
  patched,
  type Subject,
} from './conformance-support.ts'
import { evidence, must, startedDispatch } from './scripted-support.ts'

const mallory = { name: 'mallory' }
const another = must(decodeModelOperationId('mop_another'))
const fabricatedRead = must(decodeReadId('mread_fabricated'))
const elsewhere = must(decodeModelCallId('mcall_elsewhere'))
const otherResult = must(decodeResultVersion('mrver_elsewhere'))
const firstDispatch = startedDispatch.dispatch
const movedCustody: CustodyState = {
  kind: 'acknowledged',
  operation: another,
  receipt: evidence('moved'),
  cleanup: 'pending',
  diagnostic: null,
}

/** A receipt that the provider gives without having acknowledged anything. */
function fabricatedReceipt(input: AckInput<unknown>): AckReceipt {
  const receipt =
    input.evidence.kind === 'processed' ? input.evidence.completion : input.evidence.custody
  return {
    call: input.call,
    result: input.result,
    custody: {
      kind: 'acknowledged',
      operation: input.operation,
      receipt,
      cleanup: 'pending',
      diagnostic: null,
    },
  }
}

describe('the conformance suite on the result and its handover', () => {
  /** A provider that shows `change` of a settled call once a cancel has reached it after it ended. */
  function afterCancel(change: (state: Extract<CallState, { phase: 'settled' }>) => CallState) {
    return (subject: Subject) => {
      const ended = new Set<string>()
      const unsettled = new Set<string>()
      const keyOf = (input: CallAccess<ScriptedPrincipal>) =>
        `${JSON.stringify(input.tenant)}/${input.call}`
      return patched(subject, {
        calls: calls => ({
          ...calls,
          async cancel(input) {
            if (ended.has(keyOf(input))) unsettled.add(keyOf(input))
            return calls.cancel(input)
          },
          async inspect(input) {
            const outcome = await calls.inspect(input)
            if (!('ok' in outcome) || outcome.ok.kind !== 'found') return outcome
            const { state } = outcome.ok
            if (state.phase !== 'settled') return outcome
            ended.add(keyOf(referenceParts(input)))
            return unsettled.has(keyOf(referenceParts(input)))
              ? succeed({ kind: 'found', state: change(state) })
              : outcome
          },
        }),
      })
    }
  }

  it('fails a provider whose cancel changes the termination of an ended call', async () => {
    const { failing, reasons } = await failures(
      afterCancel(state => {
        const termination = {
          kind: 'failed',
          fault: { cause: 'unclassified', diagnostic: 'flipped', upstreamStatus: null },
        } as const
        return { ...state, settlement: { ...state.settlement, termination } }
      }),
    )
    expect(failing).toEqual(['settled-call-keeps-termination'])
    expect(reasons).toEqual([
      expect.stringContaining('the termination changed after the call ended'),
    ])
  })

  it('fails a provider whose cancel takes an ended call out of the settled phase', async () => {
    const { failing, reasons } = await failures(
      afterCancel(({ phase: _phase, settlement: _settlement, ...rest }) => ({
        ...rest,
        phase: 'accepted',
      })),
    )
    expect(failing).toEqual(['settled-call-keeps-termination'])
    expect(reasons).toEqual([expect.stringContaining('the call that ended is now accepted')])
  })

  it('fails a provider that starts a read before the call has ended', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        consumption: consumption => ({
          ...consumption,
          async beginRead(input) {
            const outcome = await consumption.beginRead(input)
            return 'failure' in outcome && outcome.failure.kind === 'not-settled'
              ? succeed({
                  kind: 'started',
                  read: fabricatedRead,
                  value: { kind: 'ended', reason: 'complete' },
                })
              : outcome
          },
        }),
      }),
    )
    expect(failing).toEqual(['read-before-settle-refused'])
    expect(reasons).toEqual([
      expect.stringContaining('the read of a running call succeeded where it must not'),
    ])
  })

  it('fails a provider that acknowledges a call that has not ended', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        consumption: consumption => ({
          ...consumption,
          async acknowledge(input) {
            const outcome = await consumption.acknowledge(input)
            return 'failure' in outcome && outcome.failure.kind === 'not-settled'
              ? succeed(fabricatedReceipt(input))
              : outcome
          },
        }),
      }),
    )
    expect(failing).toEqual(['acknowledge-refused-before-settle'])
    expect(reasons).toEqual([
      expect.stringContaining('the acknowledgement of a running call succeeded where it must not'),
    ])
  })

  it('fails a provider that takes forged evidence', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        consumption: consumption => ({
          ...consumption,
          async acknowledge(input) {
            const outcome = await consumption.acknowledge(input)
            return 'failure' in outcome && outcome.failure.kind === 'handoff-invalid'
              ? succeed(fabricatedReceipt(input))
              : outcome
          },
        }),
      }),
    )
    expect(failing).toEqual(['forged-evidence-refused'])
    expect(reasons).toEqual([
      expect.stringContaining(
        'the acknowledgement with forged evidence succeeded where it must not',
      ),
    ])
  })

  it('fails a provider that takes any evidence with a digest that it did not give out', async () => {
    const { failing, reasons } = await failures(subject => {
      const given = new Map<string, DurableEvidence>()
      const known = new Set<string>()
      const withEvidence = hooked(subject, hooks => ({
        ...hooks,
        async provideEvidence(input) {
          const evidence = await hooks.provideEvidence?.(input)
          if (evidence === undefined) throw new Error('the scripted subject gives evidence')
          known.add(JSON.stringify(evidence))
          if (!given.has(input.call)) given.set(input.call, evidence)
          return evidence
        },
      }))
      return patched(withEvidence, {
        consumption: consumption => ({
          ...consumption,
          async acknowledge(input) {
            const own = given.get(input.call)
            const offered =
              input.evidence.kind === 'processed'
                ? input.evidence.completion
                : input.evidence.custody
            // A provider that trusts any digest it can read: the empty one and a missing one it refuses.
            const digest: unknown = offered.digest
            const strange =
              !known.has(JSON.stringify(offered)) && typeof digest === 'string' && digest !== ''
            return consumption.acknowledge(
              own !== undefined && strange
                ? { ...input, evidence: { kind: 'processed', completion: own } }
                : input,
            )
          },
        }),
      })
    })
    expect(failing).toEqual(['forged-evidence-refused'])
    expect(reasons).toEqual([
      expect.stringContaining(
        'the acknowledgement with forged evidence succeeded where it must not',
      ),
    ])
  })

  it('fails a provider whose receipt names another operation', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        consumption: consumption => ({
          ...consumption,
          async acknowledge(input) {
            const outcome = await consumption.acknowledge(input)
            if (!('ok' in outcome)) return outcome
            const { custody } = outcome.ok
            return succeed({
              ...outcome.ok,
              custody: { ...custody, operation: another },
            })
          },
        }),
      }),
    )
    expect(failing).toEqual(['acknowledge-records-custody'])
    expect(reasons).toEqual([
      expect.stringContaining(
        'the receipt names the operation mop_another, not mop_cf-ack-mcall_cf-records',
      ),
    ])
  })

  it('fails a provider whose repeated acknowledgement gives another receipt', async () => {
    const { failing, reasons } = await failures(subject => {
      const seen = new Map<string, number>()
      return patched(subject, {
        consumption: consumption => ({
          ...consumption,
          async acknowledge(input) {
            const outcome = await consumption.acknowledge(input)
            const count = (seen.get(input.operation) ?? 0) + 1
            seen.set(input.operation, count)
            if (count < 2 || !('ok' in outcome)) return outcome
            const { custody } = outcome.ok
            return succeed({
              ...outcome.ok,
              custody: { ...custody, receipt: { ...custody.receipt, record: 'another-record' } },
            })
          },
        }),
      })
    })
    expect(failing).toEqual(['duplicate-acknowledge-returns-original'])
    expect(reasons).toEqual([expect.stringContaining('the repeat gives another receipt')])
  })

  it('fails a provider that takes other evidence for an operation it acknowledged', async () => {
    const { failing, reasons } = await failures(subject => {
      const first = new Map<string, Readonly<{ digest: string; receipt: AckReceipt }>>()
      return patched(subject, {
        consumption: consumption => ({
          ...consumption,
          async acknowledge(input) {
            const outcome = await consumption.acknowledge(input)
            const digest = fabricatedReceipt(input).custody.receipt.digest
            const known = first.get(input.operation)
            if ('ok' in outcome && known === undefined)
              first.set(input.operation, { digest, receipt: outcome.ok })
            return known !== undefined && known.digest !== digest ? succeed(known.receipt) : outcome
          },
        }),
      })
    })
    expect(failing).toEqual(['acknowledge-conflict-on-different-input'])
    expect(reasons).toEqual([
      expect.stringContaining(
        'the acknowledgement with other evidence succeeded where it must not',
      ),
    ])
  })

  it('fails a provider that starts a new read after the acknowledgement', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        consumption: consumption => ({
          ...consumption,
          async beginRead(input) {
            const outcome = await consumption.beginRead(input)
            return 'ok' in outcome && outcome.ok.kind === 'acknowledged'
              ? succeed({
                  kind: 'started',
                  read: fabricatedRead,
                  value: { kind: 'ended', reason: 'complete' },
                })
              : outcome
          },
          // The read that it made up closes like any other, so only the new read is the finding.
          async closeRead(input) {
            return input.read === fabricatedRead
              ? succeed({ kind: 'ended', reason: 'closed' })
              : consumption.closeRead(input)
          },
        }),
      }),
    )
    expect(failing).toEqual(['acknowledged-result-not-read-again'])
    expect(reasons).toEqual([expect.stringContaining('a read began after the acknowledgement')])
  })

  it('fails a provider whose read sees an acknowledgement that nobody sent', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        consumption: consumption => ({
          ...consumption,
          async beginRead(input) {
            const outcome = await consumption.beginRead(input)
            if (!('ok' in outcome) || outcome.ok.kind !== 'acknowledged') return outcome
            const { custody } = outcome.ok
            return succeed({
              kind: 'acknowledged',
              custody: { ...custody, operation: another },
            })
          },
        }),
      }),
    )
    expect(failing).toEqual(['acknowledge-and-read-serialised'])
    expect(reasons).toEqual([
      expect.stringContaining(
        'the read sees the acknowledgement of mop_another, not mop_cf-serial-ack-ack-first',
      ),
    ])
  })

  it('fails a provider whose repeated page differs', async () => {
    const { failing, reasons } = await failures(subject => {
      const asked = new Map<string, number>()
      return patched(subject, {
        consumption: consumption => ({
          ...consumption,
          async readNext(input) {
            const outcome = await consumption.readNext(input)
            const key = `${input.read}|${input.after}`
            const count = (asked.get(key) ?? 0) + 1
            asked.set(key, count)
            if (count < 2 || !('ok' in outcome) || outcome.ok.kind !== 'reading') return outcome
            const { page } = outcome.ok
            return succeed({ kind: 'reading', page: { ...page, parts: page.parts.slice(1) } })
          },
        }),
      })
    })
    expect(failing).toEqual(['mixed-partial-result-readable', 'read-page-stable-for-same-after'])
    expect(reasons).toEqual([
      'the partial page changed on replay',
      expect.stringContaining('the same page differs'),
    ])
  })

  it('fails a provider whose second close ends the read for another reason', async () => {
    const { failing, reasons } = await failures(subject => {
      const closed = new Set<string>()
      return patched(subject, {
        consumption: consumption => ({
          ...consumption,
          async closeRead(input) {
            const outcome = await consumption.closeRead(input)
            const again = closed.has(input.read)
            closed.add(input.read)
            return again && 'ok' in outcome
              ? succeed({ kind: 'ended', reason: 'stalled' })
              : outcome
          },
        }),
      })
    })
    expect(failing).toEqual(['close-read-idempotent'])
    expect(reasons).toEqual([expect.stringContaining('the second close differs')])
  })

  it('fails a provider that cuts an open read short once the call is acknowledged', async () => {
    const { failing, reasons } = await failures(subject => {
      const acknowledged = new Set<string>()
      return patched(subject, {
        consumption: consumption => ({
          ...consumption,
          async acknowledge(input) {
            const outcome = await consumption.acknowledge(input)
            if ('ok' in outcome) acknowledged.add(input.call)
            return outcome
          },
          async readNext(input) {
            return acknowledged.has(input.call)
              ? succeed({ kind: 'ended', reason: 'closed' })
              : consumption.readNext(input)
          },
        }),
      })
    })
    expect(failing).toEqual(['acknowledge-keeps-open-read-readable'])
    expect(reasons).toEqual([
      expect.stringContaining('the page after the acknowledgement gave no page'),
    ])
  })

  it('fails a provider that keeps giving pages to a principal that lost the right', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        consumption: consumption => ({
          ...consumption,
          readNext: input => consumption.readNext({ ...input, principal: mallory }),
        }),
      }),
    )
    expect(failing).toEqual(['revoked-reader-gets-no-page'])
    expect(reasons).toEqual([expect.stringContaining('the revoked principal still reads')])
  })

  it('fails a provider that withdraws the acknowledgement when cleanup is blocked', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          async inspect(input) {
            const outcome = await calls.inspect(input)
            if (!('ok' in outcome) || outcome.ok.kind !== 'found') return outcome
            const { state } = outcome.ok
            return state.custody.kind === 'acknowledged' && state.custody.cleanup === 'blocked'
              ? succeed({ kind: 'found', state: { ...state, custody: { kind: 'producer' } } })
              : outcome
          },
        }),
      }),
    )
    expect(failing).toEqual(['cleanup-failure-keeps-acknowledgement'])
    expect(reasons).toEqual([
      expect.stringContaining('a cleanup that cannot go on withdrew the acknowledgement'),
    ])
  })
})

/** A provider that answers a read that was refused for the right in the way that `answer` says. */
function deniedAs(answer: () => Outcome<ReadState, ModelFailure>) {
  return (
    consumption: ModelConsumption<ScriptedPrincipal>,
  ): ModelConsumption<ScriptedPrincipal> => ({
    ...consumption,
    async readNext(input) {
      const outcome = await consumption.readNext(input)
      const refusal =
        'failure' in outcome
          ? outcome.failure.kind === 'denied'
          : outcome.ok.kind === 'ended' && outcome.ok.reason === 'denied'
      return refusal ? answer() : outcome
    },
  })
}

describe('the conformance suite on the other ways that a handover can go wrong', () => {
  it('fails a provider whose ended call shows as running again', async () => {
    const { failing, reasons } = await failures(subject => {
      const reads = new Map<string, number>()
      return patched(subject, {
        calls: calls => ({
          ...calls,
          async inspect(input) {
            const outcome = await calls.inspect(input)
            const count = (reads.get(referenceParts(input).call) ?? 0) + 1
            reads.set(referenceParts(input).call, count)
            if (count < 2 || !('ok' in outcome) || outcome.ok.kind !== 'found') return outcome
            const { state } = outcome.ok
            if (state.phase !== 'settled') return outcome
            const { settlement: _gone, ...rest } = state
            return succeed({
              kind: 'found',
              state: {
                ...rest,
                phase: 'running',
                dispatch: firstDispatch,
                firstContent: 'observed',
              },
            })
          },
        }),
      })
    })
    expect(failing).toEqual(['settled-call-keeps-termination'])
    expect(reasons[0]).toBe('the call that ended is now running')
  })

  it('fails a provider that refuses an early acknowledgement and moves the custody all the same', async () => {
    const { failing, reasons } = await failures(subject => {
      const asked = new Set<string>()
      return patched(subject, {
        calls: calls => ({
          ...calls,
          async inspect(input) {
            const outcome = await calls.inspect(input)
            if (
              !asked.has(referenceParts(input).call) ||
              !('ok' in outcome) ||
              outcome.ok.kind !== 'found'
            )
              return outcome
            return succeed({
              kind: 'found',
              state: { ...outcome.ok.state, custody: movedCustody },
            })
          },
        }),
        consumption: consumption => ({
          ...consumption,
          async acknowledge(input) {
            const outcome = await consumption.acknowledge(input)
            if (
              'failure' in outcome &&
              (outcome.failure.kind === 'not-settled' || outcome.failure.kind === 'handoff-invalid')
            )
              asked.add(input.call)
            return outcome
          },
        }),
      })
    })
    expect(failing).toEqual(['acknowledge-refused-before-settle', 'forged-evidence-refused'])
    expect(reasons[0]).toContain('the custody moved')
    expect(reasons[1]).toContain('forged evidence moved the custody')
  })

  it('fails a provider whose receipt names another call', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        consumption: consumption => ({
          ...consumption,
          async acknowledge(input) {
            const outcome = await consumption.acknowledge(input)
            return 'ok' in outcome ? succeed({ ...outcome.ok, call: elsewhere }) : outcome
          },
        }),
      }),
    )
    expect(failing).toEqual(['acknowledge-records-custody'])
    expect(reasons[0]).toBe(`the receipt names ${elsewhere}`)
  })

  it('fails a provider whose receipt names another result', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        consumption: consumption => ({
          ...consumption,
          async acknowledge(input) {
            const outcome = await consumption.acknowledge(input)
            return 'ok' in outcome ? succeed({ ...outcome.ok, result: otherResult }) : outcome
          },
        }),
      }),
    )
    expect(failing).toEqual(['acknowledge-records-custody'])
    expect(reasons[0]).toBe(`the receipt names the result ${otherResult}`)
  })

  it('fails a provider whose conflict names another operation', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        consumption: consumption => ({
          ...consumption,
          async acknowledge(input) {
            const outcome = await consumption.acknowledge(input)
            return 'failure' in outcome && outcome.failure.kind === 'conflict'
              ? fail({ ...outcome.failure, operation: another })
              : outcome
          },
        }),
      }),
    )
    expect(failing).toEqual(['acknowledge-conflict-on-different-input'])
    expect(reasons[0]).toContain('the conflict names another operation')
  })

  it('fails a provider that cannot acknowledge a call while a read of it is open', async () => {
    const { failing, reasons } = await failures(subject => {
      const reading = new Set<string>()
      return patched(subject, {
        consumption: consumption => ({
          ...consumption,
          async beginRead(input) {
            reading.add(referenceParts(input).call)
            const outcome = await consumption.beginRead(input)
            if (!('ok' in outcome) || outcome.ok.kind !== 'started')
              reading.delete(referenceParts(input).call)
            return outcome
          },
          async acknowledge(input) {
            return reading.has(input.call)
              ? fail({ kind: 'unavailable', dependency: 'reads', diagnostic: 'a read is open' })
              : consumption.acknowledge(input)
          },
        }),
      })
    })
    expect(failing).toEqual([
      'acknowledge-and-read-serialised',
      'acknowledge-keeps-open-read-readable',
    ])
    expect(reasons[0]).toContain('the acknowledgement in the order read-first failed')
  })

  it('fails a provider that cannot close the read that began before the acknowledgement', async () => {
    const { failing, reasons } = await failures(subject => {
      const acknowledged = new Set<string>()
      return patched(subject, {
        consumption: consumption => ({
          ...consumption,
          async acknowledge(input) {
            const outcome = await consumption.acknowledge(input)
            if ('ok' in outcome) acknowledged.add(input.call)
            return outcome
          },
          async closeRead(input) {
            return acknowledged.has(input.call)
              ? fail({ kind: 'unavailable', dependency: 'reads', diagnostic: 'gone' })
              : consumption.closeRead(input)
          },
        }),
      })
    })
    expect(failing).toEqual(['acknowledge-and-read-serialised'])
    expect(reasons[0]).toContain('the close of the read that began first (read-first)')
  })

  it('fails a provider that shows the producer after it gave a receipt', async () => {
    const { failing, reasons } = await failures(subject => {
      const gave = new Set<string>()
      return patched(subject, {
        calls: calls => ({
          ...calls,
          async inspect(input) {
            const outcome = await calls.inspect(input)
            if (
              !gave.has(referenceParts(input).call) ||
              !('ok' in outcome) ||
              outcome.ok.kind !== 'found'
            )
              return outcome
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
            if ('ok' in outcome && input.operation.startsWith('mop_cf-ack-')) gave.add(input.call)
            return outcome
          },
        }),
      })
    })
    // The call that shows the producer after an acknowledgement also fails the obligation that
    // the acknowledgement stays when cleanup breaks: both read the custody after the receipt.
    expect(failing).toEqual([
      'acknowledge-records-custody',
      'cleanup-failure-keeps-acknowledgement',
    ])
    expect(reasons).toEqual([
      expect.stringContaining('the call does not show the acknowledgement of'),
      expect.stringContaining('the acknowledgement'),
    ])
  })

  it('fails a provider whose open read never reaches its last page after the acknowledgement', async () => {
    const { failing, reasons } = await failures(subject => {
      const acknowledged = new Set<string>()
      return patched(subject, {
        consumption: consumption => ({
          ...consumption,
          async acknowledge(input) {
            const outcome = await consumption.acknowledge(input)
            if ('ok' in outcome) acknowledged.add(input.call)
            return outcome
          },
          async readNext(input) {
            const outcome = await consumption.readNext(input)
            return acknowledged.has(input.call) && 'ok' in outcome && outcome.ok.kind === 'reading'
              ? succeed({
                  kind: 'reading',
                  page: { ...outcome.ok.page, next: input.after },
                })
              : outcome
          },
        }),
      })
    })
    expect(failing).toEqual(['acknowledge-keeps-open-read-readable'])
    expect(reasons[0]).toBe('the read does not end')
  })

  it('fails a provider whose open read gives other blocks after the acknowledgement', async () => {
    const { failing, reasons } = await failures(subject => {
      const acknowledged = new Set<string>()
      return patched(subject, {
        consumption: consumption => ({
          ...consumption,
          async acknowledge(input) {
            const outcome = await consumption.acknowledge(input)
            if ('ok' in outcome) acknowledged.add(input.call)
            return outcome
          },
          async readNext(input) {
            const outcome = await consumption.readNext(input)
            return acknowledged.has(input.call) && 'ok' in outcome && outcome.ok.kind === 'reading'
              ? succeed({ kind: 'reading', page: { ...outcome.ok.page, parts: [] } })
              : outcome
          },
        }),
      })
    })
    expect(failing).toEqual(['acknowledge-keeps-open-read-readable'])
    expect(reasons[0]).toContain('after the acknowledgement')
  })

  it('keeps a provider that refuses a revoked reader with a failure instead of an end', async () => {
    const failing = await failingObligations(subject =>
      patched(subject, { consumption: deniedAs(() => fail({ kind: 'denied', action: 'read' })) }),
    )
    expect(failing).toEqual([])
  })

  it('keeps a provider that ends the read of a revoked reader as denied', async () => {
    const failing = await failingObligations(subject =>
      patched(subject, {
        consumption: deniedAs(() => succeed({ kind: 'ended', reason: 'denied' })),
      }),
    )
    expect(failing).toEqual([])
  })

  it('fails a provider that refuses a revoked reader with another failure', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, { consumption: deniedAs(() => fail({ kind: 'not-settled' })) }),
    )
    expect(failing).toEqual(['revoked-reader-gets-no-page'])
    expect(reasons[0]).toBe('the revoked read failed with {"kind":"not-settled"}')
  })

  it('fails a provider whose revoked reader ends for another reason', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        consumption: deniedAs(() => succeed({ kind: 'ended', reason: 'closed' })),
      }),
    )
    expect(failing).toEqual(['revoked-reader-gets-no-page'])
    expect(reasons[0]).toContain('the revoked principal still reads')
  })

  it('fails a provider whose first close does not end the read', async () => {
    const { failing, reasons } = await failures(subject => {
      let page: Extract<ReadState, { kind: 'reading' }>['page'] | undefined
      return patched(subject, {
        consumption: consumption => ({
          ...consumption,
          async beginRead(input) {
            const outcome = await consumption.beginRead(input)
            if (
              'ok' in outcome &&
              outcome.ok.kind === 'started' &&
              outcome.ok.value.kind === 'reading'
            )
              page = outcome.ok.value.page
            return outcome
          },
          async closeRead(input) {
            const outcome = await consumption.closeRead(input)
            return page === undefined || !('ok' in outcome)
              ? outcome
              : succeed({ kind: 'reading', page })
          },
        }),
      })
    })
    expect(failing).toEqual(['close-read-idempotent'])
    expect(reasons[0]).toContain('the first close gives')
  })
})

it('fails a provider that drops partial values or their actual trims from final pages', async () => {
  const { failing } = await failures(subject =>
    patched(subject, {
      consumption: consumption => ({
        ...consumption,
        async readNext(input) {
          const outcome = await consumption.readNext(input)
          if ('failure' in outcome || outcome.ok.kind !== 'reading') return outcome
          return succeed({
            kind: 'reading',
            page: {
              ...outcome.ok.page,
              parts: outcome.ok.page.parts.filter(part => part.kind === 'sealed'),
            },
          })
        },
      }),
    }),
  )
  expect(failing).toEqual(['mixed-partial-result-readable'])
})

const lostMixedFields: readonly {
  field: string
  change: (part: ResultPart) => ResultPart
}[] = [
  {
    field: 'sealed.text',
    change: part =>
      part.kind === 'sealed' && part.block.kind === 'text'
        ? { ...part, block: { ...part.block, text: '' } }
        : part,
  },
  {
    field: 'tool-arguments.value',
    change: part =>
      part.kind === 'partial' && part.content === 'tool-arguments' ? { ...part, value: '' } : part,
  },
  {
    field: 'voice.value',
    change: part =>
      part.kind === 'partial' && part.content === 'voice' ? { ...part, value: '' } : part,
  },
  {
    field: 'sealed.trims',
    change: part => (part.kind === 'sealed' ? { ...part, trims: [] } : part),
  },
  {
    field: 'partial.trims',
    change: part =>
      part.kind === 'partial' && part.content === 'tool-arguments' ? { ...part, trims: [] } : part,
  },
]

it.each(lostMixedFields)(
  'fails only the mixed result obligation after losing $field',
  async ({ change }) => {
    expect(await failingObligations(subject => subject)).toEqual([])
    let changed = 0
    const { failing, reasons } = await failures(subject => {
      const mixedCalls = new Set<string>()
      const wrapped = hooked(subject, hooks => ({
        ...hooks,
        async settleCall(input) {
          if (input.parts.some(part => part.kind === 'partial')) mixedCalls.add(input.call)
          await hooks.settleCall?.(input)
        },
      }))
      const mapParts = (parts: readonly ResultPart[]) =>
        parts.map(part => {
          const result = change(part)
          if (JSON.stringify(result) !== JSON.stringify(part)) changed += 1
          return result
        })
      return patched(wrapped, {
        consumption: consumption => ({
          ...consumption,
          async beginRead(input) {
            const outcome = await consumption.beginRead(input)
            if (
              !mixedCalls.has(referenceParts(input).call) ||
              'failure' in outcome ||
              outcome.ok.kind !== 'started' ||
              outcome.ok.value.kind !== 'reading'
            )
              return outcome
            const { value } = outcome.ok
            return succeed({
              ...outcome.ok,
              value: { ...value, page: { ...value.page, parts: mapParts(value.page.parts) } },
            })
          },
          async readNext(input) {
            const outcome = await consumption.readNext(input)
            if (
              !mixedCalls.has(input.call) ||
              'failure' in outcome ||
              outcome.ok.kind !== 'reading'
            )
              return outcome
            return succeed({
              ...outcome.ok,
              page: { ...outcome.ok.page, parts: mapParts(outcome.ok.page.parts) },
            })
          },
        }),
      })
    })
    expect(changed).toBeGreaterThan(0)
    expect(failing).toEqual(['mixed-partial-result-readable'])
    expect(reasons).toEqual([
      expect.stringContaining('the final result lost or changed parts or trims'),
    ])
  },
)

it('bounds promptly repeated next pages, disposes the subject and continues later obligations', async () => {
  const subjects: { reads: number; disposed: boolean }[] = []
  const events: string[] = []
  const report = await checkModelProviderConformance({
    subject: () => {
      const state = { reads: 0, disposed: false }
      const index = subjects.push(state) - 1
      events.push(`build-${index}`)
      const subject = createScriptedConformanceSubject()
      const mixedCalls = new Set<string>()
      const wrapped = hooked(subject, hooks => ({
        ...hooks,
        async settleCall(input) {
          if (input.parts.some(part => part.kind === 'partial')) mixedCalls.add(input.call)
          await hooks.settleCall?.(input)
        },
      }))
      return {
        ...patched(wrapped, {
          consumption: consumption => ({
            ...consumption,
            async readNext(input) {
              if (!mixedCalls.has(input.call)) return consumption.readNext(input)
              state.reads += 1
              if (state.reads > 202) throw new Error('the test readNext ceiling was exceeded')
              const outcome = await consumption.readNext(input)
              if ('failure' in outcome || outcome.ok.kind !== 'reading') return outcome
              return succeed({
                ...outcome.ok,
                page: { ...outcome.ok.page, next: input.after },
              })
            },
          }),
        }),
        async dispose() {
          await subject.dispose?.()
          state.disposed = true
          events.push(`dispose-${index}`)
        },
      }
    },
    waitMs: 300,
  })
  expect(report.ok).toBe(false)
  expect(report.results.filter(result => result.status !== 'pass')).toEqual([
    {
      obligation: 'mixed-partial-result-readable',
      status: 'fail',
      detail: 'the partial result does not end',
    },
  ])
  const index = report.results.findIndex(
    result => result.obligation === 'mixed-partial-result-readable',
  )
  const repeated = subjects[index]
  if (repeated === undefined) throw new Error('the mixed result subject was built')
  expect(repeated.reads).toBeGreaterThan(0)
  expect(repeated.reads).toBeLessThanOrEqual(200)
  expect(repeated.disposed).toBe(true)
  expect(report.results[index + 1]).toEqual({
    obligation: 'settled-call-keeps-termination',
    status: 'pass',
    detail: '',
  })
  expect(events.indexOf(`dispose-${index}`)).toBeLessThan(events.indexOf(`build-${index + 1}`))
  expect(subjects).toHaveLength(report.results.length)
  expect(subjects.every(subject => subject.disposed)).toBe(true)
  expect(report.results.at(-1)).toEqual({
    obligation: 'transport-close-is-idempotent',
    status: 'pass',
    detail: '',
  })
})

it.each([
  { page: 'first', reason: 'the partial result lost its termination' },
  { page: 'next', reason: 'the partial page changed its settlement' },
] as const)(
  'explains the mixed result failure when the $page page changes its settlement',
  async ({ page, reason }) => {
    const { failing, reasons } = await failures(subject => {
      const mixedCalls = new Set<string>()
      const wrapped = hooked(subject, hooks => ({
        ...hooks,
        async settleCall(input) {
          if (input.parts.some(part => part.kind === 'partial')) mixedCalls.add(input.call)
          await hooks.settleCall?.(input)
        },
      }))
      const change = (value: Extract<ReadState, { kind: 'reading' }>['page']) => ({
        ...value,
        settlement: {
          ...value.settlement,
          termination: { kind: 'completed', reason: 'stop' } as const,
        },
      })
      return patched(wrapped, {
        consumption: consumption => ({
          ...consumption,
          async beginRead(input) {
            const outcome = await consumption.beginRead(input)
            if (
              page !== 'first' ||
              !mixedCalls.has(referenceParts(input).call) ||
              'failure' in outcome ||
              outcome.ok.kind !== 'started' ||
              outcome.ok.value.kind !== 'reading'
            )
              return outcome
            return succeed({
              ...outcome.ok,
              value: { ...outcome.ok.value, page: change(outcome.ok.value.page) },
            })
          },
          async readNext(input) {
            const outcome = await consumption.readNext(input)
            if (
              page !== 'next' ||
              !mixedCalls.has(input.call) ||
              'failure' in outcome ||
              outcome.ok.kind !== 'reading'
            )
              return outcome
            return succeed({ ...outcome.ok, page: change(outcome.ok.page) })
          },
        }),
      })
    })
    expect(failing).toEqual(['mixed-partial-result-readable'])
    expect(reasons).toEqual([reason])
  },
)
