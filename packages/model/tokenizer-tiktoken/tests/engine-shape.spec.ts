import { Tiktoken } from 'js-tiktoken/lite'
import { expect, it } from 'vitest'
import { createOrdinaryCounter } from '../src/ordinary-counter.ts'

it('rejects incompatible pinned-engine runtime members at the private boundary', () => {
  for (const [name, value] of [
    ['patStr', 123],
    ['rankMap', {}],
    ['rankMap', new Map([[1, 2]])],
    ['rankMap', new Map([['97', 'invalid']])],
  ] as const) {
    const engine = new Tiktoken({ pat_str: '.', bpe_ranks: '! 0 YQ==', special_tokens: {} })
    Reflect.set(engine, name, value)
    expect(() => createOrdinaryCounter(engine)).toThrow(
      'incompatible js-tiktoken 1.0.21 runtime shape',
    )
  }
})
