import { describe, expect, it } from 'vitest'
import { toolCallState, toolResultText, type Part } from '../src/model/conversation.ts'

type Call = Extract<Part, { kind: 'tool-call' }>

const call = (more: Partial<Call> = {}): Call => ({
  kind: 'tool-call',
  key: 'k',
  callId: 'c',
  name: 'Web',
  arguments: null,
  raw: null,
  state: 'complete',
  result: null,
  ended: false,
  ...more,
})
const words = (key: string, text: string): Part => ({ kind: 'text', key, text })
const picture: Part = { kind: 'media', key: 'm', media: 'image', detail: '', source: null }

describe('what a drawing of a tool call is told of the call', () => {
  it('a call with no result is working while its run goes, and has no result once the run ended', () => {
    expect(toolCallState(call())).toBe('working')
    expect(toolCallState(call({ ended: true }))).toBe('no-result')
  })

  it('a call with a result is completed, whether or not the run ended', () => {
    expect(toolCallState(call({ result: { parts: [] } }))).toBe('completed')
    expect(toolCallState(call({ result: { parts: [] }, ended: true }))).toBe('completed')
  })

  it('the result is its words, one under another; what is not words is left out', () => {
    expect(toolResultText(call())).toBeNull()
    expect(
      toolResultText(call({ result: { parts: [words('a', '一'), picture, words('b', '二')] } })),
    ).toBe('一\n二')
    expect(toolResultText(call({ result: { parts: [picture] } }))).toBe('')
  })
})
