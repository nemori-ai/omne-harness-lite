import { describe, expect, it } from 'vitest'
import { isModelKind, KIND_TRAITS, MODEL_KINDS } from '../src/index.ts'
import { judgeFixedModelRequest } from '../src/provider/index.ts'
import { request } from './scripted-support.ts'

describe('the kinds of model', () => {
  it('are a closed set, and each has its traits', () => {
    expect(MODEL_KINDS).toEqual(['llm', 'decisions', 'live'])
    expect(Object.keys(KIND_TRAITS).sort()).toEqual([...MODEL_KINDS].sort())
    expect(MODEL_KINDS.every(isModelKind)).toBe(true)
    expect(isModelKind('image')).toBe(false)
  })

  it('only a live call takes input while it runs, and it is metered in seconds', () => {
    expect(KIND_TRAITS.live).toEqual({ input: true, usage: 'second' })
    expect(KIND_TRAITS.llm).toEqual({ input: false, usage: 'token' })
    expect(KIND_TRAITS.decisions).toEqual({ input: false, usage: 'token' })
  })
})

describe('the model kind of a fixed request', () => {
  it('is kept as written, and decides which members the request has', () => {
    expect(judgeFixedModelRequest(request)).toMatchObject({ ok: { kind: 'llm' } })
    const { profile, suppliers, fallback, retryPolicy, source } = request
    const ask = { state: 'text', questions: { Q: { type: 'noul' } } }
    const decision = { kind: 'decisions', profile, suppliers, fallback, retryPolicy, source, ask }
    expect(judgeFixedModelRequest(decision)).toEqual({ ok: decision })
    expect(judgeFixedModelRequest({ ...request, kind: 'decisions' })).toEqual({
      failure: { field: '', reason: 'unknown-field' },
    })
  })

  it.each(['live', 'image', '', null, 1])('refuses %j and names the field', kind => {
    expect(judgeFixedModelRequest({ ...request, kind })).toEqual({
      failure: { field: '/kind', reason: 'value' },
    })
  })

  it.each([null, 5, 'llm', true])('refuses %j, which is no record, at the root', value => {
    expect(judgeFixedModelRequest(value)).toEqual({ failure: { field: '', reason: 'type' } })
  })

  it('a decision request is judged like any request: its suppliers and its source too', () => {
    const { profile, suppliers, fallback, retryPolicy, source } = request
    const ask = { state: 'text', questions: { Q: { type: 'noul' } } }
    const decision = { kind: 'decisions', profile, suppliers, fallback, retryPolicy, source, ask }
    expect(judgeFixedModelRequest({ ...decision, suppliers: [] })).toMatchObject({
      failure: { field: '/suppliers' },
    })
    expect(judgeFixedModelRequest({ ...decision, source: { ...source, digest: 5 } })).toMatchObject(
      { failure: { field: '/source/digest' } },
    )
    expect(judgeFixedModelRequest({ ...decision, ask: { state: 'text' } })).toEqual({
      failure: { field: '/ask', reason: 'value' },
    })
  })

  it('refuses a request that states no model kind', () => {
    const { kind: _kind, ...unstated } = request
    expect(judgeFixedModelRequest(unstated)).toMatchObject({ failure: { field: '/kind' } })
  })
})
