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
    expect(judgeFixedModelRequest({ ...request, kind: 'live' })).toEqual({
      failure: { field: '', reason: 'unknown-field' },
    })
  })

  it('a live request is judged like any request, with its instructions, history, voice and media', () => {
    const { profile, suppliers, fallback, retryPolicy, source } = request
    const live = {
      kind: 'live',
      profile,
      suppliers,
      fallback,
      retryPolicy,
      source,
      instructions: 'Answer the caller briefly.',
      history: [],
      voice: null,
      media: { via: 'link', audio: 'pcm16' },
    }
    expect(judgeFixedModelRequest(live)).toEqual({ ok: live })
    const standing = { ...live, voice: 'marin', standby: { idleSeconds: '30' } }
    expect(judgeFixedModelRequest(standing)).toEqual({ ok: standing })
    for (const [broken, field, reason] of [
      [{ ...live, media: { via: 'direct', audio: 'pcm16' } }, '/media/via', 'value'],
      [{ ...live, media: { via: 'link', audio: '' } }, '/media/audio', 'value'],
      [{ ...live, media: 5 }, '/media', 'type'],
      [{ ...live, media: { via: 'link', audio: 'pcm16', more: 1 } }, '/media', 'unknown-field'],
      [{ ...live, voice: '' }, '/voice', 'value'],
      [{ ...live, standby: { idleSeconds: '0' } }, '/standby/idleSeconds', 'integer'],
      [{ ...live, standby: 'soon' }, '/standby', 'type'],
      [{ ...live, history: [{ role: 'nobody' }] }, '/history/0', 'message'],
      [{ ...live, history: 'none' }, '/history', 'type'],
      [{ ...live, instructions: 5 }, '/instructions', 'type'],
      [{ ...live, source: 5 }, '/source', 'type'],
      [{ ...live, suppliers: [] }, '/suppliers', 'value'],
    ] as const)
      expect(judgeFixedModelRequest(broken), field).toEqual({ failure: { field, reason } })
  })

  it.each(['image', '', null, 1])('refuses %j and names the field', kind => {
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
