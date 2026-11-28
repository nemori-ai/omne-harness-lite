import { describe, expect, it } from 'vitest'
import { createStandaloneRegistry } from '../src/registry/desk.ts'
import { NOTES, notesContribution } from './support/test-contribution.ts'
import { mustEnter } from './support/enter.ts'

async function readTitle(registry: ReturnType<typeof createStandaloneRegistry>): Promise<unknown> {
  const entered = mustEnter(registry, NOTES, 'read-note')
  if (entered.member.kind !== 'operation') throw new Error('read-note is not an operation')
  const answer = await entered.member.handler(
    { principal: undefined, messageId: 'm', signal: entered.signal },
    { noteId: 'n-1' },
  )
  entered.leave()
  return answer
}

describe('mount', () => {
  it('挂上同名协议第二次：两份都在，都不服务，答冲突并写明哪两家；撤掉一份，另一份立刻答复', async () => {
    const registry = createStandaloneRegistry()
    const takeFirst = registry.mount(notesContribution('first'))
    registry.mount(notesContribution('second'))
    expect(registry.enter(NOTES, 'read-note')).toEqual({
      refused: 'conflict',
      by: ['mount-1#1', 'mount-2#1'],
    })
    await takeFirst()
    expect(await readTitle(registry)).toEqual({
      outcome: 'succeeded',
      body: { noteId: 'n-1', title: 'second' },
    })
  })
})

describe('enter', () => {
  it('finds operations and observations of a mounted protocol and nothing else', () => {
    const registry = createStandaloneRegistry()
    expect(registry.enter(NOTES, 'read-note')).toEqual({ refused: 'not-mounted' })
    registry.mount(notesContribution('first'))
    expect(mustEnter(registry, NOTES, 'read-note').member.kind).toBe('operation')
    expect(mustEnter(registry, NOTES, 'watch-note').member.kind).toBe('observation')
    expect(registry.enter(NOTES, 'delete-note')).toEqual({ refused: 'not-offered' })
    expect(registry.enter({ name: 'notes', major: 2 }, 'read-note')).toEqual({
      refused: 'not-mounted',
    })
    expect(registry.enter({ name: 'other', major: 1 }, 'read-note')).toEqual({
      refused: 'not-mounted',
    })
  })

  it('does not find names that only the object prototype has', () => {
    const registry = createStandaloneRegistry()
    registry.mount(notesContribution('first'))
    for (const name of ['toString', 'constructor', '__proto__', 'hasOwnProperty'])
      expect(registry.enter(NOTES, name)).toEqual({ refused: 'not-offered' })
  })

  it('does not count a name outside the contract as in flight', async () => {
    const registry = createStandaloneRegistry()
    const takeDown = registry.mount(notesContribution('first'))
    registry.enter(NOTES, 'delete-note')
    await expect(takeDown()).resolves.toBeUndefined()
  })
})

