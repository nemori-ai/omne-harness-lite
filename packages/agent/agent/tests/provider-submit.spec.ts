// `input.submit` of the execution handle (agent-contract SPEC 2080, "输入内容与水位线"): a later
// input is accepted into the execution without touching the slot, recognized on retry, refused when
// admission rejects it, and answered `terminal` after the end; a live drive gets a wake hint and
// writes nothing while it still waits; the next step boundary takes the input (#1216 A1, A2).
import { describe, expect, it } from 'vitest'
import type { AgentMeasureEvent } from '@omne-harness/agent'
import type {
  AgentEvent,
  AgentExecutionHandle,
  CommandReceipt,
  ExecutionSnapshot,
  Failure,
  MessageHandoff,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  acceptedInput,
  evidence,
  execution,
  failure,
  ok,
  operation,
  otherTenant,
} from './journal-support.ts'
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

/** Counts the run passes of the drive, from the measurement events of the runtime. */
function runPasses() {
  let passes = 0
  return {
    observe: (event: AgentMeasureEvent) => {
      if (event.pass === 'run' && event.phase === 'start') passes += 1
    },
    count: () => passes,
  }
}

/** A message admission that rejects every request, as a submit's input is too long. */
function rejectingPrepare(input: Parameters<MessageHandoff<Principal>['prepare']>[0]) {
  const { principal: _principal, tenant: _tenant, ...rest } = input
  return succeed({
    request: rest.request,
    origin:
      rest.kind === 'submit'
        ? {
            kind: 'submit' as const,
            executionBinding: evidence(`binding/${rest.request.reference.execution}`),
            delivery: { kind: 'durable-view' as const },
          }
        : null,
    provider: { owner: 't', name: 'message-handoff', revision: '1', digest: 'd' },
    qualification: evidence('qualification'),
    record: evidence('handoff-record'),
    decision: { kind: 'rejected' as const, reason: 'too long', evidence: evidence('rejection') },
  })
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
    assembly.controls.handoff.prepare.always(rejectingPrepare)

    const refused = await submit(handle, 'submit-2')

    expect(refused).toEqual(fail({ kind: 'invalid', field: 'value', reason: 'too long' }))
    expect((await snapshotOf(assembly)).revision).toBe(before.revision)
    expect(await submit(handle, 'submit-2')).toEqual(refused)
    expect((await snapshotOf(assembly)).revision).toBe(before.revision)
  })
})

