import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cases, makeBody, summarize } from './reasoning-mapping-probe.mjs'

test('eight exact-route cases isolate historical reasoning and independent text perturbations', () => {
  assert.equal(cases.length, 8)
  assert.equal(new Set(cases.map(item => item.id)).size, 8)
  const bodies = new Map(cases.map(item => [item.id, makeBody(item)]))
  const control = bodies.get('glm53-control')
  const plain = bodies.get('glm53-plain')
  const details = bodies.get('glm53-details')
  const inline = bodies.get('glm53-inline')
  assert.ok(control && plain && details && inline)
  for (const body of bodies.values()) {
    assert.deepEqual(body.provider.order.length, 1)
    assert.equal(body.provider.allow_fallbacks, false)
    assert.equal(body.provider.require_parameters, true)
    assert.deepEqual(
      body.messages.map(message => message.role),
      ['system', 'user', 'assistant', 'tool', 'user'],
    )
    assert.deepEqual(body.messages[2].tool_calls, control.messages[2].tool_calls)
    assert.equal(body.messages[3].tool_call_id, 'history_call_1')
    assert.equal(body.stream_options.include_usage, true)
  }
  assert.equal(plain.messages[2].reasoning.length > 300, true)
  assert.deepEqual(
    details.messages[2].reasoning_details.map(item => item.index),
    [0, 1],
  )
  assert.equal(
    details.messages[2].reasoning_details.map(item => item.text).join(''),
    plain.messages[2].reasoning,
  )
  assert.equal(
    inline.messages[2].content,
    `<think>${plain.messages[2].reasoning}</think>${control.messages[2].content}`,
  )
  assert.deepEqual(
    plain.messages.map((message, index) =>
      index === 2 ? { ...message, reasoning: undefined } : message,
    ),
    control.messages.map((message, index) =>
      index === 2 ? { ...message, reasoning: undefined } : message,
    ),
  )
  for (const model of ['prime', 'flashx']) {
    const base = bodies.get(`${model}-control`)
    const long = bodies.get(`${model}-long`)
    assert.ok(base && long)
    assert.deepEqual(base.messages.slice(0, 4), long.messages.slice(0, 4))
    assert.ok(long.messages[4].content[0].text.length > base.messages[4].content[0].text.length)
    assert.equal(
      base.messages[4].content[0].cache_control?.ttl,
      model === 'prime' ? '5m' : undefined,
    )
  }
})

test('analysis reports only observed differences and preserves missing usage as unknown', () => {
  const analysis = summarize([
    { id: 'glm53-control', promptTokens: 100 },
    { id: 'glm53-plain', promptTokens: 120 },
    { id: 'glm53-details', promptTokens: null },
    { id: 'glm53-inline', promptTokens: 121 },
    { id: 'prime-control', promptTokens: 70 },
    { id: 'prime-long', promptTokens: 201 },
  ])
  assert.equal(analysis.glm53.plainMinusControl, 20)
  assert.equal(analysis.glm53.detailsMinusControl, null)
  assert.equal(analysis.glm53.inlineMinusControl, 21)
  assert.equal(analysis.prime.longMinusControl, 131)
  assert.equal(analysis.flashx.longMinusControl, null)
  assert.equal(analysis.status, 'diagnostic_only_no_meter_binding')
})
