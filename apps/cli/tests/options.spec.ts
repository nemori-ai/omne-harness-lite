import { describe, expect, it } from 'vitest'
import { readOptions } from '../src/options.ts'

const RULES = {
  accepted: ['--session', '--text', '--attach'],
  required: ['--session'],
  switches: ['--json'],
  repeatable: ['--attach'],
}
const read = (args: readonly string[], rules: Parameters<typeof readOptions>[1] = RULES) => {
  const result = readOptions(args, rules)
  return result.kind === 'options'
    ? { values: [...result.values], lists: [...result.lists] }
    : result
}

describe('readOptions', () => {
  it('reads each option with the word after it, a switch without one, and a repeatable one into a list in order', () => {
    expect(
      read(['--attach', 'a', '--json', '--session', 's', '--attach', 'b', '--text', '-5']),
    ).toEqual({
      values: [
        ['--json', ''],
        ['--session', 's'],
        ['--text', '-5'],
      ],
      lists: [['--attach', ['a', 'b']]],
    })
  })

  it.each([
    ['an option twice', ['--session', 's', '--text', 'a', '--text', 'b']],
    ['a switch twice', ['--session', 's', '--json', '--json']],
    ['an option of another command', ['--session', 's', '--model', 'm']],
    ['an option without a value', ['--session', 's', '--text']],
    ['a value that is itself an option of the command', ['--session', '--text', 'a']],
    ['a value that is itself a switch of the command', ['--session', '--json']],
    ['a positional word', ['--session', 's', 'extra']],
  ])('refuses %s', (_, args) => {
    expect(read(args)).toEqual({ kind: 'unrecognized' })
  })

  it('names the first required option that is missing; a repeatable option is not in the values', () => {
    expect(read(['--attach', 'a'])).toEqual({ kind: 'missing', option: '--session' })
    expect(read(['--session', 's', '--attach', 'a'])).toEqual({
      values: [['--session', 's']],
      lists: [['--attach', ['a']]],
    })
  })

  it('without switches or repeatable options every option takes a value and none repeats', () => {
    const plain = { accepted: ['--session', '--json'], required: [] }
    expect(read(['--json', 'x', '--session', 's'], plain)).toEqual({
      values: [
        ['--json', 'x'],
        ['--session', 's'],
      ],
      lists: [],
    })
    expect(read(['--session', 'a', '--session', 'b'], plain)).toEqual({ kind: 'unrecognized' })
  })
})
