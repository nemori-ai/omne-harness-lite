import { describe, expect, it } from 'vitest'
import { readJsonText } from '@omne-harness/json-text'
import { authorDecision } from '@omne-harness/tool-contract/provider'

const tree = (text: string) => {
  const read = readJsonText(text, {
    maxBytes: 4096,
    maxDepth: 8,
    maxItems: 64,
    maxMembers: 16,
    maxStringLength: 1024,
    maxNumberLength: 32,
  })
  if (read.kind !== 'ok') throw new Error(`fixture is not JSON: ${read.kind}`)
  return read.value
}

describe('authorDecision', () => {
  it('decodes an answer into plain JSON', () => {
    const value = tree(
      '{"answers":[{"cardId":"q1","kind":"selection","optionId":"o2"},{"cardId":"q2","kind":"text","text":"Use \\"7070\\"."}]}',
    )
    expect(authorDecision({ kind: 'answer', value })).toEqual({
      kind: 'answer',
      value: {
        answers: [
          { cardId: 'q1', kind: 'selection', optionId: 'o2' },
          { cardId: 'q2', kind: 'text', text: 'Use "7070".' },
        ],
      },
    })
  })

  it.each([{ kind: 'no-answer' }, { kind: 'declined' }] as const)(
    'passes $kind unchanged',
    decision => {
      expect(authorDecision(decision)).toBe(decision)
    },
  )
})
