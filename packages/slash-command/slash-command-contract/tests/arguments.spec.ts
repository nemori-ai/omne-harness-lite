import { splitArguments } from '@omne-harness/slash-command-contract'
import { describe, expect, it } from 'vitest'

const values = (args: string) => splitArguments(args).map(part => part.value)

describe('the arguments after a command', () => {
  it.each([
    ['', []],
    ['   ', []],
    ['a', ['a']],
    ['a b', ['a', 'b']],
    ['  a\tb  ', ['a', 'b']],
    ['a "b c"', ['a', 'b c']],
    ['"a b" c', ['a b', 'c']],
    ['""', ['']],
    ['"a', ['a']],
    ['a"', ['a']],
    ['"', ['']],
    ['a"b c"d', ['a"b', 'c"d']],
    ['修复 "登录 超时"', ['修复', '登录 超时']],
  ] as const)('%j splits into %j', (args, expected) => {
    expect(values(args)).toEqual(expected)
  })

  it('says where each argument starts and ends in the text, quotes included', () => {
    expect(splitArguments(' a "b c"  d')).toEqual([
      { from: 1, to: 2, value: 'a' },
      { from: 3, to: 8, value: 'b c' },
      { from: 10, to: 11, value: 'd' },
    ])
  })
})
