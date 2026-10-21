// covers: PD-tool-execution S1
// Oracle: product/tool-execution/acceptance.md S1; Tool SPEC 16, 20–26.
import assert from 'node:assert/strict'
import { it } from 'vitest'
import { assembly, expectedParagraphs } from './fixtures/assembly.ts'

it('S1 executes once, reads every original page, processes and releases its delivery', async () => {
  const scene = assembly('S1')
  let passed = false
  try {
    scene.observe('invoke-input', scene.request)
    const admitted = await scene.runtime.invoke({ ...scene.access, request: scene.request })
    scene.observe('invoke-reply', admitted)
    assert.equal(admitted.kind, 'accepted')
    if (admitted.kind !== 'accepted') throw new Error('S1 requires accepted invocation')
    assert.equal(admitted.state.phase, 'accepted')
    assert.equal(scene.counts.executor, 0, 'schedule must not execute inline')
    const state = await scene.advanceUntil(
      admitted.reference,
      value => value.phase === 'settled' && value.queue.kind === 'released',
    )
    assert.equal(state.phase, 'settled')
    if (state.phase !== 'settled') throw new Error('S1 requires settled result')
    assert.equal(state.terminal.kind, 'completed')
    assert.equal(state.execution.kind, 'ended')
    assert.equal(state.delivery?.kind, 'pending')
    assert.equal(scene.counts.executor, 1)
    assert.equal(scene.counts.bindingStart, 1)
    assert.equal(scene.counts.environmentPrepare, 1)
    const pages = await scene.readAll(admitted.reference, state.result)
    assert.ok(pages.length >= 2, 'S1 must exercise public pagination')
    const paragraphs = pages
      .flatMap(page => page.value.content)
      .map(block => {
        assert.equal(block.kind, 'text')
        if (block.kind !== 'text') throw new Error('S1 expects full text blocks')
        return block.text
      })
    assert.deepEqual(
      paragraphs,
      expectedParagraphs,
      'public pages preserve the complete authored order',
    )
    const records = await scene.snapshot(admitted.reference)
    assert.equal(records.kind, 'complete')
    if (records.kind !== 'complete') throw new Error('S1 requires real ledger records')
    assert.ok(
      records.records.some(record => record.kind === 'fact-event'),
      'real ledger must retain original source facts',
    )
    const savedResult = records.records.find(record => record.kind === 'result')
    assert.ok(savedResult?.kind === 'result', 'real ledger must retain the result')
    assert.equal(
      savedResult.result.custody.kind,
      'execution',
      'synthetic output does not prove execution custody',
    )
    const savedFinal = records.records.find(
      record => record.kind === 'fact-event' && record.fact.fact.kind === 'final',
    )
    assert.ok(savedFinal?.kind === 'fact-event' && savedFinal.fact.fact.kind === 'final')
    assert.deepEqual(
      savedFinal.fact.fact.result.content,
      pages.flatMap(page => page.value.content),
    )
    assert.ok(savedResult.result.custody.kind === 'execution')
    assert.deepEqual(savedResult.result.custody.raw, savedFinal.fact.fact.raw)
    assert.ok(savedResult.result.custody.retained.digest.length > 0)
    assert.ok(
      records.records.some(record => record.kind === 'task' && record.task.kind === 'deliver'),
    )
    assert.ok(
      !records.records.some(record => record.kind === 'task' && record.task.kind === 'queue'),
    )
    await scene.processAndRelease(admitted.reference, state, pages)
    assert.equal(
      scene.counts.executor,
      1,
      'reading and releasing must not repeat the original executor',
    )
    await scene.snapshot(admitted.reference)
    passed = true
  } finally {
    await scene.finish(passed)
  }
})
