// @module-tag slow
// Actual Cordis and durable SQL/JSONL fixture setup exceeds the fast-tier budget.
import { expect, test, vi } from 'vitest'
import { projectToolJournal } from '@omne-harness-lite/tool-execution-runtime'
import { deliverDeniedAction } from '../src/tool-denial.ts'
import { toolDenialSource } from '../src/tool-denial-source.ts'
import { actionIntegrationFixture } from './tool-action-integration-fixture.ts'
import { scope, origin, toolCall } from './tool-driver-history-fixture.ts'
import { toolBatch } from '../src/tool-batch.ts'

test('missing official returns every denial through the actual message protocol without executing, and retries keep one primary return', async () => {
  const executor = vi.fn(async () => 'must not execute')
  const f = await actionIntegrationFixture({
    official: false,
    executor,
    calls: [toolCall('a'), toolCall('b', true)],
  })
  try {
    expect(await f.dispatch()).toMatchObject({ kind: 'complete', admissions: [] })
    for (const call of f.f.calls) {
      const input = {
        journal: f.current.journal,
        runner: f.current.runner,
        callId: call.callId,
        signal: new AbortController().signal,
      }
      const delivered = await deliverDeniedAction(input)
      expect(delivered).toEqual({ kind: 'confirmed' })
      const prefix = await f.f.prefix()
      expect(await deliverDeniedAction(input)).toEqual({ kind: 'confirmed' })
      expect((await f.f.prefix()).tail).toEqual(prefix.tail)
      expect(
        await f.current.assembly.ctx.toolRuntimeRegistry.submit({
          access: f.current.toolAccess,
          scope,
          origin,
          adoption: f.f.adoption,
          call,
        }),
      ).toMatchObject({ kind: 'rejected' })
    }
    const history = await f.current.journal.read()
    if ('unavailable' in history) throw new Error('common history unavailable')
    const projected = projectToolJournal(scope, history.prefix.entries)
    if ('invalid' in projected) throw new Error('tool history invalid')
    expect(projected.executions.size).toBe(0)
    expect(executor).not.toHaveBeenCalled()
    expect(
      history.models.entries.filter(entry => entry.captured.message?.type === 'tool'),
    ).toHaveLength(2)
    expect(toolBatch(history, origin)?.subject.outcomes).toEqual([
      { callId: 'a', outcome: 'denied' },
      { callId: 'b', outcome: 'denied' },
    ])
    const source = toolDenialSource(history, 'a')!
    expect(source.subject).toEqual({ callId: 'a', outcome: 'denied' })
    expect(source.message.blocks[0]).toMatchObject({
      outcome: 'denied',
      reason: { kind: 'admission_unavailable' },
    })
    const confirmations = f.current.append.mock.calls.filter(([, entries]) =>
      entries.some(entry => entry.dedupeKey?.includes('["denied",')),
    )
    expect(confirmations).toHaveLength(2)
    expect(confirmations.every(([, entries]) => entries.length === 2)).toBe(true)
  } finally {
    await f.close()
  }
})

test('a lost denial-confirmation receipt is recognized from the original complete message batch', async () => {
  const executor = vi.fn(async () => 'must not execute')
  const f = await actionIntegrationFixture({ official: false, executor })
  try {
    expect(await f.dispatch()).toMatchObject({ kind: 'complete' })
    const append = f.current.append,
      original = append.getMockImplementation()!
    let lost = false
    append.mockImplementation(async (...args) => {
      const reply = await original(...args)
      if (!lost && args[1].some(entry => entry.dedupeKey?.includes('["denied",'))) {
        lost = true
        return { failure: 'unavailable' as const }
      }
      return reply
    })
    const input = {
      journal: f.current.journal,
      runner: f.current.runner,
      callId: 'call',
      signal: new AbortController().signal,
    }
    expect(await deliverDeniedAction(input)).toEqual({ kind: 'rejected', reason: 'unavailable' })
    const committed = await f.f.prefix()
    expect(await deliverDeniedAction(input)).toEqual({ kind: 'confirmed' })
    expect((await f.f.prefix()).tail).toEqual(committed.tail)
    const history = await f.current.journal.read()
    if ('unavailable' in history) throw new Error('denial receipt not recognized')
    expect(
      history.models.entries.filter(entry => entry.captured.message?.type === 'tool'),
    ).toHaveLength(1)
    expect(executor).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})
