// The preserved answer of the trusted Tool request source (R2-D399): only a facts material of the
// answer schema whose value is one string is an answer; everything else is refused, never read.
import { describe, expect, it } from 'vitest'
import { toolCallAnswerOf, toolCallAnswerSchema } from '../src/loop/tools.ts'

const text = (value: string) => ({ kind: 'string', value }) as const

describe('toolCallAnswerOf', () => {
  it('reads the text of an answer material', () => {
    expect(
      toolCallAnswerOf({ kind: 'facts', schema: toolCallAnswerSchema, value: text('guide') }),
    ).toBe('guide')
  })

  it('refuses a facts material of another schema, another kind, or a value that is not a string', () => {
    const other = { ...toolCallAnswerSchema, name: 'fixed-tool-request' }
    expect(toolCallAnswerOf({ kind: 'facts', schema: other, value: text('guide') })).toBeNull()
    expect(
      toolCallAnswerOf({
        kind: 'facts',
        schema: toolCallAnswerSchema,
        value: { kind: 'number', lexeme: '1' },
      }),
    ).toBeNull()
    expect(toolCallAnswerOf({ kind: 'model', result: {} as never, pages: [] } as never)).toBeNull()
  })
})
