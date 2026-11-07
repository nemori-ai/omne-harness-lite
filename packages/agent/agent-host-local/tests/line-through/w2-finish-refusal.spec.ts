// @module-tag slow
import { expect, it } from 'vitest'
import { intakeAccess, ok } from './world.ts'
import { openW2World, replyText } from './w2-world.ts'

it('waits on Session pending input without replacing the completion candidate', async () => {
  let injected = false
  const w = await openW2World({
    receptionTargets: 'journal',
    model: a => ({ parts: [replyText(`reply-${a.index}`, 'recovered answer')], reason: 'stop' }),
    wrapAgentDependencies: dependencies => ({
      ...dependencies,
      conditions: {
        read(input) {
          if (!injected) {
            injected = true
            throw new Error('fail before taking the original input')
          }
          return dependencies.conditions.read(input)
        },
      },
    }),
  })
  try {
    await w.createSession('finish-refusal')
    await w.runRound(1, 'recover this input', 10_000)
    expect(await w.lastOutcome()).toBe('failed')
    const failed = await w.execution()
    await w.accept('in-2', 'another input while the first needs recovery')
    await w.until(() => w.modelCalls.length === 1 && w.releases() === 3, 10_000)
    const active = await w.execution()
    expect(active).not.toBe(failed)
    const access = { ...w.agentAccess, execution: active }
    await w.until(async () => {
      const read = await w.fresh().load(access)
      return 'ok' in read && read.ok.state.kind === 'settling' && w.clock.pending().length > 0
    }, 10_000)
    const snapshot = ok(await w.fresh().load(access))
    expect(snapshot.settlement.candidates).toHaveLength(1)
    expect(snapshot.settlement.candidate?.conclusion.kind).toBe('complete')
    expect(snapshot.checkpoint.inputBatch?.ordered).toEqual(['in-1'])
    const work = ok(await w.probe.readWork(intakeAccess))
    expect(work.run.kind).toBe('active')
    expect(work.pending).toContain('in-2')
    expect(work.handed).not.toContain('in-2')
    expect(w.modelCalls).toHaveLength(1)
    expect(ok(await w.fresh().load({ ...w.agentAccess, execution: failed })).state.kind).toBe(
      'ended',
    )
  } finally {
    await w.close()
  }
})
