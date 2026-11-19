import { describe, expect, it } from 'vitest'
import { addLexemes } from '@omne-harness/usage-contract'

describe('the usage contract entry', () => {
  it('exports the folding functions and the value lists, nothing that needs Cordis or storage', async () => {
    const root = (await import('@omne-harness/usage-contract')) as Record<string, unknown>
    expect(Object.keys(root).sort()).toEqual([
      'TOKEN_KINDS',
      'USAGE_BUCKETS',
      'USAGE_DIMENSIONS',
      'addLexemes',
      'checkUsageQuery',
      'edgesOf',
      'fold',
      'measure',
    ])
  })
})

describe('exact sums of account lexemes', () => {
  it('adds decimals of any places without rounding and keeps no trailing zeros', () => {
    expect(addLexemes('0', '0')).toBe('0')
    expect(addLexemes('0.1', '0.2')).toBe('0.3')
    expect(addLexemes('999999999999999999', '1')).toBe('1000000000000000000')
    expect(addLexemes('1.25', '0.75')).toBe('2')
    expect(addLexemes('0.001368', '0.00175')).toBe('0.003118')
  })

  it('refuses a lexeme that is not a decimal of the accounts', () => {
    for (const bad of ['-1', '01', '1.', '.5', '1e3', ''])
      expect(() => addLexemes(bad, '1'), bad).toThrow(`not a decimal lexeme: ${bad}`)
  })
})
