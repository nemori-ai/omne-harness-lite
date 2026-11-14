import { describe, expect, it } from 'vitest'
import type { StepId } from '@omne-harness/agent-contract'
import { evidence, execution, ok } from './journal-support.ts'
import { eventually } from './loop-support.ts'
import {
  assistantTexts,
  at,
  causeRecord,
  contactAnswer,
  failed,
  lostContact,
  policy,
  replyOf,
  saved,
  START,
  takeover,
  type Takeover,
} from './loop-takeover-support.ts'

async function inFlight(run: Takeover) {
  const first = run.coordinator()
  ok(await first.accept())
  ok(await first.runExecution())
  const parked = await saved(run.assembly)
  expect(parked.state).toMatchObject({ kind: 'waiting', waits: [{ kind: 'producer' }] })
  expect(parked.checkpoint.position).toBe('M6')
  return parked
}

describe('takeover of a main Model call whose result is not in the Journal', () => {
  it.each(['holding', 'settled'] as const)(
    'the Model answers %s: asks once, keeps the call and its identity, and waits for the result',
    async answer => {
      const run = await takeover([null])
      const parked = await inFlight(run)
      const contact = run.assembly.controls.modelContact
      contact.always(contactAnswer(answer))
      const next = await run.rebuild()
      ok(await next.runExecution())
      const after = await saved(run.assembly)
      expect(contact.calls.map(call => call.reference)).toEqual(
        parked.checkpoint.calls.map(call => call.kind === 'model' && call.reference),
      )
      expect(after.state).toMatchObject({ kind: 'waiting', waits: [{ kind: 'producer' }] })
      expect(after.checkpoint.calls).toEqual(parked.checkpoint.calls)
      expect(after.checkpoint.modelRetry ?? null).toBeNull()
      expect(after.checkpoint.voided).toEqual([])
      expect(run.admitted).toHaveLength(1)
      ok(await next.runExecution())
      expect(contact.calls).toHaveLength(1)

      await run.settle(0, replyOf('the held reply'))
      ok(await next.runExecution())
      expect((await saved(run.assembly)).state).toMatchObject({
        kind: 'ended',
        conclusion: { kind: 'complete' },
      })
      expect(await assistantTexts(run.assembly)).toEqual(['the held reply'])
      expect(run.admitted).toHaveLength(1)
    },
  )

  it('the result is already in the Journal: the Model is not asked', async () => {
    const run = await takeover([null])
    await inFlight(run)
    await run.settle(0, replyOf('the saved reply'))
    run.assembly.controls.modelContact.always(lostContact)
    const next = await run.rebuild()
    ok(await next.runExecution())
    expect(run.assembly.controls.modelContact.calls).toEqual([])
    expect(await assistantTexts(run.assembly)).toEqual(['the saved reply'])
    expect((await saved(run.assembly)).checkpoint.modelRetry ?? null).toBeNull()
  })

  it('the Model answers lost: one transient failure in the same commit that closes the call', async () => {
    const run = await takeover([null, replyOf('the second reply')])
    const [open] = (await inFlight(run)).checkpoint.calls
    run.assembly.controls.modelContact.always(lostContact)
    const next = await run.rebuild()
    ok(await next.runExecution())
    const after = await saved(run.assembly)
    expect(after.checkpoint).toMatchObject({
      position: 'I8',
      calls: [],
      modelRetry: { failures: 1, since: START, notBefore: at(1) },
    })
    expect(after.state).toEqual({
      kind: 'waiting',
      waits: [{ kind: 'dependency', owner: 'modelRetry', position: 'I8' }],
    })
    expect(after.checkpoint.voided).toEqual([
      {
        kind: 'model',
        step: 'step-1',
        action: open?.action,
        reference: open?.kind === 'model' ? open.reference : null,
        cause: 'lost',
        basis: evidence('state-lock'),
      },
    ])
    expect(after.settlement.candidate).toBeNull()
    expect(run.retrying).toEqual([
      [
        'step-1' as StepId,
        {
          attempt: 2,
          fault: { cause: 'runtime-lost', diagnostic: 'lost-contact', upstreamStatus: null },
          notBefore: at(1),
        },
      ],
    ])
    expect(run.admitted).toHaveLength(1)
  })

  it('after a lost call the next request has a new call identity and completes the run', async () => {
    const run = await takeover([null, replyOf('the second reply')])
    await inFlight(run)
    run.assembly.controls.modelContact.once(lostContact)
    const next = await run.rebuild()
    ok(await next.runExecution())
    run.assembly.controls.clock.advanceTo(at(1))
    ok(await next.runExecution())
    expect(run.admitted).toHaveLength(2)
    expect(run.admitted[1]?.call).not.toBe(run.admitted[0]?.call)
    const after = await saved(run.assembly)
    expect(after.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    expect(after.checkpoint.modelRetry).toBeNull()
    expect(await assistantTexts(run.assembly)).toEqual(['the second reply'])
  })

  it('a lost call counts on top of the failures the checkpoint already holds', async () => {
    const run = await takeover([failed(), null, replyOf('unused')], policy({ maxAttempts: 3 }))
    const first = run.coordinator()
    ok(await first.accept())
    ok(await first.runExecution())
    expect((await saved(run.assembly)).checkpoint.modelRetry).toMatchObject({ failures: 1 })
    run.assembly.controls.clock.advanceTo(at(1))
    ok(await first.runExecution())
    expect(run.admitted).toHaveLength(2)
    run.assembly.controls.modelContact.always(lostContact)
    const next = await run.rebuild()
    ok(await next.runExecution())
    expect((await saved(run.assembly)).checkpoint).toMatchObject({
      calls: [],
      modelRetry: { failures: 2, since: START },
    })
    expect(run.admitted).toHaveLength(2)
  })

  it('a lost call that uses up the budget fails the run with the lost-contact cause', async () => {
    const run = await takeover([failed(), null, replyOf('unused')], policy({ maxAttempts: 2 }))
    const first = run.coordinator()
    ok(await first.accept())
    ok(await first.runExecution())
    run.assembly.controls.clock.advanceTo(at(1))
    ok(await first.runExecution())
    run.assembly.controls.modelContact.always(lostContact)
    const next = await run.rebuild()
    ok(await next.runExecution())
    expect(await causeRecord(run.assembly)).toBe(
      `${execution()}/step-2/model-failed/runtime-lost/lost-contact`,
    )
    const after = await saved(run.assembly)
    expect(after.checkpoint.calls).toEqual([])
    expect(run.admitted).toHaveLength(2)
    expect(await assistantTexts(run.assembly)).toEqual([])
  })

  it('a result of the lost call that arrives late changes nothing', async () => {
    const run = await takeover([null, replyOf('the second reply')])
    await inFlight(run)
    run.assembly.controls.modelContact.once(lostContact)
    const next = await run.rebuild()
    ok(await next.runExecution())
    const recorded = (await saved(run.assembly)).checkpoint

    await run.settle(0, replyOf('the late reply'))
    await eventually(
      async () =>
        (await saved(run.assembly)).entries?.some(entry => entry.kind === 'received') === true,
    )
    ok(await next.runExecution())
    const late = await saved(run.assembly)
    expect(late.checkpoint).toMatchObject({
      position: 'I8',
      calls: [],
      modelRetry: recorded.modelRetry,
      step: recorded.step,
    })
    expect(run.admitted).toHaveLength(1)
    expect(await assistantTexts(run.assembly)).toEqual([])

    run.assembly.controls.clock.advanceTo(at(1))
    ok(await next.runExecution())
    expect((await saved(run.assembly)).state).toMatchObject({
      kind: 'ended',
      conclusion: { kind: 'complete' },
    })
    expect(await assistantTexts(run.assembly)).toEqual(['the second reply'])
    expect(run.admitted).toHaveLength(2)
  })

  it('the Model answers unknown: waits, sends nothing, and asks again on the next pass', async () => {
    const run = await takeover([null])
    const parked = await inFlight(run)
    const contact = run.assembly.controls.modelContact
    contact.always(contactAnswer('unknown'))
    const next = await run.rebuild()
    ok(await next.runExecution())
    const after = await saved(run.assembly)
    expect(contact.calls).toHaveLength(1)
    expect(after.state).toMatchObject({ kind: 'waiting', waits: [{ kind: 'producer' }] })
    expect(after.checkpoint.calls).toEqual(parked.checkpoint.calls)
    expect(after.checkpoint.modelRetry ?? null).toBeNull()
    expect(after.checkpoint.voided).toEqual([])
    expect(run.admitted).toHaveLength(1)
    ok(await next.runExecution())
    expect(contact.calls).toHaveLength(2)
    expect(run.admitted).toHaveLength(1)
  })

  it('a takeover that is interrupted before the failure is saved asks again and counts once', async () => {
    const run = await takeover([null, replyOf('the second reply')])
    await inFlight(run)
    run.assembly.controls.modelContact.always(contactAnswer('unknown'))
    const interrupted = await run.rebuild()
    ok(await interrupted.runExecution())
    run.assembly.controls.modelContact.always(lostContact)
    const next = await run.rebuild()
    ok(await next.runExecution())
    expect((await saved(run.assembly)).checkpoint).toMatchObject({
      calls: [],
      modelRetry: { failures: 1 },
    })
  })
})
