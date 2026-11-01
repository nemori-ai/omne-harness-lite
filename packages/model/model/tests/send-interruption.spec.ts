// The stop that a committed cancel fires reaches only the send of its own tenant and call, joins
// the drive's signal, and ends with the facts of that send. The inner boundary here records the
// signal it gets and hands out a stream that the test ends.
import { expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ModelCallId } from '@omne-harness/model-contract'
import type {
  ModelSendBoundary,
  SendDemand,
  SendResult,
  TransportFact,
} from '@omne-harness/model-contract/provider'
import { createSendInterruption } from '../src/send/interruption.ts'
import { callId, identity } from './memory-fixture.ts'

type Demand = SendDemand<unknown>

/** A demand with only the fields the wrapper reads; the inner boundary never looks further. */
function demandOf(tenant: TenantId, call: ModelCallId): Demand {
  return { tenant, call } as unknown as Demand
}

const ENDED: TransportFact = {
  kind: 'ended',
  termination: { kind: 'completed', reason: 'stop' },
}

function innerBoundary(answer: 'started' | 'not-started' = 'started') {
  const signals: AbortSignal[] = []
  const inner: ModelSendBoundary<unknown> = {
    async send(_demand, signal): Promise<SendResult> {
      signals.push(signal)
      if (answer === 'not-started')
        return {
          kind: 'not-started',
          failure: { kind: 'unavailable', dependency: 'test', diagnostic: 'refused' },
        }
      return {
        kind: 'started',
        window: 'window',
        facts: {
          async *[Symbol.asyncIterator]() {
            yield ENDED
          },
        },
      }
    },
  }
  return { inner, signals }
}

it('stops the send of the cancelled call and of no other call or tenant', async () => {
  const { inner, signals } = innerBoundary()
  const wrapped = createSendInterruption(inner)
  const drive = new AbortController().signal
  await wrapped.send.send(demandOf(identity('5'), callId('a')), drive)
  await wrapped.send.send(demandOf(identity('5'), callId('b')), drive)
  await wrapped.send.send(demandOf(identity('6'), callId('a')), drive)
  const [a, b, foreign] = signals

  wrapped.interrupt({ tenant: identity('5'), call: callId('a') })

  expect(a?.aborted).toBe(true)
  expect(b?.aborted).toBe(false)
  expect(foreign?.aborted).toBe(false)
})

it('still passes the abort of the drive to the send', async () => {
  const { inner, signals } = innerBoundary()
  const wrapped = createSendInterruption(inner)
  const drive = new AbortController()
  await wrapped.send.send(demandOf(identity('5'), callId('a')), drive.signal)

  drive.abort()

  expect(signals[0]?.aborted).toBe(true)
})

it('stops nothing once the facts of the send have ended', async () => {
  const { inner, signals } = innerBoundary()
  const wrapped = createSendInterruption(inner)
  const result = await wrapped.send.send(
    demandOf(identity('5'), callId('a')),
    new AbortController().signal,
  )
  if (result.kind !== 'started') throw new Error('the send did not start')
  const facts: TransportFact[] = []
  for await (const fact of result.facts) facts.push(fact)
  expect(facts).toEqual([ENDED])

  wrapped.interrupt({ tenant: identity('5'), call: callId('a') })

  expect(signals[0]?.aborted).toBe(false)
})

it('stops nothing for a send that did not start', async () => {
  const { inner, signals } = innerBoundary('not-started')
  const wrapped = createSendInterruption(inner)
  const result = await wrapped.send.send(
    demandOf(identity('5'), callId('a')),
    new AbortController().signal,
  )
  expect(result.kind).toBe('not-started')

  wrapped.interrupt({ tenant: identity('5'), call: callId('a') })

  expect(signals[0]?.aborted).toBe(false)
})
