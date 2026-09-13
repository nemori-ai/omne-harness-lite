import { describe, expect, it } from 'vitest'
import {
  HarnessError,
  errorChain,
  isContextWindowExceededError,
  isHarnessError,
  isQuotaExceededError,
  normalizeLlmFailure,
} from '../dist/llm/index.js'

describe('source LLM failure mechanisms', () => {
  it('keeps stable codes and renders chained and aggregate diagnostics', () => {
    const root = new Error('connect refused')
    const wrapped = new HarnessError('fetch failed', 'TRANSPORT', { cause: root })
    expect(isHarnessError(wrapped)).toBe(true)
    expect(errorChain(wrapped)).toBe('fetch failed: connect refused')
    expect(errorChain(new AggregateError([new Error('a'), new Error('b')], 'all'))).toBe('all [a; b]')
  })

  it('classifies explicit context and quota failures without treating rate limits as quota', () => {
    expect(isContextWindowExceededError('request too large for model context')).toBe(true)
    expect(isContextWindowExceededError('temperature exceeds maximum')).toBe(false)
    expect(isQuotaExceededError('insufficient quota')).toBe(true)
    expect(isQuotaExceededError('HTTP 429 rate limit reached')).toBe(false)
  })

  it('normalizes hostile and foreign adapter failures to immutable safe facts', () => {
    const hostile = { [Symbol.toPrimitive]: () => { throw new Error('hostile') } }
    expect(normalizeLlmFailure(hostile)).toEqual({ message: 'LLM adapter failed', code: 'UNKNOWN' })

    const foreign = Object.assign(new Error('provider failed'), {
      failure: { message: 'provider failed', code: 'FOREIGN', status: 200 },
      code: 'FOREIGN',
    })
    const normalized = normalizeLlmFailure(foreign)
    expect(normalized).toEqual({ message: 'provider failed', code: 'FOREIGN', status: 200 })
    expect(Object.isFrozen(normalized)).toBe(true)
  })
})
