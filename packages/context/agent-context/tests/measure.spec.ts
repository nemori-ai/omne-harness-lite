// SPEC「测量事件」: the Context segment of each call that Agent makes into agent-context (read,
// prepare, derive, resume), and the absence of any change when no observer is given.
import { describe, expect, it } from 'vitest'
import type { ContextMeasureEvent } from '@omne-harness/agent-context'
import {
  authority,
  createWorld,
  meterBy,
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
  it('read then prepare emit one start and one end each, in call order, with the execution', async () => {
    const { w, events } = await observed()
    const context = await w.read()
    const result = await w.requests.prepare(w.prepareInput(context))
    expect('ok' in result).toBe(true)
    expect(calls(events)).toEqual(['read:start', 'read:end', 'prepare:start', 'prepare:end'])
    expect(events.every(event => event.execution === authority().execution)).toBe(true)
    expect(events.filter(event => event.phase === 'end').map(event => event.outcome)).toEqual([
      'ok',
      'ok',
    ])
    expect(events[0]?.span).toBe(events[1]?.span)
    expect(events[2]?.span).toBe(events[3]?.span)
    expect(events[0]?.span).not.toBe(events[2]?.span)
  })

  it('derive and resume emit their own segments; an answer with a failure ends as failure', async () => {
    const { w, events } = await observed({ meter: meterBy(500) })
    const context = await w.read()
    const original = await w.requests.prepare(w.prepareInput(context))
    if (!('ok' in original) || original.ok.kind !== 'needs-compaction')
      throw new Error('expected needs-compaction')
    events.length = 0
    await w.requests.derive({
      ...w.access,
      advance: authority(),
      original: original.ok,
      progress: original.ok.progress,
      action: original.ok.id,
      selection: w.selection,
      result: null,
    })
    const after = await w.read({ transition: { ...w.selection.evidence } })
    const resumed = await w.requests.resume({
      ...w.access,
      advance: authority(),
      original: original.ok,
      transition: { ...w.selection.evidence },
      selection: w.selection,
      context: after,
    })
    expect(calls(events)).toEqual([
      'derive:start',
      'derive:end',
      'read:start',
      'read:end',
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
    const context = await w.read()
    events.length = 0
    const refused = await w.requests.prepare(
      w.prepareInput(context, { principal: 'bob', tenant: tenantOf('2') }),
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
    // The record key names the instance of its world, so the comparison leaves `source` and `state` out.
    const prepare = async (w: typeof plain) => {
      const result = await w.requests.prepare(w.prepareInput(await w.read()))
      if (!('ok' in result)) return result
      return { kind: result.ok.kind, input: 'input' in result.ok ? result.ok.input : null }
    }
    const expected = await prepare(plain)
    expect(expected).toMatchObject({ kind: 'assembled' })
    expect(await prepare(watched)).toEqual(expected)
    expect(await prepare(crashing)).toEqual(expected)
  })
})
