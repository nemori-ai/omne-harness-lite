import assert from 'node:assert/strict'
import { test } from 'node:test'
import { candidatePrompt, candidateTokens } from './commercial-candidate-check.mjs'
import { cases, makeBody } from './commercial-holdout-probe.mjs'

test('four independent holdout requests pin routes and change only final text within each pair', () => {
  assert.equal(cases.length, 4)
  assert.equal(new Set(cases.map(item => item.id)).size, 4)
  assert.equal(makeBody({ id: 'prime-base', model: 'other' }).model, 'z-ai/glm-5.3-prime')
  assert.throws(() => makeBody({ id: 'unapproved' }))
  for (const model of ['prime', 'flashx']) {
    const base = makeBody(cases.find(item => item.id === `${model}-base`))
    const mixed = makeBody(cases.find(item => item.id === `${model}-mixed`))
    assert.deepEqual(base.provider, mixed.provider)
    assert.equal(base.provider.allow_fallbacks, false)
    assert.equal(base.provider.require_parameters, true)
    assert.equal(base.stream_options.include_usage, true)
    assert.deepEqual(base.messages.slice(0, 4), mixed.messages.slice(0, 4))
    assert.deepEqual(base.tools, mixed.tools)
    assert.notEqual(base.messages[4].content[0].text, mixed.messages[4].content[0].text)
    assert.equal(
      base.messages[4].content[0].cache_control?.ttl,
      model === 'prime' ? '5m' : undefined,
    )
    assert.equal(candidatePrompt(base) === undefined, false)
    assert.equal(candidatePrompt(mixed) === undefined, false)
    assert.ok(candidateTokens(mixed) > candidateTokens(base))
  }
})
