import { describe, expect, it } from 'vitest'
import { createToastStore, type Toast } from '@omne-harness/shell-contract'

function fakeClock() {
  let now = 0
  const due = new Set<{ at: number; run: () => void }>()
  return {
    schedule(run: () => void, delayMs: number) {
      const timer = { at: now + delayMs, run }
      due.add(timer)
      return () => {
        due.delete(timer)
      }
    },
    advance(ms: number) {
      now += ms
      for (const timer of [...due].sort((a, b) => a.at - b.at))
        if (timer.at <= now && due.delete(timer)) timer.run()
    },
    pending: () => due.size,
  }
}

const toast = (id: string, title = id): Toast => ({ id, tone: 'info', title })

function setup(visible = 2, durationMs = 1000) {
  const clock = fakeClock()
  const store = createToastStore({ visible, durationMs, schedule: clock.schedule })
  const titles = () => store.shown().map(shown => shown.toast.title)
  return { clock, store, titles }
}

describe('createToastStore', () => {
  it('shows a toast and takes it down when its time is up', () => {
    const { clock, store, titles } = setup()
    const owner = {}
    store.show(owner, toast('a'))
    expect(titles()).toEqual(['a'])
    clock.advance(999)
    expect(titles()).toEqual(['a'])
    clock.advance(1)
    expect(titles()).toEqual([])
    expect(clock.pending()).toBe(0)
  })

  it('replaces a toast with the same id from the same owner in its place and restarts its time', () => {
    const { clock, store, titles } = setup()
    const owner = {}
    store.show(owner, toast('a', 'first'))
    store.show(owner, toast('b'))
    clock.advance(600)
    store.show(owner, toast('a', 'second'))
    expect(titles()).toEqual(['second', 'b'])
    clock.advance(400)
    expect(titles()).toEqual(['second'])
    clock.advance(600)
    expect(titles()).toEqual([])
  })

  it('keeps the same id from two owners apart', () => {
    const { store, titles } = setup()
    store.show({}, toast('a', 'one'))
    store.show({}, toast('a', 'two'))
    expect(titles()).toEqual(['one', 'two'])
    expect(new Set(store.shown().map(shown => shown.key)).size).toBe(2)
  })

  it('queues past the visible count and shows the next when one goes', () => {
    const { clock, store, titles } = setup(2)
    const owner = {}
    store.show(owner, toast('a'))
    store.show(owner, toast('b'))
    store.show(owner, toast('c'))
    expect(titles()).toEqual(['a', 'b'])
    clock.advance(1000)
    expect(titles()).toEqual(['c'])
    clock.advance(999)
    expect(titles()).toEqual(['c'])
    clock.advance(1)
    expect(titles()).toEqual([])
  })

  it('replaces a queued toast where it waits, without showing it early', () => {
    const { store, titles } = setup(1)
    const owner = {}
    store.show(owner, toast('a'))
    store.show(owner, toast('b', 'old'))
    store.show(owner, toast('c'))
    store.show(owner, toast('b', 'new'))
    expect(titles()).toEqual(['a'])
    store.dismiss(store.shown()[0]!.key)
    expect(titles()).toEqual(['new'])
  })

  it('takes down one the person dismissed and moves the queue on', () => {
    const { clock, store, titles } = setup(1)
    const owner = {}
    store.show(owner, toast('a'))
    store.show(owner, toast('b'))
    store.dismiss(store.shown()[0]!.key)
    expect(titles()).toEqual(['b'])
    store.dismiss('no such key')
    expect(titles()).toEqual(['b'])
    expect(clock.pending()).toBe(1)
  })

  it('withdraws what one owner showed and queued, and leaves the others', () => {
    const { clock, store, titles } = setup(2)
    const mine = {}
    const theirs = {}
    store.show(mine, toast('a', 'mine shown'))
    store.show(theirs, toast('b', 'theirs shown'))
    store.show(mine, toast('c', 'mine queued'))
    store.show(theirs, toast('d', 'theirs queued'))
    store.withdraw(mine)
    expect(titles()).toEqual(['theirs shown', 'theirs queued'])
    expect(clock.pending()).toBe(2)
    store.withdraw({})
    expect(titles()).toEqual(['theirs shown', 'theirs queued'])
  })

  it('tells its listeners of each change and keeps the same list while nothing changed', () => {
    const { clock, store } = setup()
    let told = 0
    const stop = store.subscribe(() => (told += 1))
    const empty = store.shown()
    expect(store.shown()).toBe(empty)
    store.show({}, toast('a'))
    const one = store.shown()
    expect(store.shown()).toBe(one)
    clock.advance(1000)
    expect(told).toBe(2)
    stop()
    store.show({}, toast('b'))
    expect(told).toBe(2)
  })

  it('refuses a visible count or a duration that is not a positive whole number', () => {
    const schedule = () => () => undefined
    expect(() => createToastStore({ visible: 0, durationMs: 1, schedule })).toThrow(RangeError)
    expect(() => createToastStore({ visible: 1, durationMs: 0, schedule })).toThrow(RangeError)
    expect(() => createToastStore({ visible: 1.5, durationMs: 1, schedule })).toThrow(RangeError)
  })
})
