// @module-tag slow
import { expect, it } from 'vitest'
import type { ModelInvocationRef } from '@omne-harness/model-contract'
import { ok } from './world.ts'
import { openW2World, replyText } from './w2-world.ts'

const LOCK = { owner: 'test-host', record: 'state-lock', revision: '1', digest: 'sha256:lock' }

it('closes a main call the Model lost in the Session log Journal, and a new call completes the Run', async () => {
  const hold = Promise.withResolvers<void>()
  let lost: ModelInvocationRef | 'next' | null = null
  const w = await openW2World({
    modelRetry: { maxAttempts: 3, maxElapsedMs: 60_000, delaysMs: [0], jitter: 0 },
    model: a =>
      a.index === 0
        ? { parts: [replyText('late', 'the late reply')], reason: 'stop', hold: hold.promise }
        : { parts: [replyText(`reply-${a.index}`, 'the second reply')], reason: 'stop' },
    wrapAgentDependencies: dependencies => ({
      ...dependencies,
      models: {
        ...dependencies.models,
        calls: {
          ...dependencies.models.calls,
          contact(input) {
            if (lost === 'next') lost = input.reference
            return lost === input.reference
              ? Promise.resolve({ ok: { kind: 'lost' as const, evidence: LOCK } })
              : dependencies.models.calls.contact(input)
          },
        },
      },
    }),
  })
  try {
    await w.createSession('lost-call')
    await w.accept('in-1', 'the first input')
    await w.until(() => w.modelCalls.length === 1 && w.clock.pending().length > 0, 10_000)
    const first = await w.execution()
    const access = { ...w.agentAccess, execution: first }
    await w.until(async () => {
      const read = await w.fresh().load(access)
      return 'ok' in read && read.ok.state.kind === 'waiting'
    }, 10_000)

    lost = 'next'
    const due = [...w.clock.pending()].sort()[0]
    if (due === undefined) throw new Error('the wait armed no check time')
    w.clock.advanceTo(due)
    await w.until(() => w.modelCalls.length === 2, 10_000)
    expect(w.modelCalls[1]).not.toBe(w.modelCalls[0])

    await w.until(async () => (await w.lastOutcome()) !== null, 20_000)
    expect(await w.lastOutcome()).toBe('completed')
    const ended = ok(await w.fresh().load(access))
    expect(ended.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    expect(ended.checkpoint.voided).toEqual([
      expect.objectContaining({
        step: 'step-1',
        reference: lost,
        basis: expect.objectContaining({ record: `${first}/step-1/lost/0` }),
      }),
    ])
    expect(ended.checkpoint.modelRetry ?? null).toBeNull()
    expect(w.modelCalls).toHaveLength(2)
    expect(w.endedRuns()).toHaveLength(1)
  } finally {
    hold.resolve()
    await w.close()
  }
})
