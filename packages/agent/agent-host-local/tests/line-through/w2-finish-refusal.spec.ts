// @module-tag slow
import { expect, it } from 'vitest'
import { intakeAccess, ok } from './world.ts'
import { openW2World, replyText } from './w2-world.ts'

it('waits on Session pending input without replacing the completion candidate', async () => {
  let injected = false
  const handIn = Promise.withResolvers<void>()
  const second = Promise.withResolvers<void>()
  const w = await openW2World({
    reception: 'routed',
    model: a => ({
      parts: [replyText(`reply-${a.index}`, 'recovered answer')],
      reason: 'stop',
      ...(a.index === 1 ? { hold: second.promise } : {}),
    }),
    wrapAgentDependencies: dependencies => ({
      ...dependencies,
      handoff: {
        ...dependencies.handoff,
        async prepare(input) {
          if (input.kind === 'submit' && String(input.request.reference.input) === 'in-2')
            await handIn.promise
          return dependencies.handoff.prepare(input)
        },
      },
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
    const [failedEnd] = w.endedRuns()
    expect(failedEnd).toMatchObject({ outcome: 'failed' })
    if (failedEnd === undefined) throw new Error('the first Run did not end')
    const failed = failedEnd.execution
    expect(ok(await w.probe.readWork(intakeAccess))).toMatchObject({
      awaitingPerson: true,
      pending: ['in-1'],
    })

    await w.accept('in-2', 'another input after the failure')
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

    handIn.resolve()
    await w.until(() => w.modelCalls.length === 2, 10_000)
    const asking = ok(await w.probeLog.load(access))
    expect(asking.checkpoint.inputBatch?.ordered).toEqual(['in-2'])
    second.resolve()
    await w.until(async () => (await w.lastOutcome()) === 'completed', 10_000)
    expect(w.modelCalls).toHaveLength(2)
    const ended = w.endedRuns().at(-1)
    expect(ended?.execution).toBe(active)
    expect(await w.runEnd(ended!.run)).toEqual({ conclusion: 'complete', failure: null })
    expect(ok(await w.probe.readWork(intakeAccess)).pending).toHaveLength(0)
    expect(ok(await w.fresh().load({ ...w.agentAccess, execution: failed })).state.kind).toBe(
      'ended',
    )
  } finally {
    handIn.resolve()
    second.resolve()
    await w.close()
  }
})