describe('the wake hint after an accepted submit (C6, C7)', () => {
  it('wakes the drive on its saved wait, which runs one pass and writes nothing while it still waits', async () => {
    const passes = runPasses()
    const assembly = await loopAssembly([execution()], undefined, undefined, undefined, {
      measure: passes.observe,
    })
    const handle = ok(await invoke(assembly))
    await waitingOnModel(assembly)
    await turns(20)
    const before = await snapshotOf(assembly)
    const slept = passes.count()

    ok(await submit(handle, 'submit-2'))

    // The check time never comes (the manual clock stands still): only the hint can wake it.
    await eventually(async () => passes.count() > slept)
    await turns(20)
    const after = await snapshotOf(assembly)
    expect(Number(after.revision)).toBe(Number(before.revision) + 1)
    expect(after.state).toEqual(before.state)
    expect(after.checkpoint).toEqual(before.checkpoint)
  })

  it('wakes nothing when the submit was refused', async () => {
    const passes = runPasses()
    const assembly = await loopAssembly([execution()], undefined, undefined, undefined, {
      measure: passes.observe,
    })
    const handle = ok(await invoke(assembly))
    await waitingOnModel(assembly)
    await turns(20)
    const slept = passes.count()
    assembly.controls.handoff.prepare.always(rejectingPrepare)

    expect(await submit(handle, 'submit-2')).toEqual(
      fail({ kind: 'invalid', field: 'value', reason: 'too long' }),
    )

    await turns(40)
    expect(passes.count()).toBe(slept)
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

describe('the request and the failure paths of input.submit', () => {
  it('asks message admission with the submit entry of the input: Ki is the execution, the operation and the input', async () => {
    const requests: Parameters<MessageHandoff<Principal>['prepare']>[0][] = []
    const assembly = await loopAssembly([execution()], dependencies => ({
      ...dependencies,
      handoff: {
        ...dependencies.handoff,
        prepare: input => {
          requests.push(input)
          return dependencies.handoff.prepare(input)
        },
      },
    }))
    const handle = ok(await invoke(assembly))
    await waitingOnModel(assembly)
    const value = acceptedInput('input-2', 'second')

    ok(await submit(handle, 'submit-2', value))

    expect(requests.filter(request => request.kind === 'submit')).toEqual([
      {
        ...alice,
        kind: 'submit',
        request: {
          kind: 'input',
          reference: {
            kind: 'input',
            execution: execution(),
            entry: operation('submit-2'),
            input: value.id,
          },
          entry: {
            kind: 'submit',
            operation: operation('submit-2'),
            execution: execution(),
            value,
          },
          source: { kind: 'external-input', input: value.id },
        },
      },
    ])
  })

  it('does not ask message admission for a new input after the end', async () => {
    let asked = 0
    const assembly = await loopAssembly([execution()], dependencies => ({
      ...dependencies,
      handoff: {
        ...dependencies.handoff,
        prepare: input => {
          if (input.kind === 'submit') asked += 1
          return dependencies.handoff.prepare(input)
        },
      },
    }))
    const handle = ok(await invoke(assembly))
    assembly.release.open()
    await eventsOf(handle)

    expect(await submit(handle, 'submit-3', acceptedInput('input-3'))).toEqual(
      fail({ kind: 'terminal' }),
    )
    expect(asked).toBe(0)
  })

  it('refuses another tenant before it reads anything, and an execution that is not the handle', async () => {
    const assembly = await loopAssembly([execution()])
    const handle = ok(await invoke(assembly))
    const before = await waitingOnModel(assembly)

    const foreignTenant = await handle.input.submit({
      ...otherTenant,
      execution: handle.execution,
      operation: operation('submit-2'),
      value: acceptedInput('input-2'),
    })
    const foreignExecution = await handle.input.submit({
      ...alice,
      execution: execution('exec-2'),
      operation: operation('submit-2'),
      value: acceptedInput('input-2'),
    })

    expect(failure(foreignTenant).kind).toBe('denied')
    expect(foreignExecution).toEqual(
      fail({ kind: 'invalid', field: 'execution', reason: 'not the execution of this handle' }),
    )
    expect((await snapshotOf(assembly)).revision).toBe(before.revision)
  })

  it('hands on a failure of message admission and of the read, and saves nothing', async () => {
    let failRead = false
    const assembly = await loopAssembly([execution()], dependencies => ({
      ...dependencies,
      journal: {
        ...dependencies.journal,
        load: input =>
          failRead
            ? Promise.resolve(fail({ kind: 'unavailable', owner: 'journal', diagnostic: 'down' }))
            : dependencies.journal.load(input),
      },
    }))
    const handle = ok(await invoke(assembly))
    const before = await waitingOnModel(assembly)
    await turns(20)
    const unavailable = fail({ kind: 'unavailable', owner: 'handoff', diagnostic: 'busy' } as const)
    assembly.controls.handoff.prepare.always(() => unavailable)

    expect(await submit(handle, 'submit-2')).toEqual(unavailable)
    failRead = true
    expect(await submit(handle, 'submit-3', acceptedInput('input-3'))).toEqual(
      fail({ kind: 'unavailable', owner: 'journal', diagnostic: 'down' }),
    )
    failRead = false
    expect((await snapshotOf(assembly)).revision).toBe(before.revision)
  })

  it('answers commit-unknown for its own operation when Journal.submit throws', async () => {
    const assembly = await loopAssembly([execution()], dependencies => ({
      ...dependencies,
      journal: {
        ...dependencies.journal,
        submit: () => Promise.reject(new Error('the connection dropped')),
      },
    }))
    const handle = ok(await invoke(assembly))
    await waitingOnModel(assembly)

    expect(await submit(handle, 'submit-2')).toEqual(
      fail({ kind: 'commit-unknown', operation: operation('submit-2') }),
    )
  })
})
