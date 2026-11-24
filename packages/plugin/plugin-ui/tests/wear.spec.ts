import { describe, expect, it } from 'vitest'
import { wearStep, type LookChoice, type Skins } from '@omne-harness/plugin-ui'

const NONE: LookChoice = { kind: 'none' }
const BUILTIN: LookChoice = { kind: 'builtin' }
const named = (name: string): LookChoice => ({ kind: 'named', name })
const skins = (wanted: readonly string[], loaded: readonly string[] = []): Skins => ({
  wanted: new Set(wanted),
  loaded: new Set(loaded),
})

describe('the skin worn, from the choice remembered and the skins as they are', () => {
  it.each([
    ['there is no skin', skins([])],
    ['one skin is up', skins(['sea'], ['sea'])],
    ['two skins are up', skins(['sea', 'ink'], ['sea', 'ink'])],
    ['a skin is still loading', skins(['sea'])],
  ])('with the built-in look chosen, none is worn and the choice stands: %s', (_name, now) => {
    expect(wearStep(BUILTIN, now)).toEqual({ worn: undefined, choice: BUILTIN })
  })

  it('with a skin chosen that is up, that skin is worn', () => {
    expect(wearStep(named('ink'), skins(['sea', 'ink'], ['sea', 'ink']))).toEqual({
      worn: 'ink',
      choice: named('ink'),
    })
    expect(wearStep(named('sea'), skins(['sea'], ['sea']))).toEqual({
      worn: 'sea',
      choice: named('sea'),
    })
  })

  it.each([
    ['no other skin', skins(['ink'])],
    ['another skin that is up', skins(['sea', 'ink'], ['sea'])],
  ])(
    'with a skin chosen that is to load and is not up, none is worn and the choice stands, with %s: it does not fall to another',
    (_name, now) => {
      expect(wearStep(named('ink'), now)).toEqual({ worn: undefined, choice: named('ink') })
    },
  )

  it.each<[string, Skins, ReturnType<typeof wearStep>]>([
    ['there is no skin', skins([]), { worn: undefined, choice: NONE }],
    ['one skin that is up', skins(['sea'], ['sea']), { worn: 'sea', choice: named('sea') }],
    ['one skin that is not up', skins(['sea']), { worn: undefined, choice: NONE }],
    ['two skins', skins(['sea', 'kelp'], ['sea', 'kelp']), { worn: undefined, choice: NONE }],
  ])(
    'with a skin chosen that is no longer to load, it is as with nothing chosen: %s',
    (_name, now, wearing) => {
      expect(wearStep(named('ink'), now)).toEqual(wearing)
      expect(wearStep(NONE, now)).toEqual(wearing)
    },
  )

  it('with nothing chosen and two skins or more, none is worn: a person is to choose', () => {
    expect(wearStep(NONE, skins(['sea', 'ink'], ['sea']))).toEqual({
      worn: undefined,
      choice: NONE,
    })
    expect(wearStep(NONE, skins(['sea', 'ink', 'kelp'], ['sea', 'ink', 'kelp']))).toEqual({
      worn: undefined,
      choice: NONE,
    })
  })
})

describe('the skin worn, over a run of steps', () => {
  const run = (choice: LookChoice, steps: readonly Skins[]) =>
    steps.reduce<ReturnType<typeof wearStep>[]>((done, now) => {
      const from = done.at(-1)?.choice ?? choice
      return [...done, wearStep(from, now)]
    }, [])
  const worn = (choice: LookChoice, steps: readonly Skins[]) =>
    run(choice, steps).map(each => each.worn)

  it('two skins that come up one after the other: the first to come up does not take the choice', () => {
    expect(
      worn(named('ink'), [
        skins(['sea', 'ink']),
        skins(['sea', 'ink'], ['sea']),
        skins(['sea', 'ink'], ['sea', 'ink']),
      ]),
    ).toEqual([undefined, undefined, 'ink'])
  })

  it('a second skin appears while the only one is worn: the one worn stays', () => {
    expect(
      worn(NONE, [
        skins(['sea'], ['sea']),
        skins(['sea', 'ink'], ['sea']),
        skins(['sea', 'ink'], ['sea', 'ink']),
      ]),
    ).toEqual(['sea', 'sea', 'sea'])
  })

  it('the skin worn is disabled: with one other it moves to that one and remembers it, with two others a person is to choose', () => {
    const one = run(named('sea'), [skins(['sea', 'ink'], ['sea', 'ink']), skins(['ink'], ['ink'])])
    expect(one).toEqual([
      { worn: 'sea', choice: named('sea') },
      { worn: 'ink', choice: named('ink') },
    ])
    const two = run(named('sea'), [
      skins(['sea', 'ink', 'kelp'], ['sea', 'ink', 'kelp']),
      skins(['ink', 'kelp'], ['ink', 'kelp']),
    ])
    expect(two.at(-1)).toEqual({ worn: undefined, choice: NONE })
  })

  it('the skin worn loads again in a new version and the old stays up meanwhile: it is worn throughout', () => {
    expect(worn(named('sea'), [skins(['sea'], ['sea']), skins(['sea'], ['sea'])])).toEqual([
      'sea',
      'sea',
    ])
  })

  it('a skin chosen fails to load: none is worn and the choice waits for it', () => {
    expect(
      run(named('ink'), [skins(['sea', 'ink'], ['sea']), skins(['sea', 'ink'], ['sea'])]),
    ).toEqual([
      { worn: undefined, choice: named('ink') },
      { worn: undefined, choice: named('ink') },
    ])
  })
})
