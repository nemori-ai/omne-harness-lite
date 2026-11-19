import { describe, expect, it } from 'vitest'
import { SNIPPET_CONTEXT, SNIPPET_MATCH, snippetOf } from '../src/index.ts'

const match = (block: string, start: number, end: number) =>
  ({ kind: 'message.user', block, span: { start, end } }) as const

describe('the snippet of a hit', () => {
  it('is the match with what stands before and after it in the block', () => {
    expect(snippetOf(match('say needle now', 4, 10))).toEqual({
      before: 'say ',
      match: 'needle',
      after: ' now',
    })
    expect(snippetOf(match('needle', 0, 6))).toEqual({ before: '', match: 'needle', after: '' })
  })

  it('keeps a bounded context on each side and a bounded match, counted in code points', () => {
    const block = `${'a'.repeat(100)}${'m'.repeat(300)}${'z'.repeat(100)}`
    const snippet = snippetOf(match(block, 100, 400))
    expect(snippet.before).toBe('a'.repeat(SNIPPET_CONTEXT))
    expect(snippet.match).toBe('m'.repeat(SNIPPET_MATCH))
    expect(snippet.after).toBe('z'.repeat(SNIPPET_CONTEXT))
  })

  it('never cuts a surrogate pair in two', () => {
    const faces = '😀'.repeat(60)
    const snippet = snippetOf(match(`${faces}x${faces}`, faces.length, faces.length + 1))
    expect(Array.from(snippet.before)).toEqual(Array.from({ length: SNIPPET_CONTEXT }, () => '😀'))
    expect(Array.from(snippet.after)).toEqual(Array.from({ length: SNIPPET_CONTEXT }, () => '😀'))
    expect(snippet.match).toBe('x')
    const long = snippetOf(match('😀'.repeat(200), 0, 400))
    expect(Array.from(long.match)).toHaveLength(SNIPPET_MATCH)
  })
})
