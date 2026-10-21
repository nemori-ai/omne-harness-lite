// covers: PD-tool-execution S2
// Oracle: product/tool-execution/acceptance.md S2; Tool SPEC 12 and 16.
import assert from 'node:assert/strict'
import { it } from 'vitest'
import { assembly } from './fixtures/assembly.ts'

it('S2 accepts complete strict-JSON failure as a readable logical terminal without startup', async () => {
  const scene = assembly('S2')
  let passed = false
  try {
    // A complete duplicate-key document fails strict JSON parsing, not the request shape.
    const duplicate = '{"manifest":"daily","manifest":"weekly"}'
    const request = {
      ...scene.request,
      arguments: { original: duplicate, effective: duplicate, complete: true },
    }
    scene.observe('invoke-input', request)
    const admitted = await scene.runtime.invoke({ ...scene.access, request })
    scene.observe('invoke-reply', admitted)
    assert.equal(admitted.kind, 'accepted', 'a rejected malformed request does not satisfy S2')
    if (admitted.kind !== 'accepted') throw new Error('S2 requires accepted logical terminal')
    const state = await scene.state(admitted.reference)
    assert.equal(state.phase, 'settled')
    if (state.phase !== 'settled') throw new Error('S2 requires settled logical result')
    assert.equal(state.terminal.kind, 'failed')
    if (state.terminal.kind !== 'failed') throw new Error('S2 requires arguments failure')
    assert.equal(state.terminal.cause, 'arguments')
    assert.match(state.terminal.diagnostic, /duplicate-key/u)
    assert.equal(state.effect.kind, 'not-started')
    assert.equal(state.execution.kind, 'not-started')
    assert.equal(state.queue.kind, 'none')
    assert.equal(state.delivery?.kind, 'pending')
    assert.deepEqual(scene.counts, { executor: 0, bindingStart: 0, environmentPrepare: 0 })
    assert.equal(scene.scheduled.length, 0)
    const pages = await scene.readAll(admitted.reference, state.result)
    assert.match(
      pages
        .flatMap(page => page.value.content)
        .map(block => (block.kind === 'text' ? block.text : ''))
        .join(''),
      /duplicate-key/u,
    )
    await scene.processAndRelease(admitted.reference, state, pages)
    assert.deepEqual(scene.counts, { executor: 0, bindingStart: 0, environmentPrepare: 0 })
    await scene.snapshot(admitted.reference)
    passed = true
  } finally {
    await scene.finish(passed)
  }
})
