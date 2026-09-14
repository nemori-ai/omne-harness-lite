import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import {
  APP_IDENTITY,
  ReasoningEffortId,
  attributionHeaders,
  callConfigEquals,
  isAgentLoopRequest,
  markAgentLoopRequest,
  userAgent,
  type GenerateOptions,
} from '../dist/index.js'

const manifest = createRequire(import.meta.url)('../package.json') as { version: string }

describe('source request configuration and attribution', () => {
  it('compares all request configuration fields including ordered stop values', () => {
    const base = { provider: 'p', model: 'm' }
    expect(callConfigEquals(base, base)).toBe(true)
    expect(callConfigEquals(base, { ...base, model: 'other' })).toBe(false)
    expect(callConfigEquals(
      { ...base, reasoningEffort: ReasoningEffortId('high'), stop: ['a', 'b'] },
      { ...base, reasoningEffort: ReasoningEffortId('high'), stop: ['a', 'b'] },
    )).toBe(true)
    expect(callConfigEquals({ ...base, stop: ['a', 'b'] }, { ...base, stop: ['b', 'a'] })).toBe(false)
  })

  it('marks only the exact loop request object', () => {
    const request: GenerateOptions = { provider: 'p', model: 'm', messages: [] }
    const copy = { ...request }
    expect(markAgentLoopRequest(request)).toBe(request)
    expect(isAgentLoopRequest(request)).toBe(true)
    expect(isAgentLoopRequest(copy)).toBe(false)
  })

  it('derives a static public identity from the package manifest', () => {
    expect(APP_IDENTITY).toEqual({
      product: 'omne-harness-lite-llm',
      version: manifest.version,
      url: 'https://github.com/deepseek-ai/deepseek-harness',
    })
    expect(attributionHeaders()).toEqual({ 'user-agent': userAgent() })
    expect(attributionHeaders({ product: 'fork', version: '1', url: 'https://example.test' }))
      .toEqual({ 'user-agent': 'fork/1 (+https://example.test)' })
  })
})
