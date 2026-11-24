import { describe, expect, it } from 'vitest'
import { modelProtocol } from '@omne-harness/model-protocol'
import { expectRoundTrip, readSample, tenant } from './fixtures/samples.ts'

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

  it('refuses a page without the list', () => {
    expect(readSample(answered, {}).ok).toBe(false)
  })
})
