import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { boundInstructions } from '@omne-harness/mcp-contract'

const sha = (text: string) => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`

describe('boundInstructions', () => {
  it('keeps text within the bound whole', () => {
    expect(boundInstructions('use tools', 9)).toEqual({
      text: 'use tools',
      truncated: false,
      digest: sha('use tools'),
    })
  })

  it('cuts at the byte bound and digests the whole text before the cut', () => {
    expect(boundInstructions('abcdef', 4)).toEqual({
      text: 'abcd',
      truncated: true,
      digest: sha('abcdef'),
    })
  })

  it('does not split a character: a cut inside a multi-byte character drops all of it', () => {
    // 'é' is 2 bytes and '€' is 3 bytes in UTF-8.
    expect(boundInstructions('aé', 2).text).toBe('a')
    expect(boundInstructions('a€b', 3).text).toBe('a')
    expect(boundInstructions('a€b', 4).text).toBe('a€')
    expect(boundInstructions('€', 2)).toMatchObject({ text: '', truncated: true })
  })

  it('throws for a bound that is not a positive safe integer', () => {
    for (const bound of [0, -1, 1.5, Number.NaN])
      expect(() => boundInstructions('a', bound)).toThrow(RangeError)
  })
})
