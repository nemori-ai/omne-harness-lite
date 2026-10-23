import { readGovernanceRequest } from '@omne-harness/public-contract'
import { describe, expect, it } from 'vitest'
const limits = {
  maxBytes: 500_000,
  maxDepth: 30_000,
  maxItems: 100_000,
  maxMembers: 100,
  maxStringLength: 100_000,
  maxNumberLength: 100,
}
const read = (text: string, budget = limits) =>
  readGovernanceRequest({ bytes: new TextEncoder().encode(text), limits: budget })
const id = (text: string, budget = limits) => {
  const result = read(text, budget)
  expect(result.kind).toBe('protocol-rejected')
  return result.kind === 'protocol-rejected' ? result.response.messageId : undefined
}

it.each([
  '{"messageId":"m","x":1,"x":2}',
  '{"x":1,"x":2,"messageId":"m"}',
  '{"messageId":"m","protocolVersion":"a","protocolVersion":"b"}',
  '{"nested":{"messageId":3,"messageId":4},"messageId":"m"}',
  '{"messageId":"m","a":[true,false,null,{"x":1,"x":2}],"b":-1.234e+5}',
  '{"messageId":"m","x":1,"\\u0078":2}',
])('recovers exactly one root ID after duplicate refusal: %s', text => expect(id(text)).toBe('m'))
it('trusts an empty string and does not trust repeated IDs even when values agree', () => {
  expect(id('{"messageId":"","x":0,"x":1}')).toBe('')
  expect(id('{"messageId":"m","\\u006dessageId":"m"}')).toBeUndefined()
  expect(id('{"messageId":7,"x":0,"x":1}')).toBeUndefined()
  expect(id('[{"messageId":"m","x":0,"x":1}]')).toBeUndefined()
})

it.each(['', ',', ' trailing', '/*comment*/', '{}'])(
  'requires full EOF after a duplicate, suffix %j',
  suffix => {
    const text = '{"messageId":"m","x":0,"x":1}' + suffix
    expect(id(text)).toBe(suffix === '' ? 'm' : undefined)
  },
)

describe('strict suffix grammar and lexer', () => {
  it.each([
    '01',
    '1.',
    '1e',
    '+1',
    'NaN',
    '-.1',
    '1e+',
    '[1,]',
    '{"a":1,}',
    '{"a" 1}',
    '[true false]',
    '"\\q"',
    '"raw\nline"',
    '"\\u12"',
    '"unterminated',
    '/* comment */0',
    'true false',
  ])('suppresses recovery for %j', value => {
    expect(id('{"messageId":"m","x":0,"x":1,"suffix":' + value + '}')).toBeUndefined()
  })
  it.each([
    '0',
    '-0',
    '1.00',
    '1e+99',
    '"\\u0061\\n\\t\\/\\\\\\\""',
    '[]',
    '{}',
    '[1,{"x":[false,null]}]',
  ])('retains recovery for %j', value => {
    expect(id('{"messageId":"m","x":0,"x":1,"suffix":' + value + '}')).toBe('m')
  })
})

it('checks all six budgets in the complete duplicate document', () => {
  const text = '{"messageId":"m","x":0,"x":[123]}'
  const exact = {
    maxBytes: new TextEncoder().encode(text).length,
    maxDepth: 2,
    maxItems: 5,
    maxMembers: 3,
    maxStringLength: 9,
    maxNumberLength: 3,
  }
  expect(id(text, exact)).toBe('m')
  for (const key of Object.keys(exact) as (keyof typeof exact)[])
    expect(id(text, { ...exact, [key]: exact[key] - 1 })).toBeUndefined()
})
it('does not add a native recursive depth limit to correlation recovery', () => {
  const text = '{"messageId":"m","x":0,"x":' + '['.repeat(20_000) + '0' + ']'.repeat(20_000) + '}'
  expect(id(text)).toBe('m')
})
it('rejects invalid UTF-8 and BOM without partial correlation', () => {
  const invalid = new Uint8Array([...new TextEncoder().encode('{"messageId":"m","x":0,"x":'), 255])
  const result = readGovernanceRequest({ bytes: invalid, limits })
  expect(result).toEqual({
    kind: 'protocol-rejected',
    response: { protocolVersion: 'governance-public/1', outcome: 'protocol-rejected', body: {} },
    diagnostic: { code: 'json' },
  })
  expect(id('\uFEFF{"messageId":"m","x":0,"x":1}')).toBeUndefined()
})

it.each([
  '{"x":0,"x":0,"messageId":"m","nested":{"messageId":"nested"}}',
  '{"nested":{"messageId":"nested"},"x":0,"x":0,"messageId":"m"}',
  '{"x":0,"x":1e1,"messageId":"m"}',
  '{ "x":0,"x":0,"messageId":"m"}',
  '{\n"x":0,"x":0,"messageId":"m"}',
])('preserves only the root ID through nested strings, numbers and whitespace: %s', text => {
  expect(read(text)).toEqual({
    kind: 'protocol-rejected',
    response: {
      protocolVersion: 'governance-public/1',
      messageId: 'm',
      outcome: 'protocol-rejected',
      body: {},
    },
    diagnostic: { code: 'json' },
  })
})

it('counts duplicate members before trusting a later root ID', () => {
  const text = '{"x":0,"x":0,"messageId":"m"}'
  expect(read(text, { ...limits, maxMembers: 3 })).toEqual({
    kind: 'protocol-rejected',
    response: {
      protocolVersion: 'governance-public/1',
      messageId: 'm',
      outcome: 'protocol-rejected',
      body: {},
    },
    diagnostic: { code: 'json' },
  })
  expect(read(text, { ...limits, maxMembers: 2 })).toEqual({
    kind: 'protocol-rejected',
    response: { protocolVersion: 'governance-public/1', outcome: 'protocol-rejected', body: {} },
    diagnostic: { code: 'json' },
  })
})
