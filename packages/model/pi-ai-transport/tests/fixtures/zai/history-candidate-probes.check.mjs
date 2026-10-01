import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { freezeHistoryCandidateProbes } from './history-candidate-probes.mjs'

test('15 unsent complete-history probes preserve pair geometry and explicit output limit', () => {
  const packet = freezeHistoryCandidateProbes(512)
  assert.equal(packet.status, 'unsent')
  assert.equal(packet.probes.length, 15)
  for (let i = 0; i < packet.probes.length; i += 3) {
    const [control, plain, details] = packet.probes.slice(i, i + 3)
    for (const row of [control, plain, details]) {
      assert.equal(row.body.max_tokens, 512)
      assert.equal(
        row.requestSha256,
        createHash('sha256').update(JSON.stringify(row.body)).digest('hex'),
      )
      assert.deepEqual(row.body.messages.slice(0, -2), control.body.messages.slice(0, -2))
      assert.deepEqual(row.body.messages.at(-1), control.body.messages.at(-1))
      assert.deepEqual(row.body.tools, control.body.tools)
      assert.equal(row.sourceSha256, control.sourceSha256)
    }
    // Production mp4-18 meter: plain and details history count identically, above control.
    for (const row of [control, plain, details])
      assert.deepEqual(row.meter, {
        definition: row.model === 'z-ai/glm-5.3-prime' ? '4' : '3',
        implementation: 'mp4-18',
        algorithm:
          row.model === 'z-ai/glm-5.3-prime'
            ? 'prime-public-glm53-declared-effort-route-fit-3'
            : 'flashx-public-glm53-route-fit-2',
      })
    assert.equal(control.candidate.kind, 'estimated')
    assert.equal(plain.candidate.kind, 'estimated')
    assert.ok(plain.candidate.tokens > control.candidate.tokens)
    assert.deepEqual(details.candidate, plain.candidate)
    assert.equal(
      plain.body.messages.at(-2).reasoning,
      details.body.messages.at(-2).reasoning_details[0].text,
    )
  }
  for (const invalid of [0, -1, 1.5, NaN, Infinity])
    assert.throws(() => freezeHistoryCandidateProbes(invalid))
})
