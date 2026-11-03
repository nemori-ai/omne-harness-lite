// The ordered stop of the `agent-host` plugin on real Cordis 4.0.4 (SPEC "有序停止", docs/cordis.md
// "停止准入与撤除"): `quiesceAll` closes admission first, then quiesces every published instance the
// host runs, whatever its last report. Only `drained` unloads the contribution fiber; the answer is
// `settled` only when every instance drained before the signal aborted, and otherwise names each
// instance that did not and why.
//
// The scripted cases run with `withRuntimeDuties` (host-support.ts), which stands in for the
// runtime's quiesce; they prove the host side only. The case "plain factory" runs the real Agent
// factory, whose quiesce drains an idle instance (R2-D173, R2-D185; agent SPEC "停用"): the stop is
// settled and the instance is withdrawn.
import type { AgentInstanceId } from '@omne-harness/agent-contract'
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentHostStopResult } from '../src/host-plugin.ts'
import {
  IDLE_MS,
  caller,
  occupied,
  ok,
  openWorld,
  slotOf,
  turns,
  type World,
  type WorldOptions,
} from './host-support.ts'

const opened: World[] = []
afterEach(async () => {
  for (const world of opened.splice(0)) await world.dispose()
})

async function world(options: WorldOptions = { factory: 'duties' }): Promise<World> {
  const made = await openWorld(options)
  opened.push(made)
  return made
}

/** A signal that never aborts within a test. */
const open = () => new AbortController().signal

async function retiredOf(host: World, instance: AgentInstanceId): Promise<string | undefined> {
  for (let turn = 0; turn < 50; turn += 1) {
    const found = host.retired.find(entry => entry.instance === instance)
    if (found !== undefined) return found.reason
    await turns(1)
  }
  return undefined
}

function unsettledOf(answer: AgentHostStopResult) {
  return answer.kind === 'settled' ? [] : answer.instances
}

