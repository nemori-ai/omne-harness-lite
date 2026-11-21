import { decodeCompactionTaskId, decodeConsumptionId } from '@omne-harness/agent-contract'
import { judgeMessage } from '@omne-harness/message'
import { describe, expect, it } from 'vitest'
import type { ContextMeasureEvent } from '@omne-harness/agent-context'
import {
  HEAD,
  authority,
  createWorld,
  meterBy,
  userMessage,
  evidence,
  tenantOf,
  type WorldOptions,
} from './fixtures/context-world.ts'

async function observed(options: WorldOptions = {}) {
  const events: ContextMeasureEvent[] = []
  const w = await createWorld({ ...options, measure: event => events.push(event) })
  return { w, events }
}

const calls = (events: readonly ContextMeasureEvent[]) =>
  events.map(event => `${event.operation}:${event.phase}`)

describe('the Context segment', () => {
  it('prepare emits one start and one end, with the execution', async () => {
    const { w, events } = await observed()
    const result = await w.requests.prepare(w.prepareInput())
    expect('ok' in result).toBe(true)
    expect(calls(events)).toEqual(['prepare:start', 'prepare:end'])
    expect(events.every(event => event.execution === authority().execution)).toBe(true)
    expect(events.filter(event => event.phase === 'end').map(event => event.outcome)).toEqual([
      'ok',
    ])
    expect(events[0]?.span).toBe(events[1]?.span)
  })

  it('assessment and resume emit their own segments; an answer with a failure ends as failure', async () => {
    const { w, events } = await observed({ meter: meterBy(500) })
    const original = await w.requests.prepare(w.prepareInput())
    if (!('ok' in original) || original.ok.kind !== 'needs-compaction')
      throw new Error('expected needs-compaction')
    events.length = 0
    const task = decodeCompactionTaskId('task-measured')
    const consumption = decodeConsumptionId('consumption-measured')
    const frozen = w.frozen[0]
    if ('failure' in task || 'failure' in consumption || frozen === undefined)
      throw new Error('fixture')
    const message = judgeMessage({
      role: 'compaction',
      id: frozen.outputMessageId,
      blocks: userMessage(9, 'summary').blocks,
      covers: { from: frozen.history.origin, to: frozen.history.upper },
      retained: [],
      derivation: evidence('wrong-generation'),
    })
    if (!('ok' in message) || message.ok.role !== 'compaction') throw new Error('fixture')
    await w.requests.assessCompaction({
      ...w.access,
      advance: authority(),
      original: original.ok,
      task: { authority: 'test', task: task.ok, requestDigest: 'request' },
      consumption: consumption.ok,
      result: { version: '1', evidence: evidence('result'), digest: 'd' },
      received: evidence('received'),
      message: message.ok,
    })
    const resumed = await w.requests.resume({
      ...w.access,
      advance: authority(),
      original: original.ok,
      transition: { ...w.selection.evidence },
      history: HEAD,
      selection: w.selection,
    })
    expect(calls(events)).toEqual([
      'assess-compaction:start',
      'assess-compaction:end',
      'resume:start',
      'resume:end',
    ])
    const resume = events.find(event => event.operation === 'resume' && event.phase === 'end')
    expect(resume && 'outcome' in resume && resume.outcome).toBe(
      'failure' in resumed ? 'failure' : 'ok',
    )
  })

  it('a refused prepare ends its segment as failure', async () => {
    const { w, events } = await observed()
    events.length = 0
    const refused = await w.requests.prepare(
      w.prepareInput({ principal: 'bob', tenant: tenantOf('2') }),
    )
    expect('failure' in refused).toBe(true)
    expect(events.at(-1)).toMatchObject({ operation: 'prepare', phase: 'end', outcome: 'failure' })
  })

  it('answers are the same with and without an observer; an observer that throws changes none', async () => {
    const plain = await createWorld()
    const watched = (await observed()).w
    const crashing = await createWorld({
      measure: () => {
        throw new Error('observer crashed')
      },
    })
    const prepare = async (w: typeof plain) => {
      const result = await w.requests.prepare(w.prepareInput())
      if (!('ok' in result)) return result
      return { kind: result.ok.kind, input: 'input' in result.ok ? result.ok.input : null }
    }
    const expected = await prepare(plain)
    expect(expected).toMatchObject({ kind: 'assembled' })
    expect(await prepare(watched)).toEqual(expected)
    expect(await prepare(crashing)).toEqual(expected)
  })
})
