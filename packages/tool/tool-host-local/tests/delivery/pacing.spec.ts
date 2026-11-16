import { expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { ConsumerRef, ToolCallId, ToolDeliveryId } from '@omne-harness/tool-contract'
import { callKeyOf, createDeliveryPacing, type Owed } from '../../src/delivery-pacing.ts'
import { callId, tenantA } from '../coordinator-values.ts'

const consumer: ConsumerRef = { owner: 'agent', work: 'w', position: 'p', purpose: 'action' }
const owed = (digest: string): Owed => ({
  digest,
  payload: { delivery: 'd1' as ToolDeliveryId, consumer },
})

function pacing(start = 1000) {
  let clock = start
  const said: string[] = []
  const paced = createDeliveryPacing({
    pacing: { initialMs: 10, maxMs: 40 },
    now: () => clock,
    say: message => said.push(message),
  })
  return { paced, said, advance: (ms: number) => (clock += ms) }
}

const call = { tenant: tenantA, call: callId('paced') }

function otherTenant() {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: `org_${'0'.repeat(26)}`, account: `acc_${'9'.repeat(26)}` }),
  )
  if (!parsed.ok) throw new Error('fixture tenant')
  return parsed.value
}

it('keys a call by its tenant and its call identity', () => {
  expect(callKeyOf(call)).not.toBe(callKeyOf({ ...call, tenant: otherTenant() }))
  expect(callKeyOf(call)).not.toBe(callKeyOf({ ...call, call: 'other' as ToolCallId }))
  expect(callKeyOf(call)).toBe(callKeyOf({ ...call }))
})

it('doubles the delay up to the cap and keeps a delivery away until the delay ends', () => {
  const { paced, said, advance } = pacing()
  paced.unavailable(call, owed('a'), { dependency: 'receiver', diagnostic: 'down' })
  expect(paced.away(call, owed('a'))).toMatchObject({ delay: 10, dependency: 'receiver' })
  expect(said.at(-1)).toContain('(receiver: down)')
  paced.unavailable(call, owed('a'), { dependency: 'receiver' })
  paced.unavailable(call, owed('a'), { dependency: 'receiver' })
  paced.unavailable(call, owed('a'), { dependency: 'receiver' })
  expect(paced.away(call, owed('a'))).toMatchObject({ delay: 40 })
  expect(said.at(-1)).toContain('(receiver);')
  advance(40)
  expect(paced.away(call, owed('a'))).toBeNull()
})

it('drops the entries of a call once each settles, and forgets an emptied call', () => {
  const { paced } = pacing()
  paced.unavailable(call, owed('a'), { dependency: 'receiver' })
  paced.unavailable(call, owed('b'), { dependency: 'receiver' })
  expect(paced.entries()).toBe(2)
  paced.settled(call, owed('a'))
  expect(paced.entries()).toBe(1)
  expect(paced.away(call, owed('b'))).not.toBeNull()
  paced.settled(call, owed('b'))
  expect(paced.entries()).toBe(0)
  paced.unavailable(call, owed('b'), { dependency: 'receiver' })
  expect(paced.away(call, owed('b'))).toMatchObject({ delay: 10 })
})

it('keeps only the owed digests on retain, and a failure clears its entry without pacing it', () => {
  const { paced, said } = pacing()
  paced.unavailable(call, owed('a'), { dependency: 'receiver' })
  paced.unavailable(call, owed('b'), { dependency: 'receiver' })
  paced.retain(call, new Set(['b']))
  expect(paced.entries()).toBe(1)
  expect(paced.away(call, owed('a'))).toBeNull()
  paced.retain(call, new Set())
  expect(paced.entries()).toBe(0)
  paced.unavailable(call, owed('a'), { dependency: 'receiver' })
  paced.failed(call, owed('a'), 'denied')
  expect(paced.entries()).toBe(0)
  expect(said.at(-1)).toContain('failed definitively (denied)')
  paced.unavailable(call, owed('a'), { dependency: 'receiver' })
  paced.forget(call)
  expect(paced.entries()).toBe(0)
  paced.unavailable(call, owed('a'), { dependency: 'receiver' })
  paced.clear()
  expect(paced.entries()).toBe(0)
})
