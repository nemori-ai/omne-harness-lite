import { argumentAt, splitArguments } from '@omne-harness/slash-command-contract'
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

describe('which argument of the command at the head the caret is on', () => {
  it.each([
    ['/commit', 7, null],
    ['/commit', 3, null],
    ['/commit x', 3, null],
    ['看 /commit x', 11, null],
    ['', 0, null],
    ['/commit ', 8, { command: 'commit', index: 0, from: 8, to: 8, query: '' }],
    ['/commit fix', 11, { command: 'commit', index: 0, from: 8, to: 11, query: 'fix' }],
    ['/commit fix', 9, { command: 'commit', index: 0, from: 8, to: 11, query: 'f' }],
    ['/commit fix ', 12, { command: 'commit', index: 1, from: 12, to: 12, query: '' }],
    ['/commit fix the', 15, { command: 'commit', index: 1, from: 12, to: 15, query: 'the' }],
    ['/commit a  b', 10, { command: 'commit', index: 1, from: 10, to: 10, query: '' }],
    ['/commit "fix the', 16, { command: 'commit', index: 0, from: 8, to: 16, query: 'fix the' }],
    ['/commit "fix the" ', 18, { command: 'commit', index: 1, from: 18, to: 18, query: '' }],
    ['/commit "a b" c', 15, { command: 'commit', index: 1, from: 14, to: 15, query: 'c' }],
    [
      '  /prompt:commit x',
      18,
      { command: 'prompt:commit', index: 0, from: 17, to: 18, query: 'x' },
    ],
    ['/Commit\tx', 9, { command: 'commit', index: 0, from: 8, to: 9, query: 'x' }],
  ] as const)('%j with the caret at %j: %j', (text, caret, place) => {
    expect(argumentAt(text, caret)).toEqual(place)
  })

  it('counts arguments as the prompt expands them: the split is the same', () => {
    const text = '/commit 修复 "登录 超时" 备注'
    const words = splitArguments(text.slice(8))
    expect(words.map(word => word.value)).toEqual(['修复', '登录 超时', '备注'])
    expect(argumentAt(text, text.length)).toMatchObject({ index: 2, query: '备注' })
  })
})
