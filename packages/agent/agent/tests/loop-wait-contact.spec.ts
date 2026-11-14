import { describe, expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import { reconciliationPacer } from '../src/loop/reconciliation.ts'
import { ok } from './journal-support.ts'
import { eventually } from './loop-support.ts'
import {
  assistantTexts,
  at,
  contactAnswer,
  lostContact,
  policy,
  replyOf,
  saved,
  takeover,
  type Takeover,
} from './loop-takeover-support.ts'

async function waitingOnModel(run: Takeover, delaysMs: readonly number[] = [1000, 2000, 5000]) {
  const coordinator = run.coordinator()
  ok(await coordinator.accept())
  ok(await coordinator.runExecution())
  const controller = new AbortController()
  const waiting = coordinator.waitForWake({
    pacer: reconciliationPacer(delaysMs),
    signal: controller.signal,
  })
  const clock = run.assembly.controls.clock
  await eventually(async () => clock.pending().length === 1)
  return { coordinator, controller, waiting, clock, contact: run.assembly.controls.modelContact }
}

describe('the check time of a wait for the main Model call', () => {
  it('a call that was just sent is waited for without the question', async () => {
    const run = await takeover([null])
    const { contact, controller, waiting } = await waitingOnModel(run)
    expect(contact.calls).toEqual([])
    controller.abort()
    expect(ok(await waiting)).toBe('cancelled')
    expect(contact.calls).toEqual([])
  })

  it('asks the Model; while it holds the call the wait goes on without a read, by the delay sequence', async () => {
    const run = await takeover([null])
    const { clock, contact, controller, waiting } = await waitingOnModel(run)
    contact.always(contactAnswer('holding'))
    const before = { ...run.counts }
    const position = (await saved(run.assembly)).revision
    expect(clock.pending()).toEqual([at(1)])
    clock.advanceTo(at(1))
    await eventually(async () => clock.pending()[0] === at(3))
    clock.advanceTo(at(3))
    await eventually(async () => clock.pending()[0] === at(8))
    expect(contact.calls).toHaveLength(2)
    expect(run.counts).toEqual(before)
    expect((await saved(run.assembly)).revision).toBe(position)
    expect(run.admitted).toHaveLength(1)
    controller.abort()
    expect(ok(await waiting)).toBe('cancelled')
  })

  it('an answer other than holding wakes the run, and the node deals with the call', async () => {
    const run = await takeover([null, replyOf('the second reply')])
    const { clock, contact, coordinator, waiting } = await waitingOnModel(run)
    contact.always(lostContact)
    clock.advanceTo(at(1))
    expect(ok(await waiting)).toBe('ready')
    expect(contact.calls).toHaveLength(1)
    ok(await coordinator.runExecution())
    expect((await saved(run.assembly)).checkpoint).toMatchObject({
      position: 'I8',
      calls: [],
      modelRetry: { failures: 1 },
    })
    expect(run.admitted).toHaveLength(1)
  })

  it('a settled answer wakes the run, which then waits for the result to reach the Journal', async () => {
    const run = await takeover([null])
    const { clock, contact, coordinator, waiting } = await waitingOnModel(run)
    contact.always(contactAnswer('settled'))
    clock.advanceTo(at(1))
    expect(ok(await waiting)).toBe('ready')
    ok(await coordinator.runExecution())
    expect((await saved(run.assembly)).state).toMatchObject({
      kind: 'waiting',
      waits: [{ kind: 'producer' }],
    })
    await run.settle(0, replyOf('the reply'))
    ok(await coordinator.runExecution())
    expect(await assistantTexts(run.assembly)).toEqual(['the reply'])
    expect(run.admitted).toHaveLength(1)
  })

  it('an event that arrives while the Model is being asked still wakes the run', async () => {
    const run = await takeover([null])
    const { clock, contact, waiting } = await waitingOnModel(run)
    contact.always(() => new Promise<never>(() => {}))
    clock.advanceTo(at(1))
    await eventually(async () => contact.calls.length === 1)
    await run.settle(0, replyOf('the reply'))
    const stuck = new Promise(resolve => setTimeout(() => resolve('stuck'), 300))
    expect(await Promise.race([waiting, stuck])).toEqual({ ok: 'ready' })
  })

  it('a result that lands while the wait is being saved wakes the run at once', async () => {
    let landed = false
    const run: Takeover = await takeover([null], policy(), d => ({
      ...d,
      journal: {
        ...d.journal,
        async commit(input) {
          if (!landed && input.operation.startsWith('W0/')) {
            landed = true
            await run.settle(0, replyOf('the reply'))
          }
          return d.journal.commit(input)
        },
      },
    }))
    const coordinator = run.coordinator()
    ok(await coordinator.accept())
    ok(await coordinator.runExecution())
    expect(landed).toBe(true)
    expect((await saved(run.assembly)).state.kind).toBe('waiting')
    const waiting = coordinator.waitForWake({
      pacer: reconciliationPacer([1000]),
      signal: new AbortController().signal,
    })
    const asleep = eventually(async () => run.assembly.controls.clock.pending().length === 1)
    expect(await Promise.race([waiting, asleep.then(() => 'asleep')])).toEqual({ ok: 'ready' })
    expect(run.assembly.controls.modelContact.calls).toEqual([])
    ok(await coordinator.runExecution())
    expect(await assistantTexts(run.assembly)).toEqual(['the reply'])
  })

  it('a Model that cannot answer wakes the run into a dependency wait at the node', async () => {
    const run = await takeover([null])
    const { clock, contact, coordinator, waiting } = await waitingOnModel(run)
    contact.always(() =>
      fail({ kind: 'unavailable', dependency: 'model-host', diagnostic: 'not mounted' }),
    )
    clock.advanceTo(at(1))
    expect(ok(await waiting)).toBe('ready')
    ok(await coordinator.runExecution())
    expect((await saved(run.assembly)).state).toEqual({
      kind: 'waiting',
      waits: [{ kind: 'dependency', owner: 'modelRuntime', position: 'M6' }],
    })
    expect(run.admitted).toHaveLength(1)
    contact.always(contactAnswer('holding'))
    ok(await coordinator.runExecution())
    expect((await saved(run.assembly)).state).toMatchObject({
      kind: 'waiting',
      waits: [{ kind: 'producer' }],
    })
  })
})
