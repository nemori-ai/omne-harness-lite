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

  it('reads from the cache only an object of names to keys or to no key', () => {
    for (const text of ['[1]', '"Mod+J"', 'null', 'not json', '7'])
      expect(new KeyBindings(undefined, cache(text), 'keys.mac').changes()).toEqual({})
    const mixed = cache('{"a":1,"b":"Mod+X","c":null,"d":[]}')
    expect(new KeyBindings(undefined, mixed, 'keys.mac').changes()).toEqual({ b: 'Mod+X', c: null })
  })

  it('asks for the port at each use, and keeps a change on this machine while there is no account', async () => {
    const store = account()
    let port: PreferencePort | undefined
    const local = cache()
    const bindings = new KeyBindings(() => port, local, 'keys.mac')
    await bindings.load()
    expect(bindings.state()).toEqual({ kind: 'saved' })
    expect(await bindings.change({ 'session.stop': 'Mod+J' })).toEqual({
      kind: 'unsaved',
      why: '读不到账号，改动只存在这台机器上',
    })
    expect(local.text()).toBe('{"session.stop":"Mod+J"}')
    port = store.port
    expect(await bindings.change({ 'session.stop': 'Mod+K' })).toEqual({ kind: 'saved' })
    expect(store.value()).toBe('{"session.stop":"Mod+K"}')
  })

  it('a change before the first read names the revision the account holds; a read that fails is told', async () => {
    const store = account()
    await new KeyBindings(store.port, cache(), 'keys.mac').change({ 'session.stop': 'Mod+J' })
    const local = cache()
    const late = new KeyBindings(store.port, local, 'keys.mac')
    expect(await late.change({ 'session.stop': 'Mod+K' })).toEqual({ kind: 'saved' })
    expect(store.value()).toBe('{"session.stop":"Mod+K"}')
    expect(local.text()).toBe('{"session.stop":"Mod+K"}')
    store.fail(true)
    const blind = new KeyBindings(store.port, cache('{"session.stop":"Mod+L"}'), 'keys.mac')
    await blind.load()
    expect(blind.state()).toEqual({ kind: 'unsaved', why: '读不到' })
    expect(blind.changes()).toEqual({ 'session.stop': 'Mod+L' })
    expect(await blind.change({ 'session.stop': 'Mod+M' })).toEqual({
      kind: 'unsaved',
      why: '读不到',
    })
  })

  it('a refused change never passes through saved, and a listener taken off hears nothing', async () => {
    const store = account()
    const one = new KeyBindings(store.port, cache(), 'keys.mac')
    const two = new KeyBindings(store.port, cache(), 'keys.mac')
    await Promise.all([one.load(), two.load()])
    await one.change({ 'session.stop': 'Mod+J' })
    const states: string[] = []
    const off = two.subscribe(() => states.push(two.state().kind))
    await two.change({ 'session.stop': 'Mod+K' })
    expect(states).toEqual(['saving', 'saving', 'unsaved'])
    off()
    await two.change({ 'session.stop': 'Mod+K' })
    expect(states).toHaveLength(3)
  })
})
