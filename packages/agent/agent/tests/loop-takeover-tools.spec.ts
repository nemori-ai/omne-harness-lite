import { describe, expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  type ToolCallContact,
  type ToolInvokeOutcome,
  type ToolState,
} from '@omne-harness/tool-contract'
import { canonical } from '../src/canonical.ts'
import { createExecutionCoordinator } from '../src/loop/coordinator.ts'
import { reconciliationPacer } from '../src/loop/reconciliation.ts'
import { acceptedInput, execution, ok, operation } from './journal-support.ts'
import { alice, eventually } from './loop-support.ts'
import {
  assistantTexts,
  at,
  rebuilt,
  resumeEntry,
  saved,
  type Counts,
} from './loop-takeover-support.ts'
import {
  associatedTools,
  deliverModelReply,
  deliverToolSuggestion,
  pushToolResult,
  textBlock,
  toolAssembly,
  toolCall,
  toolDelivery,
  toolReceiver,
} from './fixtures/tool-call.ts'

type Assembly = Awaited<ReturnType<typeof toolAssembly>>

const reference = (n = 1) =>
  ok(
    encodeToolInvocationRef({
      tenant: alice.tenant,
      call: ok(decodeToolCallId(`tcall_${n}`)),
      admission: ok(decodeToolOperationId(`top_${n}`)),
    }),
  )

const accepted = (recovered: boolean, n = 1): ToolInvokeOutcome => ({
  kind: 'accepted',
  reference: reference(n),
  state: {} as ToolState,
  recovered,
})

const REFUSED: ToolInvokeOutcome = {
  kind: 'rejected',
  failure: { kind: 'invalid', field: 'request', reason: 'the arguments do not match' },
}

const UNAVAILABLE: ToolInvokeOutcome = {
  kind: 'rejected',
  failure: { kind: 'unavailable', dependency: 'tool-host', diagnostic: 'not mounted' },
}

const TWO_CALLS = [toolCall('tool-call-1'), toolCall('tool-call-2')]

function invokeAnswers(...answers: readonly ToolInvokeOutcome[]) {
  return (assembly: Assembly) => {
    for (const answer of answers) assembly.controls.tools.invoke.once(async () => answer)
    assembly.controls.tools.invoke.always(async () => accepted(true, 2))
  }
}

function accepting(assembly: Assembly) {
  let sent = 0
  assembly.controls.tools.invoke.always(async () => accepted((sent += 1) > 1))
}

function acceptingOnce(assembly: Assembly) {
  let sent = 0
  assembly.controls.tools.invoke.always(async () => ((sent += 1) > 1 ? REFUSED : accepted(false)))
}

async function toolMessages(assembly: Assembly) {
  const input = { ...alice, execution: execution(), after: null, limit: 100 }
  const page = ok(await assembly.dependencies.journal.output.read(input))
  if (page.kind !== 'page') throw new Error('a gap in a new execution')
  return page.events.flatMap(event =>
    event.body.kind === 'message' && event.body.message.role === 'tool' ? [event.body.message] : [],
  )
}

const answering = (assembly: Assembly, kind: ToolCallContact['kind']) =>
  assembly.controls.tools.queries.contact.always(() => ({ ok: { kind } }))

async function dispatched(
  prepare: (assembly: Assembly) => void = accepting,
  calls?: Parameters<typeof deliverToolSuggestion>[1],
) {
  const run = await suggested(prepare, calls)
  expect(run.parked.state).toMatchObject({ kind: 'waiting', waits: [{ kind: 'producer' }] })
  return run
}

async function suggested(
  prepare: (assembly: Assembly) => void,
  calls?: Parameters<typeof deliverToolSuggestion>[1],
  wrap: (d: Assembly['dependencies'], counts: Counts) => Assembly['dependencies'] = d => d,
) {
  const counts: Counts = { loads: 0, received: 0, inputs: 0 }
  const assembly = await toolAssembly()
  prepare(assembly)
  const dependencies: Assembly['dependencies'] = wrap(
    {
      ...assembly.dependencies,
      journal: {
        ...assembly.dependencies.journal,
        load: input => {
          counts.loads += 1
          return assembly.dependencies.journal.load(input)
        },
      },
    },
    counts,
  )
  const entry = resumeEntry(dependencies, { toolConcurrency: 4 })
  const first = createExecutionCoordinator({
    ...entry,
    operation: operation('invoke-exec-1'),
    initial: acceptedInput('input-exec-1', 'hello exec-1'),
    grant: null,
  })
  ok(await first.accept())
  ok(await first.runExecution())
  await deliverToolSuggestion(assembly, calls)
  ok(await first.runExecution())
  const parked = await saved(assembly)
  let rebuilds = 0
  return {
    assembly,
    counts,
    first,
    parked,
    rebuild: () => rebuilt(dependencies, entry, String((rebuilds += 1))),
  }
}

