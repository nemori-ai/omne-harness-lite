// `input.submit` of the execution handle (agent-contract SPEC 2080, "输入内容与水位线"): a later
// input is accepted into the execution without touching the slot, recognized on retry, refused when
// admission rejects it, and answered `terminal` after the end; a live drive gets a wake hint and
// writes nothing while it still waits; the next step boundary takes the input (#1216 A1, A2).
import { describe, expect, it } from 'vitest'
import type {
  AgentEvent,
  AgentExecutionHandle,
  CommandReceipt,
  ExecutionSnapshot,
  Failure,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { acceptedInput, evidence, execution, ok, operation } from './journal-support.ts'
import {
  alice,
  eventsOf,
  eventually,
  invoke,
  loopAssembly,
  shown,
  type LoopAssembly,
} from './loop-support.ts'
import type { Principal } from './journal-support.ts'

type Handle = AgentExecutionHandle<Principal>

async function snapshotOf(assembly: LoopAssembly): Promise<ExecutionSnapshot> {
  return ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() }))
}

/** Waits until exec-1 sleeps on its saved wait for the main model call. */
async function waitingOnModel(assembly: LoopAssembly): Promise<ExecutionSnapshot> {
  await eventually(async () => {
    const snapshot = await snapshotOf(assembly)
    return (
      snapshot.state.kind === 'waiting' &&
      snapshot.checkpoint.calls.some(call => call.kind === 'model')
    )
  })
  return snapshotOf(assembly)
}

function submit(
  handle: Handle,
  name: string,
  input = acceptedInput('input-2', 'second'),
): Promise<Outcome<CommandReceipt, Failure>> {
  return handle.input.submit({
    ...alice,
    execution: handle.execution,
    operation: operation(name),
    value: input,
  })
}

/** The inputs within the watermark of `snapshot`, in order. */
async function inputsWithin(assembly: LoopAssembly, snapshot: ExecutionSnapshot) {
  const read = ok(
    await assembly.controls.journal.port.inputs({
      ...alice,
      execution: execution(),
      watermark: snapshot.inputWatermark,
    }),
  )
  return read.batch.ordered
}

function taken(events: readonly AgentEvent[]) {
  return events.flatMap(event =>
    event.body.kind === 'input-taken' ? [event.body.batch.ordered] : [],
  )
}

async function turns(count: number): Promise<void> {
  for (let turn = 0; turn < count; turn += 1) await new Promise(resolve => setTimeout(resolve, 0))
}

describe('input.submit accepts a later input into the running execution (C1)', () => {
  it('saves the input with the watermark in one revision, keeps the slot and the attachment, and emits no input-taken', async () => {
    const assembly = await loopAssembly([execution()])
    const handle = ok(await invoke(assembly))
    const before = await waitingOnModel(assembly)
    const state = await shown(assembly)

    const receipt = ok(await submit(handle, 'submit-2'))

    expect(receipt).toMatchObject({
      operation: operation('submit-2'),
      execution: execution(),
      state: 'accepted',
    })
    const after = await snapshotOf(assembly)
    expect(Number(after.revision)).toBe(Number(before.revision) + 1)
    expect(after.executionAttachment).toEqual(before.executionAttachment)
    expect(after.checkpoint).toEqual(before.checkpoint)
    expect(await inputsWithin(assembly, after)).toContain(acceptedInput('input-2').id)
    expect(await shown(assembly)).toEqual(state)
    const events = ok(
      await handle.output.read({ ...alice, execution: handle.execution, after: null, limit: 100 }),
    )
    if (events.kind !== 'page') throw new Error('a gap in a new execution')
    expect(taken(events.events)).toHaveLength(1)
  })
})

describe('input.submit recognizes a retry and refuses other content (C2)', () => {
  it('answers the original receipt to the same operation and to a new operation with the same input, and conflict to other content', async () => {
    const assembly = await loopAssembly([execution()])
    const handle = ok(await invoke(assembly))
    await waitingOnModel(assembly)
    const first = ok(await submit(handle, 'submit-2'))
    const accepted = await snapshotOf(assembly)

    expect(ok(await submit(handle, 'submit-2'))).toEqual(first)
    const recognized = ok(await submit(handle, 'submit-2b'))
    expect(recognized).toMatchObject({
      operation: operation('submit-2b'),
      revision: first.revision,
    })
    expect((await snapshotOf(assembly)).revision).toBe(accepted.revision)
    expect(await submit(handle, 'submit-2c', acceptedInput('input-2', 'other text'))).toEqual(
      fail({ kind: 'conflict', operation: operation('submit-2c') }),
    )
    expect((await snapshotOf(assembly)).revision).toBe(accepted.revision)
  })
})

