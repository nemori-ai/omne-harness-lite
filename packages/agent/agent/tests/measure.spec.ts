// SPEC「测量事件」: the Agent segment of an execution (the acceptance pass and each drive pass) and
// the absence of any change when no observer is given.
import { describe, expect, it, vi } from 'vitest'
import type { AgentMeasureEvent } from '@omne-harness/agent'
import { execution, ok } from './journal-support.ts'
import { eventsOf, invoke, loopAssembly } from './loop-support.ts'

const segments = (events: readonly AgentMeasureEvent[]) =>
  events.map(event => [event.pass, event.phase, event.execution])

describe('the Agent segment', () => {
  it('one invoke emits the acceptance pass, then at least one drive pass, each start before its end', async () => {
    const events: AgentMeasureEvent[] = []
    const assembly = await loopAssembly([execution()], d => d, undefined, undefined, {
      measure: event => events.push(event),
    })
    const handle = ok(await invoke(assembly))
    assembly.release.open()
    await eventsOf(handle)
    // The drive pass that ended the execution closes after the ended event is readable.
    await vi.waitFor(() => {
      const runs = events.filter(event => event.pass === 'run')
      expect(runs.length).toBeGreaterThanOrEqual(2)
      expect(runs.at(-1)?.phase).toBe('end')
    })
    expect(segments(events).slice(0, 3)).toEqual([
      ['accept', 'start', execution()],
      ['accept', 'end', execution()],
      ['run', 'start', execution()],
    ])
    expect(events.filter(event => event.pass === 'run').length % 2).toBe(0)
    expect(
      events
        .filter(event => event.phase === 'end')
        .map(event => 'outcome' in event && event.outcome),
    ).not.toContain('failure')
    // The spans pair: every end follows its own start.
    const open = new Set<number>()
    for (const event of events) {
      if (event.phase === 'start') open.add(event.span)
      else expect(open.delete(event.span)).toBe(true)
    }
    expect(open.size).toBe(0)
  })

  it('the instance reaches the same ended execution with and without an observer', async () => {
    const events: AgentMeasureEvent[] = []
    const observed = await loopAssembly([execution()], d => d, undefined, undefined, {
      measure: event => events.push(event),
    })
    const plain = await loopAssembly([execution()])
    const kinds = async (assembly: typeof observed) => {
      const handle = ok(await invoke(assembly))
      assembly.release.open()
      return (await eventsOf(handle)).map(event => event.body.kind)
    }
    expect(await kinds(observed)).toEqual(await kinds(plain))
    expect(events.length).toBeGreaterThan(0)
  })

  it('an observer that throws changes no answer', async () => {
    const assembly = await loopAssembly([execution()], d => d, undefined, undefined, {
      measure: () => {
        throw new Error('observer crashed')
      },
    })
    const handle = ok(await invoke(assembly))
    assembly.release.open()
    const events = await eventsOf(handle)
    expect(events.map(event => event.body.kind).at(-1)).toBe('ended')
  })
})