describe('the ordered stop of the agent-host plugin', () => {
  it('answers settled with no instance, and refuses every later acquire', async () => {
    const host = await world()
    expect(await host.plugin.quiesceAll({ signal: open() })).toEqual({ kind: 'settled' })
    const later = await host.provision.acquire(slotOf('a'))
    expect(later).toMatchObject({
      failure: { kind: 'unavailable', owner: 'agent-host', diagnostic: expect.any(String) },
    })
    expect(host.handles.size).toBe(0)
  })

  it('answers settled with no host body running: there is nothing to stop', async () => {
    const host = await world({ factory: 'duties', omit: 'agentClock' })
    expect(await host.plugin.quiesceAll({ signal: open() })).toEqual({ kind: 'settled' })
  })

  it('quiesces an idle and an occupied instance, and both drain and unload', async () => {
    const host = await world()
    const idle = ok(await host.provision.acquire(slotOf('a'))).instance
    const busy = ok(await host.provision.acquire(slotOf('b'))).instance
    // The second instance has an execution in flight; the ordered stop does not wait for idle.
    host.handles.get(busy)?.report({ state: occupied(busy) })
    const answer = await host.plugin.quiesceAll({ signal: open() })
    expect(answer).toEqual({ kind: 'settled' })
    expect([...host.quiesced].sort()).toEqual([idle, busy].sort())
    expect(await retiredOf(host, idle)).toBe('withdrawn')
    expect(await retiredOf(host, busy)).toBe('withdrawn')
    expect(await host.directory.resolve({ ...caller('a'), instance: idle })).toHaveProperty(
      'failure',
    )
  })

  it('unloads the contribution fiber of a drained instance', async () => {
    const host = await world()
    const { instance } = ok(await host.provision.acquire(slotOf('a')))
    // The runtime answers drained but keeps its registration: only the unload can end it.
    host.quiesceAnswers.push('drained-kept')
    expect(await host.plugin.quiesceAll({ signal: open() })).toEqual({ kind: 'settled' })
    expect(host.retired).toEqual([
      expect.objectContaining({ instance, reason: 'contributor-removed' }),
    ])
  })

  it('answers incomplete and names the instance whose quiesce is unresolved', async () => {
    const host = await world()
    const left = ok(await host.provision.acquire(slotOf('a'))).instance
    const drained = ok(await host.provision.acquire(slotOf('b'))).instance
    host.quiesceAnswers.push('unresolved', 'drained')
    const answer = await host.plugin.quiesceAll({ signal: open() })
    expect(answer.kind).toBe('incomplete')
    expect(unsettledOf(answer)).toEqual([
      { instance: left, reason: expect.stringContaining('unresolved') },
    ])
    expect(answer.kind === 'incomplete' && answer.detail).toContain(left)
    // The unresolved instance stays published for the fiber unload; the drained one ended.
    ok(await host.directory.resolve({ ...caller('a'), instance: left }))
    expect(await retiredOf(host, drained)).toBe('withdrawn')
    expect(host.retired.some(entry => entry.instance === left)).toBe(false)
  })

  // R2-D173, R2-D185: the real factory drains an idle instance through its registration handle.
  // Before them its quiesce answered the stage-temporary `unavailable` and this stop was incomplete.
  it('answers settled with the plain factory: the idle instance drains and is withdrawn', async () => {
    const host = await world({ factory: 'plain' })
    const { instance } = ok(await host.provision.acquire(slotOf('a')))
    expect(await host.plugin.quiesceAll({ signal: open() })).toEqual({ kind: 'settled' })
    expect(await retiredOf(host, instance)).toBe('withdrawn')
    expect(await host.directory.resolve({ ...caller('a'), instance })).toHaveProperty('failure')
  })

  it('answers incomplete for a quiesce that throws', async () => {
    const host = await world()
    const { instance } = ok(await host.provision.acquire(slotOf('a')))
    host.quiesceAnswers.push('throw')
    const answer = await host.plugin.quiesceAll({ signal: open() })
    expect(unsettledOf(answer)).toEqual([
      { instance, reason: expect.stringContaining('the runtime broke during quiesce') },
    ])
  })

  it('answers incomplete at the deadline when a quiesce gives no answer', async () => {
    const host = await world()
    const hung = ok(await host.provision.acquire(slotOf('a'))).instance
    const drained = ok(await host.provision.acquire(slotOf('b'))).instance
    host.quiesceAnswers.push('hang', 'drained')
    const deadline = new AbortController()
    const stopping = host.plugin.quiesceAll({ signal: deadline.signal })
    await turns()
    deadline.abort()
    const answer = await stopping
    expect(unsettledOf(answer)).toEqual([
      { instance: hung, reason: expect.stringContaining('deadline') },
    ])
    expect(await retiredOf(host, drained)).toBe('withdrawn')
  })

  it('refuses acquire while the stop waits on a quiesce, and builds nothing', async () => {
    const host = await world()
    const { instance } = ok(await host.provision.acquire(slotOf('a')))
    host.quiesceAnswers.push('hang')
    const deadline = new AbortController()
    const stopping = host.plugin.quiesceAll({ signal: deadline.signal })
    const during = await host.provision.acquire(slotOf('a'))
    const other = await host.provision.acquire(slotOf('b'))
    expect(during).toMatchObject({ failure: { kind: 'unavailable', owner: 'agent-host' } })
    expect(other).toMatchObject({ failure: { kind: 'unavailable', owner: 'agent-host' } })
    expect([...host.handles.keys()]).toEqual([instance])
    deadline.abort()
    expect(unsettledOf(await stopping)).toEqual([{ instance, reason: expect.any(String) }])
  })

  it('keeps admission closed after the stop: no acquire of a published instance, no reclaim', async () => {
    const host = await world()
    const { instance } = ok(await host.provision.acquire(slotOf('a')))
    host.quiesceAnswers.push('unresolved')
    expect((await host.plugin.quiesceAll({ signal: open() })).kind).toBe('incomplete')
    // The instance is published and idle again, but its slot does not answer any more.
    ok(await host.directory.resolve({ ...caller('a'), instance }))
    expect(await host.provision.acquire(slotOf('a'))).toMatchObject({
      failure: { kind: 'unavailable', owner: 'agent-host' },
    })
    host.advance(IDLE_MS + 1)
    await turns()
    expect(host.quiesced).toEqual([instance])
  })
})
