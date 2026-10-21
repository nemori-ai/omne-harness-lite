// covers: PD-tool-execution S3
// Oracle: product/tool-execution/acceptance.md S3; Tool SPEC 20–23, 26; P04.
import assert from 'node:assert/strict'
import { it } from 'vitest'
import { readToolInvocationRef } from '@omne-harness/tool-contract'
import { assembly, ok } from './fixtures/assembly.ts'

it('S3 publicly excludes an accepted call before driver startup and consumes its unavailable result', async () => {
  const scene = assembly('S3')
  let passed = false
  try {
    scene.observe('invoke-input', scene.request)
    const admitted = await scene.runtime.invoke({ ...scene.access, request: scene.request })
    scene.observe('invoke-reply', admitted)
    assert.equal(admitted.kind, 'accepted')
    if (admitted.kind !== 'accepted') throw new Error('S3 requires accepted invocation')
    assert.equal(admitted.state.phase, 'accepted')
    assert.equal(scene.scheduled.length, 1, 'host queues admission until explicit advance')
    assert.deepEqual(scene.counts, { executor: 0, bindingStart: 0, environmentPrepare: 0 })
    const { call } = readToolInvocationRef(admitted.reference)
    const operation = ok(await scene.identities.operationIdentities.newOperation())
    const reason = 'tool-acceptance coordinator withdrew execution before the first host turn'
    const exclusionInput = { ...scene.access, call, operation, reason }
    scene.observe('authority-exclude-input', exclusionInput)
    const exclusion = await scene.providers.dependencies.authority.exclude(exclusionInput)
    scene.observe('authority-exclude-reply', exclusion)
    const confirmed = ok(exclusion)
    assert.ok(confirmed.digest.length > 0, 'advance requires confirmed exclusion evidence')
    const state = await scene.advanceUntil(
      admitted.reference,
      value => value.phase === 'settled' && value.queue.kind === 'released',
    )
    assert.equal(state.phase, 'settled')
    if (state.phase !== 'settled') throw new Error('S3 requires settled exclusion')
    assert.equal(state.terminal.kind, 'unavailable')
    if (state.terminal.kind !== 'unavailable') throw new Error('S3 requires unavailable terminal')
    assert.equal(state.terminal.reason, reason)
    assert.equal(state.effect.kind, 'not-started', 'unknown is not exclusion')
    assert.equal(state.execution.kind, 'not-started')
    assert.equal(state.queue.kind, 'released')
    assert.equal(state.delivery?.kind, 'pending')
    assert.equal(scene.counts.executor, 0)
    assert.equal(scene.counts.bindingStart, 0)
    const pages = await scene.readAll(admitted.reference, state.result)
    assert.ok(
      pages
        .flatMap(page => page.value.content)
        .some(block => block.kind === 'text' && block.text.includes(reason)),
    )
    await scene.processAndRelease(admitted.reference, state, pages)
    assert.equal(scene.counts.executor, 0)
    await scene.snapshot(admitted.reference)
    passed = true
  } finally {
    await scene.finish(passed)
  }
})
