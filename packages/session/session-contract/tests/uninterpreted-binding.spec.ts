import { describe, expect, it } from 'vitest'
import type {
  CallBinding,
  ConsumptionId,
  SessionLogConsequence,
} from '@omne-harness/session-contract'
import { evidence, operationId } from '@omne-harness/session-contract/testing'
import { decideProducerFact } from '../src/decide-receive.ts'
import { resultRefusal } from '../src/decide-results.ts'
import type { SessionHistoryReads } from '../src/history-values.ts'
import { uninterpretedCalls } from '../src/uninterpreted-calls.ts'
import { open } from './scene.ts'

const consumption = 'later-consumption' as ConsumptionId

async function unbound() {
  const s = await open()
  const { run, advance } = await s.active()
  const binding: CallBinding = {
    producer: { kind: 'tool', call: 'later-call' },
    action: 'later-action',
    consumer: { owner: 'session', work: 'work', position: 'later-position', purpose: 'action' },
    request: evidence('request'),
    initiatingAttempt: advance.attempt,
  }
  const history = (consequences: readonly SessionLogConsequence[]) =>
    ({
      uninterpreted: uninterpretedCalls(run.execution.execution, [{ sequence: '1', consequences }]),
    }) as unknown as SessionHistoryReads
  const registered = history([
    {
      kind: 'call-registration',
      consumption,
      registration: { kind: 'associated', binding: binding as never, purpose: 'action' },
    },
  ])
  const associated = history([
    { kind: 'call-association', consumption, binding, source: evidence('association') },
  ])
  const result = {
    producer: binding.producer,
    version: '1',
    delivery: null,
    source: evidence('result'),
  }
  return { s, snapshot: await s.read(), binding, registered, associated, result }
}

describe('a binding Session has not interpreted yet', () => {
  it('a result decision waits while the uninterpreted Agent records carry the binding', async () => {
    const { snapshot, registered, result } = await unbound()
    expect(snapshot.consumptions.some(item => item.id === consumption)).toBe(false)
    expect(
      resultRefusal(snapshot, consumption, result, operationId('process'), registered),
    ).toEqual({
      kind: 'rejected',
      failure: {
        kind: 'unavailable',
        owner: 'session-history',
        diagnostic: 'the binding of the call is in Agent records Session has not interpreted yet',
      },
    })
  })

  it('a result decision without such a record still refuses the binding', async () => {
    const { snapshot, result } = await unbound()
    const refusal = resultRefusal(snapshot, consumption, result, operationId('process'))
    expect(refusal?.kind).toBe('rejected')
    expect(refusal?.kind === 'rejected' && refusal.failure).toMatchObject({
      kind: 'invalid',
      field: 'consumption',
    })
  })

  it('an execution fact waits while the uninterpreted Agent records associate its producer', async () => {
    const { s, snapshot, binding, associated } = await unbound()
    const command = {
      kind: 'receive' as const,
      input: {
        ...s.base,
        operation: operationId('fact'),
        fact: {
          kind: 'execution' as const,
          producer: binding.producer,
          source: evidence('fact'),
          fact: { kind: 'started' },
        },
      },
    }
    const waiting = decideProducerFact(snapshot, command as never, undefined, associated)
    expect(waiting.kind === 'rejected' && waiting.failure.kind).toBe('unavailable')
    const refused = decideProducerFact(snapshot, command as never)
    expect(refused.kind === 'rejected' && refused.failure).toMatchObject({
      kind: 'invalid',
      field: 'fact.producer',
    })
  })
})