describe('input.submit after the end (C3)', () => {
  it('answers terminal to a new input, and still the original receipt to an operation that succeeded before the end', async () => {
    const assembly = await loopAssembly([execution()])
    const handle = ok(await invoke(assembly))
    await waitingOnModel(assembly)
    const first = ok(await submit(handle, 'submit-2'))
    assembly.release.open()
    await eventsOf(handle)

    expect(await submit(handle, 'submit-3', acceptedInput('input-3'))).toEqual(
      fail({ kind: 'terminal' }),
    )
    expect(ok(await submit(handle, 'submit-2'))).toEqual(first)
  })
})

describe('input.submit needs no live runtime (C4)', () => {
  it('accepts an input after the execution was handed over and the runtime drained, keeps the slot free and resumes nothing', async () => {
    const assembly = await loopAssembly([execution()])
    const handle = ok(await invoke(assembly))
    await waitingOnModel(assembly)
    const quiesced = ok(
      await assembly.provider.control.quiesce({
        ...alice,
        operation: operation('quiesce'),
        reason: evidence('stop'),
      }),
    )
    expect(quiesced.kind).toBe('drained')
    const handedOver = await snapshotOf(assembly)

    const receipt = ok(await submit(handle, 'submit-2'))

    expect(receipt.state).toBe('accepted')
    await turns(20)
    const after = await snapshotOf(assembly)
    expect(Number(after.revision)).toBe(Number(handedOver.revision) + 1)
    expect(after.executionAttachment).toEqual(handedOver.executionAttachment)
    expect(after.state).toEqual(handedOver.state)
    expect(await inputsWithin(assembly, after)).toContain(acceptedInput('input-2').id)
  })
})

describe('input.submit of an input that admission rejects (C5)', () => {
  it('answers invalid value with the rejection reason, saves nothing, and answers the same to a retry', async () => {
    const assembly = await loopAssembly([execution()])
    const handle = ok(await invoke(assembly))
    const before = await waitingOnModel(assembly)
    assembly.controls.handoff.prepare.always(input => {
      const { principal: _principal, tenant: _tenant, ...rest } = input
      return succeed({
        request: rest.request,
        origin:
          rest.kind === 'submit'
            ? {
                kind: 'submit',
                executionBinding: evidence(`binding/${rest.request.reference.execution}`),
                delivery: { kind: 'durable-view' },
              }
            : null,
        provider: { owner: 't', name: 'message-handoff', revision: '1', digest: 'd' },
        qualification: evidence('qualification'),
        record: evidence('handoff-record'),
        decision: { kind: 'rejected', reason: 'too long', evidence: evidence('rejection') },
      })
    })

    const refused = await submit(handle, 'submit-2')

    expect(refused).toEqual(fail({ kind: 'invalid', field: 'value', reason: 'too long' }))
    expect((await snapshotOf(assembly)).revision).toBe(before.revision)
    expect(await submit(handle, 'submit-2')).toEqual(refused)
    expect((await snapshotOf(assembly)).revision).toBe(before.revision)
  })
})

describe('the wake hint after an accepted submit (C6, C7)', () => {
  it('wakes the drive on its saved wait, which reads again and writes nothing while it still waits', async () => {
    let loads = 0
    const assembly = await loopAssembly([execution()], dependencies => ({
      ...dependencies,
      journal: {
        ...dependencies.journal,
        load: input => {
          loads += 1
          return dependencies.journal.load(input)
        },
      },
    }))
    const handle = ok(await invoke(assembly))
    await waitingOnModel(assembly)
    await turns(20)
    const before = await snapshotOf(assembly)

    ok(await submit(handle, 'submit-2'))
    // The submit itself reads the execution once; count only the reads after it answered.
    const settled = loads

    // The check time never comes (the manual clock stands still): only the hint can wake it.
    await eventually(async () => loads > settled)
    await turns(20)
    const after = await snapshotOf(assembly)
    expect(Number(after.revision)).toBe(Number(before.revision) + 1)
    expect(after.state).toEqual(before.state)
    expect(after.checkpoint).toEqual(before.checkpoint)
  })

  it('takes the input at the next step boundary once the wait is over', async () => {
    const assembly = await loopAssembly([execution()])
    const handle = ok(await invoke(assembly))
    await waitingOnModel(assembly)
    ok(await submit(handle, 'submit-2'))

    assembly.release.open()
    const events = await eventsOf(handle)

    expect(taken(events)).toEqual([
      [acceptedInput('input-exec-1').id],
      [acceptedInput('input-2').id],
    ])
    const ended = events.find(event => event.body.kind === 'ended')
    expect(ended?.body).toMatchObject({ conclusion: { kind: 'complete' } })
  })
})
