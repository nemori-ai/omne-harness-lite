import { describe, expect, it } from 'vitest'
import { decodeModelOperationId, decodeRevision } from '@omne-harness/model-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { createExecutionCoordinator } from '../src/loop/coordinator.ts'
import { acceptedInput, evidence, execution, ok, operation } from './journal-support.ts'
import { alice, eventually, loopAssembly } from './loop-support.ts'
import {
  assistantTexts,
  causeRecord,
  contactAnswer,
  failed,
  lostContact,
  replyOf,
  resumeEntry,
  saved,
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
  })

  it('the Model answers lost: the intent is voided in the commit that closes the call, and a new call goes out at once', async () => {
    const run = await takeover([null, null], d => d, {
      jointCommits: ['message', 'context-transition', 'custody', 'processed'],
    })
    const [open] = (await inFlight(run)).checkpoint.calls
    run.assembly.controls.modelContact.once(lostContact)
    const next = await run.rebuild()
    ok(await next.runExecution())
    const after = await saved(run.assembly)
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
    expect(after.checkpoint.step).toBe('step-2')
    expect(after.checkpoint.calls).toHaveLength(1)
    expect(after.checkpoint.calls[0]).not.toEqual(open)
    expect(after.state).toMatchObject({ kind: 'waiting', waits: [{ kind: 'producer' }] })
    expect(Object.hasOwn(after.checkpoint, 'modelRetry')).toBe(false)
    expect(after.settlement.candidate).toBeNull()
    expect(run.admitted).toHaveLength(2)
    expect(run.admitted[1]?.call).not.toBe(run.admitted[0]?.call)
    expect(run.assembly.controls.clock.pending()).toEqual([])
    // No result of a lost call ever entered custody, so closing it claims no processing.
    expect(run.assembly.controls.journal.joint().map(item => item.caller?.kind)).not.toContain(
      'processed',
    )
  })

  it('the Model answers lost: M3 produces no producer event, since no result is handed over', async () => {
    const run = await takeover([null, null])
    await inFlight(run)
    run.assembly.controls.modelContact.always(lostContact)
    const next = await run.rebuild()
    ok(await next.runExecution())
    const page = ok(
      await run.assembly.dependencies.journal.output.read({
        ...alice,
        execution: execution(),
        after: null,
        limit: 100,
      }),
    )
    if (page.kind !== 'page') throw new Error('a gap in a new execution')
    expect(page.events.map(event => event.body.kind)).not.toContain('producer')
    expect((await saved(run.assembly)).checkpoint.voided).toHaveLength(1)
  })

  it('the received results cannot be read when the Model is to be asked: M6 waits on the Journal and does not take the call as accepted', async () => {
    let broken = false
    const run = await takeover([null], d => ({
      ...d,
      entries: {
        ...d.entries,
        receivedOf: input =>
          broken
            ? Promise.resolve(
                fail({
                  kind: 'unavailable',
                  owner: 'agentJournal',
                  diagnostic: 'the Journal is down',
                }),
              )
            : d.entries.receivedOf(input),
      },
    }))
    await inFlight(run)
    const contact = run.assembly.controls.modelContact
    contact.always(contactAnswer('holding'))
    const next = await run.rebuild()
    broken = true
    ok(await next.runExecution())
    expect((await saved(run.assembly)).state).toEqual({
      kind: 'waiting',
      waits: [{ kind: 'dependency', owner: 'agentJournal', position: 'M6' }],
    })
    expect(contact.calls).toEqual([])
    broken = false
    ok(await next.runExecution())
    expect(contact.calls).toHaveLength(1)
    expect((await saved(run.assembly)).state).toMatchObject({
      kind: 'waiting',
      waits: [{ kind: 'producer' }],
    })
    expect(run.admitted).toHaveLength(1)
  })

  it('after a lost call the next request has a new call identity and completes the run', async () => {
    const run = await takeover([null, replyOf('the second reply')])
    await inFlight(run)
    run.assembly.controls.modelContact.once(lostContact)
    const next = await run.rebuild()
    ok(await next.runExecution())
    expect(run.admitted).toHaveLength(2)
    expect(run.admitted[1]?.call).not.toBe(run.admitted[0]?.call)
    const after = await saved(run.assembly)
    expect(after.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    expect(await assistantTexts(run.assembly)).toEqual(['the second reply'])
  })

  it('consecutive lost calls each take one step, and the step limit ends the run', async () => {
    const run = await takeover([null, null, replyOf('unused')], d => d, { maxRunSteps: 2 })
    await inFlight(run)
    run.assembly.controls.modelContact.always(lostContact)
    ok(await (await run.rebuild()).runExecution())
    expect(run.admitted).toHaveLength(2)
    expect((await saved(run.assembly)).checkpoint.step).toBe('step-2')

    ok(await (await run.rebuild()).runExecution())
    expect(run.admitted).toHaveLength(2)
    expect(await causeRecord(run.assembly)).toBe(`${execution()}/step-2/guard`)
    expect((await saved(run.assembly)).checkpoint.voided.map(item => item.step)).toEqual([
      'step-1',
      'step-2',
    ])
  })

  it('a call that settles as failed after a lost one fails the run with the cause of that failure', async () => {
    const run = await takeover([null, failed(), replyOf('unused')])
    await inFlight(run)
    run.assembly.controls.modelContact.once(lostContact)
    ok(await (await run.rebuild()).runExecution())
    expect(run.admitted).toHaveLength(2)
    expect(await causeRecord(run.assembly)).toMatch(
      new RegExp(`^${execution()}/step-2/model-failed/`, 'u'),
    )
    expect(await assistantTexts(run.assembly)).toEqual([])
  })

  it('a result of the lost call that arrives late changes nothing', async () => {
    const run = await takeover([null, null])
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
    expect(late.checkpoint).toMatchObject({ calls: recorded.calls, step: recorded.step })
    expect(run.admitted).toHaveLength(2)
    expect(await assistantTexts(run.assembly)).toEqual([])

    await run.settle(1, replyOf('the second reply'))
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
    expect(after.checkpoint.voided).toEqual([])
    expect(run.admitted).toHaveLength(1)
    ok(await next.runExecution())
    expect(contact.calls).toHaveLength(2)
    expect(run.admitted).toHaveLength(1)
  })

  it('a takeover that is interrupted before the lost call is closed asks again and voids the intent once', async () => {
    const run = await takeover([null, null])
    await inFlight(run)
    run.assembly.controls.modelContact.always(contactAnswer('unknown'))
    const interrupted = await run.rebuild()
    ok(await interrupted.runExecution())
    run.assembly.controls.modelContact.once(lostContact)
    const next = await run.rebuild()
    ok(await next.runExecution())
    expect((await saved(run.assembly)).checkpoint.voided).toHaveLength(1)
    expect(run.admitted).toHaveLength(2)
  })
})

