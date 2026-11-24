import { describe, expect, it } from 'vitest'
import {
  CHANGED_ELSEWHERE,
  KeyBindings,
  type BindingCache,
  type PreferencePort,
} from '../src/model/bindings.ts'

/** One account's store, as the identity domain keeps it: a value and a revision a write must name. */
function account() {
  let value: string | null = null
  let revision = 0
  let down = false
  const port: PreferencePort = {
    read: async () =>
      down
        ? { kind: 'failed', why: '读不到' }
        : { kind: 'read', value, revision: String(revision) },
    write: async (_name, next, expected) => {
      if (down) return { kind: 'failed', why: '写不进' }
      if (expected !== String(revision)) return { kind: 'conflict', revision: String(revision) }
      value = next
      revision += 1
      return { kind: 'written', revision: String(revision) }
    },
  }
  return { port, value: () => value, fail: (on: boolean) => void (down = on) }
}

function cache(start: string | null = null): BindingCache & { text: () => string | null } {
  let text = start
  return { read: () => text, write: next => void (text = next), text: () => text }
}

describe('the key bindings of an account (C16)', () => {
  it('shows the cache first, then what the account holds', async () => {
    const store = account()
    await new KeyBindings(store.port, cache(), 'keys.mac').change({ 'session.stop': 'Mod+Shift+S' })
    const local = cache('{"session.stop":"Mod+J"}')
    const other = new KeyBindings(store.port, local, 'keys.mac')
    expect(other.changes()).toEqual({ 'session.stop': 'Mod+J' })
    await other.load()
    expect(other.changes()).toEqual({ 'session.stop': 'Mod+Shift+S' })
    expect(local.text()).toBe('{"session.stop":"Mod+Shift+S"}')
  })

  it('a change made on one client is read on another', async () => {
    const store = account()
    const one = new KeyBindings(store.port, cache(), 'keys.mac')
    expect(await one.change({ 'session.stop': 'Mod+Shift+S' })).toEqual({ kind: 'saved' })
    expect(one.changes()).toEqual({ 'session.stop': 'Mod+Shift+S' })
    const two = new KeyBindings(store.port, cache(), 'keys.mac')
    await two.load()
    expect(two.changes()).toEqual({ 'session.stop': 'Mod+Shift+S' })
  })

  it('of two changes from one revision the later is refused, and that client takes what was saved', async () => {
    const store = account()
    const one = new KeyBindings(store.port, cache(), 'keys.mac')
    const two = new KeyBindings(store.port, cache(), 'keys.mac')
    await Promise.all([one.load(), two.load()])
    expect(await one.change({ 'session.stop': 'Mod+Shift+S' })).toEqual({ kind: 'saved' })
    expect(await two.change({ 'session.stop': 'Mod+J' })).toEqual({
      kind: 'unsaved',
      why: CHANGED_ELSEWHERE,
    })
    expect(store.value()).toBe('{"session.stop":"Mod+Shift+S"}')
    expect(two.changes()).toEqual({ 'session.stop': 'Mod+Shift+S' })
  })

  it('never says saved before the account confirmed it', async () => {
    const store = account()
    const one = new KeyBindings(store.port, cache(), 'keys.mac')
    await one.load()
    const states: string[] = []
    one.subscribe(() => states.push(one.state().kind))
    store.fail(true)
    expect(await one.change({ 'session.stop': 'Mod+J' })).toEqual({
      kind: 'unsaved',
      why: '写不进',
    })
    expect(states).toEqual(['saving', 'unsaved'])
    const alone = new KeyBindings(undefined, cache(), 'keys.mac')
    expect((await alone.change({ 'session.stop': 'Mod+J' })).kind).toBe('unsaved')
  })
})
