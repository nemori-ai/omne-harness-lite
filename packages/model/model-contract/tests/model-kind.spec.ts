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
  it.each(['llm', 'decisions'])('is kept as written: %s', kind => {
    expect(judgeFixedModelRequest({ ...request, kind })).toMatchObject({ ok: { kind } })
  })

  it.each(['live', 'image', '', null, 1])('refuses %j and names the field', kind => {
    expect(judgeFixedModelRequest({ ...request, kind })).toEqual({
      failure: { field: '/kind', reason: 'value' },
    })
  })

  it('refuses a request that states no model kind', () => {
    const { kind: _kind, ...unstated } = request
    expect(judgeFixedModelRequest(unstated)).toMatchObject({ failure: { field: '/kind' } })
  })
})
