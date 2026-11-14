import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolLookup, ToolState } from '@omne-harness/tool-contract'
import { contactCall } from '../src/contact.ts'
import type { ToolCallLiveness, ToolDependencies } from '../src/construction.ts'
import {
  callId,
  operationId,
  principalA,
  referenceFor,
  tenantA,
  type Block,
  type Principal,
} from './runtime-values.ts'

type Reads = ToolDependencies<Principal, Block, unknown>['reads']

const query = { principal: principalA, tenant: tenantA, reference: referenceFor('call-1', 'op-1') }

const found = (phase: ToolState['phase']): ToolLookup => ({
  kind: 'found',
  state: { phase } as ToolState,
})

function world(
  answer: Awaited<ReturnType<Reads['lookup']>>,
  living?: Readonly<{ holds: boolean; attach: boolean | 'throws' }>,
) {
  const asked = { lookup: 0, holds: 0, attach: 0 }
  const reads = {
    lookup: async () => {
      asked.lookup += 1
      return answer
    },
  } as unknown as Reads
  const liveness: ToolCallLiveness | undefined =
    living === undefined
      ? undefined
      : {
          holds: call => {
            expect(call).toEqual({ tenant: tenantA, call: callId('call-1') })
            asked.holds += 1
            return living.holds
          },
          attach: async call => {
            expect(call).toEqual({ tenant: tenantA, call: callId('call-1') })
            asked.attach += 1
            if (living.attach === 'throws') throw new Error('attach failed')
            return living.attach
          },
        }
  return {
    asked,
    contact: (input: unknown = query) =>
      contactCall<Principal, Block, unknown>(
        liveness === undefined ? { reads } : { reads, liveness },
        input,
      ),
  }
}

describe('contact: the answer of the records and the living half (spec 16, 4.1)', () => {
  it('a call the records do not hold is not-accepted, and the living half is not asked', async () => {
    const w = world(succeed({ kind: 'not-accepted', operation: operationId('op-1') }), {
      holds: true,
      attach: true,
    })
    expect(await w.contact()).toEqual({ ok: { kind: 'not-accepted' } })
    expect(w.asked).toEqual({ lookup: 1, holds: 0, attach: 0 })
  })

  it.each(['accepted', 'preparing', 'queued', 'starting', 'running', 'suspended'] as const)(
    'an unsettled call (%s) that the living half holds is holding, without an attach',
    async phase => {
      const w = world(succeed(found(phase)), { holds: true, attach: false })
      expect(await w.contact()).toEqual({ ok: { kind: 'holding' } })
      expect(w.asked).toEqual({ lookup: 1, holds: 1, attach: 0 })
    },
  )

  it('an unsettled call that is not held is taken back: holding when the attach took it', async () => {
    const w = world(succeed(found('running')), { holds: false, attach: true })
    expect(await w.contact()).toEqual({ ok: { kind: 'holding' } })
    expect(w.asked).toEqual({ lookup: 1, holds: 1, attach: 1 })
  })

  it('an unsettled call that the attach did not take is unknown', async () => {
    const w = world(succeed(found('running')), { holds: false, attach: false })
    expect(await w.contact()).toEqual({ ok: { kind: 'unknown' } })
    expect(w.asked).toEqual({ lookup: 1, holds: 1, attach: 1 })
  })

  it('an unsettled call whose attach throws is unknown', async () => {
    const w = world(succeed(found('running')), { holds: false, attach: 'throws' })
    expect(await w.contact()).toEqual({ ok: { kind: 'unknown' } })
  })

  it('an unsettled call without a living half is unknown', async () => {
    const w = world(succeed(found('running')))
    expect(await w.contact()).toEqual({ ok: { kind: 'unknown' } })
  })

  it('a settled call is settled whether held or not; one that is not held is offered to the attach', async () => {
    const held = world(succeed(found('settled')), { holds: true, attach: false })
    expect(await held.contact()).toEqual({ ok: { kind: 'settled' } })
    expect(held.asked).toEqual({ lookup: 1, holds: 1, attach: 0 })
    const absent = world(succeed(found('settled')), { holds: false, attach: false })
    expect(await absent.contact()).toEqual({ ok: { kind: 'settled' } })
    expect(absent.asked).toEqual({ lookup: 1, holds: 1, attach: 1 })
  })

  it('a lookup that fails is the answer, and the living half is not asked', async () => {
    const failure = { kind: 'unavailable', dependency: 'store', diagnostic: 'down' } as const
    const w = world(fail(failure), { holds: true, attach: true })
    expect(await w.contact()).toEqual({ failure })
    expect(w.asked).toEqual({ lookup: 1, holds: 0, attach: 0 })
  })

  it('a reference that does not decode is refused before any read', async () => {
    const w = world(succeed(found('running')), { holds: true, attach: true })
    expect(await w.contact({ ...query, reference: 'not-a-reference' })).toMatchObject({
      failure: { kind: 'invalid', field: 'reference' },
    })
    expect(w.asked).toEqual({ lookup: 0, holds: 0, attach: 0 })
  })
})
