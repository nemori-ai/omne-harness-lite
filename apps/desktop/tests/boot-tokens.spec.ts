import { describe, expect, it } from 'vitest'
import { TOKENS_KEY, keepBootTokens } from '../src/page/shell/boot-tokens.ts'

type Tokens = Readonly<Record<string, string>>

function cell<T>(initial: T) {
  let value = initial
  const listeners = new Set<(value: T) => void>()
  return {
    get: () => value,
    set(next: T) {
      value = next
      for (const listener of listeners) listener(next)
    },
    subscribe(listener: (value: T) => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}

function world(login: 'signed-in' | 'signed-out' = 'signed-in') {
  const kept = new Map<string, string>([[TOKENS_KEY, '{"--omne-accent":"teal"}']])
  const store = {
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  }
  const removed: string[] = []
  const root = {
    dataset: { bootTokens: '--omne-accent' } as Record<string, string | undefined>,
    style: { removeProperty: (name: string) => void removed.push(name) },
  }
  const app = cell<Tokens>({})
  const state = cell<'signed-in' | 'signed-out' | 'signing-in' | 'signing-out'>(login)
  const outcomes = new Set<() => void>()
  const stop = keepBootTokens({
    store: () => store,
    root,
    app,
    login: { state: state.get, subscribe: state.subscribe },
    outcomes(listener) {
      outcomes.add(listener)
      return () => void outcomes.delete(listener)
    },
  })
  const settled = (): void => {
    for (const listener of outcomes) listener()
  }
  const saved = (): string | undefined => kept.get(TOKENS_KEY)
  return { root, removed, app, state, settled, saved, stop, outcomes }
}

describe('what the first frame of the next start reads', () => {
  it('is left as it was, and what the first frame wrote stays on the root, until everything to load has an outcome', () => {
    const t = world()
    t.app.set({})
    t.app.set({ '--omne-accent': 'red' })
    expect(t.saved()).toBe('{"--omne-accent":"teal"}')
    expect(t.removed).toEqual([])
    expect(t.root.dataset['bootTokens']).toBe('--omne-accent')
  })

  it('becomes what counts on the whole application once everything has an outcome, and the root is given back to the sheet', () => {
    const t = world()
    t.app.set({ '--omne-accent': 'red' })
    t.settled()
    expect(t.saved()).toBe('{"--omne-accent":"red"}')
    expect(t.removed).toEqual(['--omne-accent'])
    expect(t.root.dataset['bootTokens']).toBeUndefined()
  })

  it('follows every change after that: a theme that is taken away is forgotten', () => {
    const t = world()
    t.settled()
    expect(t.saved()).toBeUndefined()
    t.app.set({ '--omne-accent': 'blue' })
    expect(t.saved()).toBe('{"--omne-accent":"blue"}')
    t.app.set({})
    expect(t.saved()).toBeUndefined()
  })

  it('is forgotten, and the root given back, when nobody is signed in at the start', () => {
    const t = world('signed-out')
    expect(t.saved()).toBeUndefined()
    expect(t.removed).toEqual(['--omne-accent'])
  })

  it('is forgotten when the one signed in signs out, and waits again for the next one to have outcomes', () => {
    const t = world()
    t.app.set({ '--omne-accent': 'red' })
    t.settled()
    t.state.set('signing-out')
    expect(t.saved()).toBe('{"--omne-accent":"red"}')
    t.state.set('signed-out')
    expect(t.saved()).toBeUndefined()
    t.state.set('signed-in')
    t.app.set({ '--omne-accent': 'green' })
    expect(t.saved()).toBeUndefined()
    t.settled()
    expect(t.saved()).toBe('{"--omne-accent":"green"}')
  })

  it('is no longer followed once it is stopped', () => {
    const t = world()
    t.settled()
    t.stop()
    t.app.set({ '--omne-accent': 'blue' })
    expect(t.saved()).toBeUndefined()
    expect(t.outcomes.size).toBe(0)
  })
})
