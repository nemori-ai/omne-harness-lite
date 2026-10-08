// @module-tag slow
// Actual Cordis and durable SQL/SQL journal fixture setup exceeds the fast-tier budget.
import { expect, test, vi } from 'vitest'
import { projectToolJournal } from '@omne-harness-lite/tool-execution-runtime'
import { deliverDeniedAction } from '../src/tool-denial.ts'
import { toolDenialSource } from '../src/tool-denial-source.ts'
import { actionIntegrationFixture } from './tool-action-integration-fixture.ts'
import { scope, origin, toolCall, officialPiece } from './tool-driver-history-fixture.ts'
import { toolBatch } from '../src/tool-batch.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { ExtensionInput } from '@omne-harness-lite/loop-extension'
import { LOOP_EXTENSION_IMPLEMENTATIONS } from '@omne-harness-lite/loop-extension-runner/cordis'

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

test.each(['permission', 'veto'] as const)(
  'actual %s denial retains the recorded reason, reviews each without a result, and confirms one primary return',
  async kind => {
    const vetoName = 'example:deny-action'
    const eachName = 'example:observe-denial'
    const { judgeDefinition } = await import('@omne-harness-lite/loop-extension')
    const each = judgeDefinition({
      name: eachName,
      position: 'after_action',
      dimension: { scope: 'each' },
      power: 'observe',
      implementation: { kind: 'builtin', builtinName: eachName },
    })
    if (!('ok' in each)) throw new Error('invalid denial observer fixture')
    const executor = vi.fn(async () => 'must not execute')
    const f = await actionIntegrationFixture({
      executor,
      permission: kind === 'permission' ? 'forbid' : 'auto',
      pieces: [
        ...(kind === 'veto' ? [officialPiece(vetoName)] : []),
        officialPiece(),
        { definition: each.ok, power: 'observe' },
      ],
    })
    const veto = vi.fn(async () => ({
      kind: 'output' as const,
      value: { kind: 'veto' as const, reason: 'actual extension veto' },
    }))
    const observe = vi.fn(async (input: ExtensionInput) => {
      expect(input.position).toBe('after_action')
      expect(input.subject).toEqual({ callId: 'call', outcome: 'denied' })
      expect(input.subject).not.toHaveProperty('result')
      return { kind: 'output' as const, value: { kind: 'observed' as const } }
    })
    const contribution = f.current.assembly.ctx.plugin({
      name: 'denial-contributions-fixture',
      inject: [LOOP_EXTENSION_IMPLEMENTATIONS],
      apply(ctx: Context) {
        if (kind === 'veto') ctx.loopExtensionImplementations.registerBuiltin(vetoName, veto)
        ctx.loopExtensionImplementations.registerBuiltin(eachName, observe)
      },
    })
    try {
      const dispatched = await f.dispatch()
      expect(dispatched).toMatchObject({ kind: 'complete', admissions: [] })
      if (kind === 'permission') expect(f.current.forPass).toHaveBeenCalled()
      else expect(f.current.forPass).not.toHaveBeenCalled()
      const before = await f.current.journal.read()
      if ('unavailable' in before) throw new Error('actual denied decision unavailable')
      const facts = before.calls.get('call')!
      if (facts.batch.kind !== 'complete') throw new Error('actual batch incomplete')
      const decision = facts.batch.completion.items[0]!.decision
      expect(decision).toMatchObject({
        kind: 'denied',
        reason:
          kind === 'permission'
            ? { kind: 'admission', code: 'permission_forbidden' }
            : { kind: 'extension_veto', by: vetoName, explanation: 'actual extension veto' },
      })
      expect(toolBatch(before, origin)).toBeUndefined()
      const input = {
        journal: f.current.journal,
        runner: f.current.runner,
        callId: 'call',
        signal: new AbortController().signal,
      }
      expect(await deliverDeniedAction(input)).toEqual({ kind: 'confirmed' })
      const committed = await f.f.prefix()
      expect(await deliverDeniedAction(input)).toEqual({ kind: 'confirmed' })
      expect((await f.f.prefix()).tail).toEqual(committed.tail)
      const history = await f.current.journal.read()
      if ('unavailable' in history) throw new Error('actual denial history unavailable')
      const projected = projectToolJournal(scope, history.prefix.entries)
      if ('invalid' in projected) throw new Error('invalid actual execution journal')
      expect(projected.executions.size).toBe(0)
      expect(executor).not.toHaveBeenCalled()
      expect(observe).toHaveBeenCalledTimes(1)
      if (kind === 'veto') expect(veto).toHaveBeenCalledTimes(1)
      const source = toolDenialSource(history, 'call')!
      if (decision.kind !== 'denied') throw new Error('actual denial not recorded')
      expect(source.message.blocks[0]).toMatchObject({ outcome: 'denied', reason: decision.reason })
      expect(
        history.models.entries.filter(entry => entry.captured.message?.type === 'tool'),
      ).toHaveLength(1)
      expect(toolBatch(history, origin)?.subject.outcomes).toEqual([
        { callId: 'call', outcome: 'denied' },
      ])
      const confirmations = f.current.append.mock.calls.filter(([, entries]) =>
        entries.some(entry => entry.dedupeKey?.includes('["denied",')),
      )
      expect(confirmations).toHaveLength(1)
      expect(confirmations[0]![1]).toHaveLength(2)
    } finally {
      await contribution.dispose()
      await f.close()
    }
  },
)