describe('a not-accepted answer that names another admission', () => {
  it('an admission conflict whose inspection answers not-accepted for another admission: M6 fails as a defect and voids nothing', async () => {
    let admits = 0
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      models: {
        ...d.models,
        calls: {
          ...d.models.calls,
          admit: async input =>
            (admits += 1) > 1
              ? fail({ kind: 'unavailable', dependency: 'model-host', diagnostic: 'not mounted' })
              : fail({
                  kind: 'conflict',
                  operation: input.operation,
                  revision: ok(decodeRevision('1')),
                }),
          inspect: async () =>
            succeed({
              kind: 'not-accepted' as const,
              operation: ok(decodeModelOperationId('mop_another')),
            }),
        },
      },
    }))
    const coordinator = createExecutionCoordinator({
      ...resumeEntry(assembly.dependencies),
      operation: operation('invoke-exec-1'),
      initial: acceptedInput('input-exec-1', 'hello exec-1'),
      grant: null,
    })
    ok(await coordinator.accept())
    ok(await coordinator.runExecution())
    expect(admits).toBe(1)
    const after = await saved(assembly)
    expect(after.checkpoint.voided).toEqual([])
    expect(after.state).toMatchObject({
      kind: 'settling',
      intent: {
        conclusion: { kind: 'fail' },
        failure: { kind: 'node-failed', node: 'M6', category: 'invariant' },
      },
    })
  })
})
