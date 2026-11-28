import { describe, expect, it } from 'vitest'
import { modelProtocol } from '@omne-harness/model-protocol'
import { expectRoundTrip, limits, readSample, session, tenant, tree } from './fixtures/samples.ts'

const operation = modelProtocol.operations['list-models']
const sonnet = {
  route: 'anthropic/claude-sonnet-5',
  selectable: true,
  reasons: [],
  credential: 'available',
  input: ['text', 'image'],
  output: ['text'],
}

describe('model/v1', () => {
  it('is model major 1 with exactly one operation and no observation', () => {
    expect(modelProtocol.name).toBe('model')
    expect(modelProtocol.major).toBe(1)
    expect(Object.keys(modelProtocol.operations)).toEqual(['list-models'])
    expect(Object.keys(modelProtocol.observations)).toEqual([])
  })

  it('list-models is a login read of the small limit that counts as access', () => {
    expect({
      identity: operation.identity,
      effect: operation.effect,
      limit: operation.limit,
      countsAsAccess: operation.countsAsAccess,
    }).toEqual({ identity: 'login', effect: 'read', limit: 'small', countsAsAccess: true })
    expect('carriesCredential' in operation).toBe(false)
  })

  it('answers succeeded of its own, and the fixed outcomes', () => {
    expect(Object.keys(operation.outcomes).sort()).toEqual(
      ['basis-unavailable', 'denied', 'protocol-rejected', 'succeeded'].sort(),
    )
    for (const fixed of ['protocol-rejected', 'basis-unavailable', 'denied'] as const)
      expect(operation.outcomes[fixed]).toBe(true)
  })
})

describe('the body of list-models', () => {
  it('is the tenant, and nothing else', () => {
    expectRoundTrip(operation.body, { tenant })
    expect(readSample(operation.body, {}).ok).toBe(false)
    expect(readSample(operation.body, { tenant: 'not a tenant' }).ok).toBe(false)
    expect(readSample(operation.body, { tenant, selected: 'x' }).ok).toBe(false)
  })

  it('may name a kind of model from revision 5 on; an end at revision 4 is not sent one', () => {
    for (const kind of ['llm', 'decisions', 'live'])
      expectRoundTrip(operation.body, { tenant, kind })
    expect(readSample(operation.body, { tenant, kind: 'image' }).ok).toBe(false)
    expect(operation.body.read(tree({ tenant, kind: 'llm' }), limits, 4).ok).toBe(false)
  })

  it('may name a session from revision 4 on; an end at revision 3 is not sent one', () => {
    expectRoundTrip(operation.body, { tenant, session })
    expect(readSample(operation.body, { tenant, session: 'not a session' }).ok).toBe(false)
    expect(operation.body.read(tree({ tenant, session }), limits, 3).ok).toBe(false)
  })
})

describe('what list-models answers', () => {
  const answered = operation.outcomes.succeeded
  it('carries each model with whether it can be selected, why not, and its credential', () => {
    expectRoundTrip(answered, { models: [] })
    expectRoundTrip(answered, {
      models: [
        sonnet,
        { ...sonnet, reasoningEfforts: ['low', 'xhigh'] },
        { ...sonnet, route: 'openai/gpt-6-astra', credential: 'missing' },
        { ...sonnet, route: 'locked', selectable: false, reasons: ['locked', 'scope'] },
        {
          ...sonnet,
          route: 'voice-only',
          selectable: false,
          reasons: ['modality'],
          input: ['voice'],
        },
        { ...sonnet, route: 'unread', credential: 'unknown' },
      ],
    })
  })

  it.each([
    ['a native effort outside the four user settings', { ...sonnet, reasoningEfforts: ['max'] }],
    ['a model without a route', { ...sonnet, route: '' }],
    ['a reason outside the three', { ...sonnet, reasons: ['withdrawn'] }],
    ['a credential state outside the three', { ...sonnet, credential: 'unreadable' }],
    ['a modality outside the three', { ...sonnet, input: ['video'] }],
    ['a selectable that is not a boolean', { ...sonnet, selectable: 'yes' }],
    ['a member it does not know', { ...sonnet, vendor: 'anthropic' }],
    ['a model that lacks a member', { route: 'x', selectable: true }],
  ])('refuses %s', (_name, model) => {
    expect(readSample(answered, { models: [model] }).ok).toBe(false)
  })

  it('names, from revision 4 on, the blocks of the session that stop a model; at most 16', () => {
    const blocked = {
      ...sonnet,
      route: 'text-only',
      selectable: false,
      reasons: ['modality'],
      input: ['text'],
      blocks: [{ message: 'msg_1', block: 'blk_1' }],
    }
    expectRoundTrip(answered, { models: [blocked] })
    const many = Array.from({ length: 17 }, (_, at) => ({ message: 'msg_1', block: `blk_${at}` }))
    expect(readSample(answered, { models: [{ ...blocked, blocks: many }] }).ok).toBe(false)
    expect(answered.read(tree({ models: [blocked] }), limits, 3).ok).toBe(false)
    const read = readSample(answered, { models: [blocked] })
    if (!read.ok) throw new Error('not read')
    const told = answered.write(read.value, limits, 3)
    expect(told.ok && JSON.stringify(told.value).includes('blocks')).toBe(false)
  })

  it('names, from revision 5 on, the kind of each model and whether the need is met', () => {
    const judge = { ...sonnet, route: 'vendor/judge', kind: 'decisions', input: ['text'] }
    for (const supply of [
      { state: 'ready' },
      { state: 'unknown' },
      { state: 'blocked', by: 'no-offering' },
      { state: 'blocked', by: 'credential', providers: ['openai'] },
      { state: 'blocked', by: 'not-enabled', models: [{ provider: 'openrouter', route: 'a/b' }] },
      { state: 'blocked', by: 'locked', models: [{ provider: 'openrouter', route: 'a/b' }] },
      { state: 'blocked', by: 'scope', models: [{ provider: 'openrouter', route: 'a/b' }] },
    ])
      expectRoundTrip(answered, { models: [{ ...sonnet, kind: 'llm' }, judge], supply })
    expect(readSample(answered, { models: [{ ...sonnet, kind: 'image' }] }).ok).toBe(false)
    expect(readSample(answered, { models: [], supply: { state: 'gone' } }).ok).toBe(false)
    expect(
      readSample(answered, { models: [], supply: { state: 'blocked', by: 'weather' } }).ok,
    ).toBe(false)
    expect(answered.read(tree({ models: [judge] }), limits, 4).ok).toBe(false)
    expect(answered.read(tree({ models: [], supply: { state: 'ready' } }), limits, 4).ok).toBe(
      false,
    )
    const read = readSample(answered, { models: [judge], supply: { state: 'ready' } })
    if (!read.ok) throw new Error('not read')
    const told = answered.write(read.value, limits, 4)
    expect(told.ok && JSON.stringify(told.value).includes('decisions')).toBe(false)
    expect(told.ok && JSON.stringify(told.value).includes('supply')).toBe(false)
  })

  it('refuses a page without the list', () => {
    expect(readSample(answered, {}).ok).toBe(false)
  })
})
