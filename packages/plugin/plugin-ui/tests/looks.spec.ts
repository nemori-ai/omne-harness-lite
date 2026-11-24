import { describe, expect, it } from 'vitest'
import type { Kept } from '@omne-harness/plugin-protocol'
import { choiceIn, createWear, type LookChoice, type LookStore } from '@omne-harness/plugin-ui'
import { memoryLookStore } from '../src/looks.ts'

const ALICE = 'alice'
const BOB = 'bob'
const NONE: LookChoice = { kind: 'none' }
const named = (name: string): LookChoice => ({ kind: 'named', name })
const loaded: Kept = { kind: 'loaded', version: 'v1' }
const loading: Kept = { kind: 'loading', version: 'v1', next: 'keep' }
const reloading: Kept = { kind: 'loading', version: 'v2', next: 'keep', over: 'v1' }
const failed: Kept = { kind: 'failed', version: 'v1', reason: 'its module threw' }
const held: Kept = { kind: 'held', version: 'v1' }
const states = (given: Readonly<Record<string, Kept>>): ReadonlyMap<string, Kept> =>
  new Map(Object.entries(given))

const settle = (w: ReturnType<typeof world>, given: Readonly<Record<string, Kept>>): void =>
  w.wear.settle(new Set(Object.keys(given)), states(given))

function world(kept: Readonly<Record<string, LookChoice>> = {}) {
  const worn: (string | undefined)[] = []
  const written: [string, LookChoice][] = []
  const texts = new Map(
    Object.entries(kept).map(([tenant, choice]) => [tenant, JSON.stringify(choice)]),
  )
  const store: LookStore = {
    read: tenant => texts.get(tenant) ?? null,
    write(tenant, text) {
      written.push([tenant, choiceIn(text)])
      texts.set(tenant, text)
    },
  }
  const wear = createWear({ wear: look => worn.push(look), store })
  return { wear, worn, written, texts, last: () => worn.at(-1) }
}

describe('the choice a kept text says', () => {
  it.each<[string, LookChoice]>([
    ['{"kind":"named","name":"sea"}', named('sea')],
    ['{"kind":"builtin"}', { kind: 'builtin' }],
    ['{"kind":"none"}', NONE],
  ])('reads %s', (text, choice) => {
    expect(choiceIn(text)).toEqual(choice)
  })

  it.each([
    ['nothing kept', null],
    ['not JSON', 'nope'],
    ['a kind it does not know', '{"kind":"theme"}'],
    ['a kind it does not know that carries a name', '{"kind":"theme","name":"sea"}'],
    ['named without a name', '{"kind":"named"}'],
    ['a name that is not text', '{"kind":"named","name":7}'],
    ['an empty name', '{"kind":"named","name":""}'],
    ['a list', '[]'],
    ['null', 'null'],
  ])('reads %s as no choice, and does not throw', (_name, text) => {
    expect(choiceIn(text)).toEqual(NONE)
  })

  it('reads the built-in look without what else the text carries', () => {
    expect(choiceIn('{"kind":"builtin","name":"sea"}')).toStrictEqual({ kind: 'builtin' })
  })
})

describe('the choice as it is kept', () => {
  it('a store that lasts as long as the run gives back what was written, by tenant, and nothing before', () => {
    const store = memoryLookStore()
    expect(store.read(ALICE)).toBeNull()
    store.write(ALICE, 'one')
    store.write(BOB, 'two')
    expect([store.read(ALICE), store.read(BOB)]).toEqual(['one', 'two'])
  })

  it('a skin remembered that is no longer to load, with no only other: nothing is worn and the choice kept becomes none', () => {
    const w = world({ [ALICE]: named('sea') })
    w.wear.open(ALICE)
    settle(w, { ink: loaded, moss: loaded })
    expect(w.last()).toBeUndefined()
    expect(w.written).toEqual([[ALICE, NONE]])
    expect(w.wear.view()?.choice).toEqual(NONE)
  })

  it('a choice made before what is to load was read is kept and waits: nothing is worn, nothing throws', () => {
    const w = world()
    w.wear.open(ALICE)
    w.wear.choose(named('sea'))
    expect(w.last()).toBeUndefined()
    expect(w.written).toEqual([[ALICE, named('sea')]])
    expect(w.wear.view()).toEqual({
      listed: false,
      skins: [],
      worn: undefined,
      choice: named('sea'),
    })
    settle(w, { sea: loaded })
    expect(w.last()).toBe('sea')
  })

  it('is written as a text the same reading gives back, under the tenant', () => {
    const w = world()
    w.wear.open(ALICE)
    settle(w, { sea: loaded, ink: loaded })
    w.wear.choose(named('ink'))
    expect(choiceIn(w.texts.get(ALICE) ?? null)).toEqual(named('ink'))
    expect(w.texts.has(BOB)).toBe(false)
  })

  it('a text that cannot be read is no choice: the only skin is worn', () => {
    const w = world()
    w.texts.set(ALICE, 'nope')
    w.wear.open(ALICE)
    settle(w, { sea: loaded })
    expect(w.last()).toBe('sea')
  })
})

