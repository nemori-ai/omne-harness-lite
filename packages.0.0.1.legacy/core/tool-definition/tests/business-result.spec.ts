import { expect, it } from 'vitest'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { judgeToolReturn, toolResultOf, validate } from '../src/index.ts'

it('keeps explicit business failure separate from text, absence and false', () => {
  const id = parseOpaqueIdentifier('business-result', 'BlockId')
  if (!('ok' in id)) throw new Error('fixture')
  for (const result of [
    { content: [] },
    { content: [], isError: false },
    { content: [], isError: true },
  ]) {
    expect(validate('ToolReturn', result).valid).toBe(true)
    expect(judgeToolReturn(result)).toEqual({ ok: true })
    expect(toolResultOf(result, id.ok)).toEqual(result)
  }
  expect(toolResultOf('error: ordinary text', id.ok)).not.toHaveProperty('isError')
  for (const isError of [null, 0, 1, 'true', {}, []]) {
    expect(validate('ToolReturn', { content: [], isError }).valid).toBe(false)
    expect(judgeToolReturn({ content: [], isError })).toHaveProperty('rejected')
  }
})
