// @module-tag slow
import { expect, it } from 'vitest'
import { intakeAccess, ok } from './world.ts'
import { openW2World, replyText } from './w2-world.ts'

it('waits on Session pending input without replacing the completion candidate', async () => {
  let injected = false
  // The Model call of the recovering Run waits until the second input is in, so that input is
  // pending while that Run settles, however soon Session starts the Run.
  const recovering = Promise.withResolvers<void>()
  const w = await openW2World({
    receptionTargets: 'journal',
    model: a => ({
      parts: [replyText(`reply-${a.index}`, 'recovered answer')],
      reason: 'stop',
      ...(a.index === 0 ? { hold: recovering.promise } : {}),
    }),
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
    // Not `runRound`: it waits for the latest Run of the snapshot to be a terminal, and the
    // recovering Run starts at once and is held here. The failed Run by its identity instead: the
    // commit notice of its end wakes Session, which grants the untaken input again at once (#1248).
    await w.accept('in-1', 'recover this input')
    await w.until(() => w.endedRuns().length > 0, 10_000)
    const failedEnd = w.endedRuns()[0]
    expect(failedEnd).toMatchObject({ outcome: 'failed' })
    if (failedEnd === undefined) throw new Error('the first Run did not end')
    const failed = failedEnd.execution
    // The commit notice of the failed end wakes Session, which grants the untaken input again at
    // once: the recovering Run is in its Model call before the second input goes in.
    await w.until(() => w.modelCalls.length === 1, 10_000)
    await w.accept('in-2', 'another input while the first needs recovery')
    recovering.resolve()
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
    recovering.resolve()
    await w.close()
  }
})