describe('the look of the tenant on show', () => {
  it('is nothing while no tenant is on show: there is no view, and a choice goes nowhere', () => {
    const w = world()
    expect(w.wear.view()).toBeUndefined()
    w.wear.choose(named('sea'))
    settle(w, { sea: loaded })
    expect(w.written).toEqual([])
    expect(w.worn).toEqual([])
  })

  it('until what is to load was read, wears nothing and keeps the choice remembered: not read is not none', () => {
    const w = world({ [ALICE]: named('ink') })
    w.wear.open(ALICE)
    expect(w.wear.view()).toEqual({
      listed: false,
      skins: [],
      worn: undefined,
      choice: named('ink'),
    })
    expect(w.last()).toBeUndefined()
    expect(w.written).toEqual([])
  })

  it('wears the skin remembered once it is up, and says each skin with its state and why it failed', () => {
    const w = world({ [ALICE]: named('ink') })
    w.wear.open(ALICE)
    settle(w, { sea: loaded, ink: loading, kelp: failed })
    expect(w.last()).toBeUndefined()
    settle(w, { sea: loaded, ink: loaded, kelp: failed })
    expect(w.last()).toBe('ink')
    expect(w.wear.view()).toStrictEqual({
      listed: true,
      skins: [
        { name: 'ink', state: 'loaded' },
        { name: 'kelp', state: 'failed', reason: 'its module threw' },
        { name: 'sea', state: 'loaded' },
      ],
      worn: 'ink',
      choice: named('ink'),
    })
    expect(w.written).toEqual([])
  })

  it.each([
    ['is loading for the first time', loading],
    ['failed to load', failed],
    ['is held back by the floor', held],
  ])('a skin that %s is not up: chosen, it is not worn', (_name, state) => {
    const w = world({ [ALICE]: named('ink') })
    w.wear.open(ALICE)
    settle(w, { sea: loaded, ink: state })
    expect(w.last()).toBeUndefined()
    expect(w.wear.view()).toMatchObject({ worn: undefined, choice: named('ink') })
  })

  it('a skin the list names and the loader holds nothing for yet is still to come up: the choice of it waits', () => {
    const w = world({ [ALICE]: named('sea') })
    w.wear.open(ALICE)
    w.wear.settle(new Set(['sea', 'ink']), states({ ink: loading }))
    expect(w.wear.view()).toMatchObject({
      skins: [
        { name: 'ink', state: 'loading' },
        { name: 'sea', state: 'loading' },
      ],
      worn: undefined,
      choice: named('sea'),
    })
    expect(w.written).toEqual([])
    settle(w, { sea: loaded, ink: loaded })
    expect(w.last()).toBe('sea')
  })

  it('what the loader still holds and the list no longer names is not a skin to wear', () => {
    const w = world({ [ALICE]: named('sea') })
    w.wear.open(ALICE)
    settle(w, { sea: loaded, ink: loaded })
    w.wear.settle(new Set(['ink']), states({ sea: loaded, ink: loaded }))
    expect(w.last()).toBe('ink')
    expect(w.wear.view()?.skins).toEqual([{ name: 'ink', state: 'loaded' }])
  })

  it('with nothing remembered and one skin up, wears it and remembers it; a second skin does not take it off', () => {
    const w = world()
    w.wear.open(ALICE)
    settle(w, { sea: loaded })
    expect(w.last()).toBe('sea')
    expect(w.written).toEqual([[ALICE, named('sea')]])
    settle(w, { sea: loaded, ink: loaded })
    expect(w.last()).toBe('sea')
    expect(w.written).toHaveLength(1)
  })

  it('a person chooses: the choice is remembered and worn at once; the built-in look takes every skin off', () => {
    const w = world()
    w.wear.open(ALICE)
    settle(w, { sea: loaded, ink: loaded })
    expect(w.last()).toBeUndefined()
    w.wear.choose(named('ink'))
    expect(w.last()).toBe('ink')
    w.wear.choose({ kind: 'builtin' })
    expect(w.last()).toBeUndefined()
    expect(w.written).toEqual([
      [ALICE, named('ink')],
      [ALICE, { kind: 'builtin' }],
    ])
    expect(w.wear.view()?.choice).toEqual({ kind: 'builtin' })
  })

  it('the skin worn is no longer to load: it moves to the only other and remembers that', () => {
    const w = world({ [ALICE]: named('sea') })
    w.wear.open(ALICE)
    settle(w, { sea: loaded, ink: loaded })
    settle(w, { ink: loaded })
    expect(w.last()).toBe('ink')
    expect(w.written).toEqual([[ALICE, named('ink')]])
  })

  it('a skin loading again over its live generation stays worn', () => {
    const w = world({ [ALICE]: named('sea') })
    w.wear.open(ALICE)
    settle(w, { sea: loaded })
    settle(w, { sea: reloading })
    expect(w.last()).toBe('sea')
  })

  it('closed, wears nothing; the next tenant reads a choice of its own', () => {
    const w = world({ [ALICE]: named('sea'), [BOB]: { kind: 'builtin' } })
    w.wear.open(ALICE)
    settle(w, { sea: loaded })
    expect(w.last()).toBe('sea')
    w.wear.close()
    expect(w.last()).toBeUndefined()
    expect(w.wear.view()).toBeUndefined()
    w.wear.open(BOB)
    settle(w, { sea: loaded })
    expect(w.last()).toBeUndefined()
    expect(w.written).toEqual([])
  })

  it('tells who watches on each change, gives the same view between changes, and stops telling when asked', () => {
    const w = world()
    let told = 0
    const stop = w.wear.watch(() => told++)
    w.wear.open(ALICE)
    settle(w, { sea: loaded })
    expect(told).toBe(2)
    expect(w.wear.view()).toBe(w.wear.view())
    stop()
    w.wear.close()
    expect(told).toBe(2)
  })
})