describe('take-down', () => {
  it('调用登记成在途之后撤下协议，中止信号被触发', () => {
    const registry = createStandaloneRegistry()
    const takeDown = registry.mount(notesContribution('first'))
    const entered = mustEnter(registry, NOTES, 'save-note')
    expect(entered?.signal.aborted).toBe(false)
    void takeDown()
    expect(entered?.signal.aborted).toBe(true)
    expect(registry.enter(NOTES, 'save-note')).toEqual({ refused: 'not-mounted' })
  })

  it('撤下并等它完成，此时每个在途调用都已答复', async () => {
    const registry = createStandaloneRegistry()
    const takeDown = registry.mount(notesContribution('first'))
    const read = mustEnter(registry, NOTES, 'read-note')
    const save = mustEnter(registry, NOTES, 'save-note')
    if (read === undefined || save === undefined) throw new Error('not mounted')
    const answered = { read: false, save: false }
    let done = false
    const drained = takeDown().then(() => {
      done = true
      return { ...answered }
    })
    await Promise.resolve()
    expect(done).toBe(false)
    answered.read = true
    read.leave()
    await Promise.resolve()
    expect(done).toBe(false)
    answered.save = true
    save.leave()
    expect(await drained).toEqual({ read: true, save: true })
  })

  it('waits for an observation to leave as it waits for a call', async () => {
    const registry = createStandaloneRegistry()
    const takeDown = registry.mount(notesContribution('first'))
    const watch = mustEnter(registry, NOTES, 'watch-note')
    let done = false
    const drained = takeDown().then(() => {
      done = true
    })
    await Promise.resolve()
    expect(watch?.signal.aborted).toBe(true)
    expect(done).toBe(false)
    watch?.leave()
    await drained
    expect(done).toBe(true)
  })

  it('takes down once when the take-down is called twice', async () => {
    const registry = createStandaloneRegistry()
    const changes: string[] = []
    registry.subscribe(change => changes.push(`${change.revision} ${change.change}`))
    const takeDown = registry.mount(notesContribution('first'))
    const first = takeDown()
    registry.mount(notesContribution('again'))
    expect(takeDown()).toBe(first)
    await first
    expect('refused' in registry.enter(NOTES, 'read-note')).toBe(false)
    expect(changes).toEqual(['1 mounted', '2 unmounted', '3 mounted'])
  })

  it('completes at once when nothing is in flight, and a second leave has no effect', async () => {
    const registry = createStandaloneRegistry()
    const takeDown = registry.mount(notesContribution('first'))
    const read = mustEnter(registry, NOTES, 'read-note')
    read?.leave()
    read?.leave()
    await expect(takeDown()).resolves.toBeUndefined()
  })
})

describe('subscribe', () => {
  type View = { revision: number; protocols: Set<string> }
  function follow(registry: ReturnType<typeof createStandaloneRegistry>): {
    view: View
    unsubscribe: () => void
  } {
    const view: View = { revision: 0, protocols: new Set() }
    const subscription = registry.subscribe(change => {
      view.revision = change.revision
      if (change.change === 'points' || change.change === 'scoped') return
      const text = `${change.protocol.name}/v${change.protocol.major}`
      if (change.change === 'mounted') view.protocols.add(text)
      else view.protocols.delete(text)
    })
    view.revision = subscription.revision
    for (const protocol of subscription.protocols)
      view.protocols.add(`${protocol.name}/v${protocol.major}`)
    return { view, unsubscribe: subscription.unsubscribe }
  }

  it('订阅的同时挂上一个协议，订阅者最终的集合里有它', () => {
    const registry = createStandaloneRegistry()
    const { view } = follow(registry)
    registry.mount(notesContribution('first'))
    expect(view).toEqual({ revision: 1, protocols: new Set(['notes/v1']) })
  })

  it('returns the snapshot, then reports each mount and take-down in the same synchronous step', () => {
    const registry = createStandaloneRegistry()
    const takeDown = registry.mount(notesContribution('v1'))
    registry.mount(notesContribution('v2', 2))
    const { view, unsubscribe } = follow(registry)
    expect(view).toEqual({ revision: 2, protocols: new Set(['notes/v1', 'notes/v2']) })
    void takeDown()
    expect(view).toEqual({ revision: 3, protocols: new Set(['notes/v2']) })
    unsubscribe()
    unsubscribe()
    registry.mount(notesContribution('v1 again'))
    expect(view.revision).toBe(3)
  })

  it('keeps the registry and the other subscribers when a subscriber throws', () => {
    const diagnostics: unknown[] = []
    const registry = createStandaloneRegistry({ onListenerError: error => diagnostics.push(error) })
    registry.subscribe(() => {
      throw new Error('listener failed')
    })
    const { view } = follow(registry)
    registry.mount(notesContribution('first'))
    expect(view.protocols).toEqual(new Set(['notes/v1']))
    expect('refused' in registry.enter(NOTES, 'read-note')).toBe(false)
    expect(diagnostics).toEqual([new Error('listener failed')])
  })
})
