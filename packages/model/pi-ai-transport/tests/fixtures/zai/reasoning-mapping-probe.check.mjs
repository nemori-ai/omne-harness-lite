import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cases,
  exactContextTokens,
  makeBody,
  plainUsd,
  seedHistory,
  summarize,
} from './reasoning-mapping-probe.mjs'

const actualHistory = {
  content: 'The result is 323.',
  reasoning: 'I multiplied 17 by 19.',
  details: [
    { type: 'reasoning.text', text: 'I multiplied 17', index: 0, format: 'glm' },
    { type: 'reasoning.text', text: ' by 19.', index: 1, format: 'glm' },
  ],
}

test('eight pinned routes isolate genuine seed replay and commercial text changes', () => {
  assert.equal(cases.length, 8)
  assert.equal(new Set(cases.map(item => item.id)).size, 8)
  const bodies = new Map(cases.map(item => [item.id, makeBody(item, actualHistory)]))
  const seed = bodies.get('glm53-seed')
  const control = bodies.get('glm53-control')
  const plain = bodies.get('glm53-plain')
  const details = bodies.get('glm53-details')
  assert.ok(seed && control && plain && details)
  for (const body of bodies.values()) {
    assert.equal(body.provider.order.length, 1)
    assert.equal(body.provider.allow_fallbacks, false)
    assert.equal(body.provider.require_parameters, true)
    assert.equal(body.stream_options.include_usage, true)
  }
  assert.deepEqual(
    seed.messages.map(item => item.role),
    ['system', 'user'],
  )
  for (const body of [control, plain, details]) {
    assert.deepEqual(
      body.messages.map(item => item.role),
      ['system', 'user', 'assistant', 'user'],
    )
    assert.equal(body.messages[2].content, actualHistory.content)
  }
  assert.equal(plain.messages[2].reasoning, actualHistory.reasoning)
  assert.deepEqual(details.messages[2].reasoning_details, actualHistory.details)
  assert.deepEqual(control.messages[2], { role: 'assistant', content: actualHistory.content })
  for (const model of ['prime', 'flashx']) {
    const base = bodies.get(`${model}-control`)
    const long = bodies.get(`${model}-long`)
    assert.ok(base && long)
    assert.deepEqual(base.messages.slice(0, 4), long.messages.slice(0, 4))
    assert.equal(base.messages[3].tool_call_id, 'history_call_1')
    assert.ok(long.messages[4].content[0].text.length > base.messages[4].content[0].text.length)
    assert.equal(
      base.messages[4].content[0].cache_control?.ttl,
      model === 'prime' ? '5m' : undefined,
    )
  }
})

test('seed reconstruction keeps complete ordered details but refuses fragmented indexes', () => {
  const complete = seedHistory({
    requestId: 'actual-seed',
    frames: [
      {
        choices: [
          {
            delta: {
              content: 'The result ',
              reasoning: 'I multiplied ',
              reasoning_details: [actualHistory.details[0]],
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              content: 'is 323.',
              reasoning: '17 by 19.',
              reasoning_details: [actualHistory.details[1]],
            },
          },
        ],
      },
    ],
  })
  assert.equal(complete.content, actualHistory.content)
  assert.equal(complete.reasoning, actualHistory.reasoning)
  assert.deepEqual(complete.details, actualHistory.details)
  assert.equal(complete.sourceRequestId, 'actual-seed')
  const fragmented = seedHistory({
    frames: [
      { choices: [{ delta: { reasoning: 'A', reasoning_details: [actualHistory.details[0]] } }] },
      { choices: [{ delta: { reasoning: 'B', reasoning_details: [actualHistory.details[0]] } }] },
    ],
  })
  assert.equal(fragmented.details, undefined)
  assert.equal(fragmented.reasoning, 'AB')
  assert.equal(
    seedHistory({ frames: [{ choices: [{ delta: { content: 'answer' } }] }] }),
    undefined,
  )
})

test('analysis reports observed differences and missing usage without certifying mapping', () => {
  const analysis = summarize([
    { id: 'glm53-control', promptTokens: 100 },
    { id: 'glm53-plain', promptTokens: 120 },
    { id: 'glm53-details', promptTokens: null },
    { id: 'prime-control', promptTokens: 70 },
    { id: 'prime-long', promptTokens: 201 },
  ])
  assert.equal(analysis.glm53.plainMinusControl, 20)
  assert.equal(analysis.glm53.detailsMinusControl, null)
  assert.equal(analysis.prime.longMinusControl, 131)
  assert.equal(analysis.flashx.longMinusControl, null)
  assert.equal(analysis.status, 'diagnostic_only_no_meter_binding')
})

test('cost lexemes expand without floating-point rounding or a fake zero', () => {
  assert.equal(plainUsd('1.234e-7'), '0.0000001234')
  assert.equal(plainUsd('1.2300E+2'), '123.00')
  assert.equal(plainUsd('0.000000000000000123456789'), '0.000000000000000123456789')
  assert.equal(plainUsd('0e-20'), '0')
  for (const invalid of [-1, null, '-1e-7', 'NaN', '1e100000', '1.2.3'])
    assert.equal(plainUsd(invalid), undefined)
})

test('reservation context comes from the selected raw endpoint, never a card summary', () => {
  const endpoint = { tag: 'z-ai/fp8', provider: 'Z.AI' }
  const source = context_length => ({
    cards: [{ id: 'z-ai/glm-5.3', endpoints: [{ ...endpoint, contextLength: 7 }] }],
    endpointSources: {
      'z-ai/glm-5.3': {
        raw: `{"data":{"endpoints":[{"tag":"z-ai/fp8","provider_name":"Z.AI","context_length":${context_length}}]}}`,
      },
    },
  })
  assert.equal(exactContextTokens(source('1048576'), 'z-ai/glm-5.3', endpoint), 1048576)
  assert.throws(() => exactContextTokens(source('null'), 'z-ai/glm-5.3', endpoint))
  assert.throws(() => exactContextTokens(source('9007199254740993'), 'z-ai/glm-5.3', endpoint))
  assert.throws(() =>
    exactContextTokens({ cards: source('1048576').cards }, 'z-ai/glm-5.3', endpoint),
  )
  assert.throws(() =>
    exactContextTokens(source('1048576'), 'z-ai/glm-5.3', {
      tag: 'z-ai/fp8',
      provider: 'Another provider',
    }),
  )
})