describe('takeover of a dispatched Tool call whose result is not in the Journal', () => {
  it('a call this coordinator dispatched is not asked about when the wait begins', async () => {
    const run = await dispatched()
    expect(run.parked.checkpoint.position).toBe('T0')
    expect(run.assembly.controls.tools.queries.contact.calls).toEqual([])
  })

  it.each(['holding', 'settled', 'unknown'] as const)(
    'the Tool answers %s: asks once, sends nothing again and waits for the result',
    async answer => {
      const run = await dispatched()
      const [tool] = await associatedTools(run.assembly, 1)
      answering(run.assembly, answer)
      const next = await run.rebuild()
      ok(await next.runExecution())
      const contact = run.assembly.controls.tools.queries.contact
      expect(contact.calls.map(call => call.reference)).toEqual([tool?.reference])
      const after = await saved(run.assembly)
      expect(after.state).toMatchObject({ kind: 'waiting', waits: [{ kind: 'producer' }] })
      expect(after.checkpoint.batch).toEqual(run.parked.checkpoint.batch)
      expect(run.assembly.controls.tools.invoke.calls).toHaveLength(1)
    },
  )

  it('the Tool answers not-accepted: the same request is handed to the Tool again', async () => {
    const run = await dispatched()
    answering(run.assembly, 'not-accepted')
    const next = await run.rebuild()
    ok(await next.runExecution())
    const sent = run.assembly.controls.tools.invoke.calls
    expect(sent).toHaveLength(2)
    expect(canonical(sent[1]?.request)).toBe(canonical(sent[0]?.request))
    const after = await saved(run.assembly)
    expect(after.state).toMatchObject({ kind: 'waiting', waits: [{ kind: 'producer' }] })
    expect(after.checkpoint.batch).toEqual(run.parked.checkpoint.batch)
  })

  it('the Tool answers not-accepted at T3 for the call still out: the run goes back to dispatch and sends the same request again', async () => {
    const run = await suggested(invokeAnswers(accepted(false, 1), accepted(false, 2)), TWO_CALLS)
    expect(run.parked.state).toMatchObject({
      kind: 'waiting',
      waits: [{ kind: 'producer' }, { kind: 'producer' }],
    })
    const [one, two] = await associatedTools(run.assembly, 2)
    if (one === undefined || two === undefined) throw new Error('no associated Tool calls')
    expect(
      await pushToolResult(
        toolReceiver(run.assembly),
        toolDelivery(one, { name: 'one', content: [textBlock('file', 'blk_result_one')] }),
      ),
    ).toHaveProperty('ok')
    answering(run.assembly, 'not-accepted')
    const next = await run.rebuild()
    ok(await next.runExecution())
    const contact = run.assembly.controls.tools.queries.contact
    expect(contact.calls.map(call => call.reference)).toEqual([two.reference])
    const sent = run.assembly.controls.tools.invoke.calls
    expect(sent).toHaveLength(3)
    expect(canonical(sent[2]?.request)).toBe(canonical(sent[1]?.request))
    const after = await saved(run.assembly)
    expect(after.state).toMatchObject({ kind: 'waiting', waits: [{ kind: 'producer' }] })
    expect(after.checkpoint.position).toBe('T0')
  })

  it('a call whose hand-over ended commit-unknown is not held: the Tool is asked when the wait begins', async () => {
    const run = await dispatched(assembly =>
      assembly.controls.tools.invoke.always(async () => ({
        kind: 'commit-unknown',
        reference: reference(),
      })),
    )
    const [tool] = await associatedTools(run.assembly, 1)
    expect(run.parked.checkpoint.position).toBe('T0')
    expect(run.assembly.controls.tools.queries.contact.calls.map(call => call.reference)).toEqual([
      tool?.reference,
    ])
    expect(run.assembly.controls.tools.invoke.calls).toHaveLength(1)
  })

  it('the Tool answers not-accepted and refuses the request for good: the action is denied and the run ends', async () => {
    const run = await dispatched(acceptingOnce)
    answering(run.assembly, 'not-accepted')
    const next = await run.rebuild()
    ok(await next.runExecution())
    expect(run.assembly.controls.tools.invoke.calls).toHaveLength(2)
    expect(run.assembly.controls.tools.queries.contact.calls).toHaveLength(1)
    const after = await saved(run.assembly)
    expect(after.checkpoint.step).toBe('step-2')
    expect(after.checkpoint.calls.map(call => call.kind)).toEqual(['model'])
    expect(await toolMessages(run.assembly)).toHaveLength(1)
    await deliverModelReply(run.assembly, [textBlock('after the denial')], 'final')
    ok(await next.runExecution())
    expect(await assistantTexts(run.assembly)).toEqual(['after the denial'])
    const ended = await saved(run.assembly)
    expect(ended.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    expect(ended.checkpoint.voided).toMatchObject([
      { kind: 'tool', step: 'step-1', cause: 'not-accepted' },
    ])
    expect(run.assembly.controls.tools.invoke.calls).toHaveLength(2)
    expect(run.assembly.controls.tools.queries.contact.calls).toHaveLength(1)
  })

  it('the result is already in the Journal: the Tool is not asked', async () => {
    const run = await dispatched()
    const [tool] = await associatedTools(run.assembly, 1)
    if (tool === undefined) throw new Error('no associated Tool call')
    expect(
      await pushToolResult(
        toolReceiver(run.assembly),
        toolDelivery(tool, { name: 'one', content: [textBlock('file', 'blk_result_one')] }),
      ),
    ).toHaveProperty('ok')
    const next = await run.rebuild()
    ok(await next.runExecution())
    expect(run.assembly.controls.tools.queries.contact.calls).toEqual([])
    expect((await saved(run.assembly)).checkpoint.step).toBe('step-2')
    expect(run.assembly.controls.tools.invoke.calls).toHaveLength(1)
  })

  it('the Tool row cannot answer: a dependency wait at the node, and the question again later', async () => {
    const run = await dispatched()
    run.assembly.controls.tools.queries.contact.always(() =>
      fail({ kind: 'unavailable', dependency: 'tool-host', diagnostic: 'not mounted' }),
    )
    const next = await run.rebuild()
    ok(await next.runExecution())
    expect((await saved(run.assembly)).state).toEqual({
      kind: 'waiting',
      waits: [{ kind: 'dependency', owner: 'toolRuntime', position: 'T0' }],
    })
    answering(run.assembly, 'holding')
    ok(await next.runExecution())
    expect(run.assembly.controls.tools.queries.contact.calls).toHaveLength(2)
    expect((await saved(run.assembly)).state).toMatchObject({
      kind: 'waiting',
      waits: [{ kind: 'producer' }],
    })
    expect(run.assembly.controls.tools.invoke.calls).toHaveLength(1)
  })

  it('an intent the Tool never associated is sent again with its request, without the question', async () => {
    const run = await dispatched(assembly => {
      assembly.controls.tools.invoke.once(() => ({ kind: 'association-unknown' }))
      accepting(assembly)
    })
    expect(run.parked.checkpoint.batch?.slots).toEqual([])
    const next = await run.rebuild()
    ok(await next.runExecution())
    const sent = run.assembly.controls.tools.invoke.calls
    expect(sent).toHaveLength(2)
    expect(canonical(sent[1]?.request)).toBe(canonical(sent[0]?.request))
    expect(run.assembly.controls.tools.queries.contact.calls).toEqual([])
    expect((await saved(run.assembly)).checkpoint.batch?.slots).toMatchObject([
      { kind: 'dispatched' },
    ])
  })
})

describe('the check time of a wait for a Tool call', () => {
  it('asks the Tool; while it holds the call the wait goes on without a read', async () => {
    const run = await dispatched()
    answering(run.assembly, 'holding')
    const controller = new AbortController()
    const clock = run.assembly.controls.clock
    const waiting = run.first.waitForWake({
      pacer: reconciliationPacer([1000, 2000]),
      signal: controller.signal,
    })
    await eventually(async () => clock.pending().length === 1)
    const loads = run.counts.loads
    clock.advanceTo(at(1))
    await eventually(async () => clock.pending()[0] === at(3))
    expect(run.assembly.controls.tools.queries.contact.calls).toHaveLength(1)
    expect(run.counts.loads).toBe(loads)

    answering(run.assembly, 'settled')
    clock.advanceTo(at(3))
    expect(ok(await waiting)).toBe('ready')
    expect(run.assembly.controls.tools.queries.contact.calls).toHaveLength(2)
    expect(run.counts.loads).toBe(loads)
    ok(await run.first.runExecution())
    expect(run.assembly.controls.tools.queries.contact.calls).toHaveLength(3)
    expect(run.assembly.controls.tools.invoke.calls).toHaveLength(1)
  })

  it('a rebuilt coordinator with no Model step in flight wakes when the Tool no longer holds the call, and sends it again', async () => {
    const run = await dispatched()
    answering(run.assembly, 'holding')
    const next = await run.rebuild()
    ok(await next.runExecution())
    expect(run.assembly.controls.tools.queries.contact.calls).toHaveLength(1)
    answering(run.assembly, 'not-accepted')
    const clock = run.assembly.controls.clock
    const waiting = next.waitForWake({
      pacer: reconciliationPacer([1000]),
      signal: new AbortController().signal,
    })
    await eventually(async () => clock.pending().length === 1)
    clock.advanceTo(at(1))
    expect(ok(await waiting)).toBe('ready')
    ok(await next.runExecution())
    const sent = run.assembly.controls.tools.invoke.calls
    expect(sent).toHaveLength(2)
    expect(canonical(sent[1]?.request)).toBe(canonical(sent[0]?.request))
  })

  it('T3 with no action left to send waits for the call still out without going back to dispatch: no Journal read after T2 is saved', async () => {
    let loadsAtT3: number | null = null
    const run = await suggested(
      invokeAnswers(accepted(false, 1), accepted(false, 2)),
      TWO_CALLS,
      (d, counts) => ({
        ...d,
        journal: {
          ...d.journal,
          commit: input => {
            if (input.checkpoint.position === 'T3' && loadsAtT3 === null) loadsAtT3 = counts.loads
            return d.journal.commit(input)
          },
        },
      }),
    )
    const [one] = await associatedTools(run.assembly, 2)
    if (one === undefined) throw new Error('no associated Tool call')
    expect(
      await pushToolResult(
        toolReceiver(run.assembly),
        toolDelivery(one, { name: 'one', content: [textBlock('file', 'blk_result_one')] }),
      ),
    ).toHaveProperty('ok')
    ok(await run.first.runExecution())
    expect(loadsAtT3).not.toBeNull()
    expect(run.counts.loads).toBe(loadsAtT3)
    const after = await saved(run.assembly)
    expect(after.state).toMatchObject({ kind: 'waiting', waits: [{ kind: 'producer' }] })
    expect(after.checkpoint.position).toBe('T3')
    expect(run.assembly.controls.tools.queries.contact.calls).toEqual([])
    expect(run.assembly.controls.tools.invoke.calls).toHaveLength(2)
  })
})

describe('A2 when the Tool did not associate an intent it was sent', () => {
  it('no call is dispatched in the batch: A2 waits for the intent at A2 and does not send it again', async () => {
    const run = await suggested(
      invokeAnswers(REFUSED, UNAVAILABLE, { kind: 'association-unknown' }),
      TWO_CALLS,
    )
    expect(run.parked.state).toEqual({
      kind: 'waiting',
      waits: [{ kind: 'dependency', owner: 'toolRuntime', position: 'A2' }],
    })
    ok(await run.first.runExecution())
    const after = await saved(run.assembly)
    expect(after.state).toMatchObject({ kind: 'waiting', waits: [{ kind: 'producer' }] })
    expect(after.checkpoint.position).toBe('A2')
    expect(after.checkpoint.batch?.slots).toMatchObject([{ kind: 'denied' }])
    expect(run.assembly.controls.tools.invoke.calls).toHaveLength(3)
    expect(run.assembly.controls.tools.queries.contact.calls).toEqual([])
  })

  it('a call is dispatched in the batch: A2 goes on to T0, which takes the result already in the Journal', async () => {
    const run = await suggested(
      invokeAnswers(accepted(false, 1), UNAVAILABLE, { kind: 'association-unknown' }),
      TWO_CALLS,
    )
    expect(run.parked.state).toEqual({
      kind: 'waiting',
      waits: [{ kind: 'dependency', owner: 'toolRuntime', position: 'A2' }],
    })
    const [one] = await associatedTools(run.assembly, 1)
    if (one === undefined) throw new Error('no associated Tool call')
    expect(
      await pushToolResult(
        toolReceiver(run.assembly),
        toolDelivery(one, { name: 'one', content: [textBlock('file', 'blk_result_one')] }),
      ),
    ).toHaveProperty('ok')
    ok(await run.first.runExecution())
    const after = await saved(run.assembly)
    expect(after.state).toMatchObject({ kind: 'waiting', waits: [{ kind: 'producer' }] })
    expect(after.checkpoint.batch?.slots).toMatchObject([
      { kind: 'result', action: one.action },
      { kind: 'dispatched' },
    ])
    expect(run.assembly.controls.tools.invoke.calls).toHaveLength(4)
    expect(run.assembly.controls.tools.queries.contact.calls).toEqual([])
  })
})
