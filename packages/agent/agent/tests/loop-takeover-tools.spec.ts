import { describe, expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  type ToolCallContact,
  type ToolState,
} from '@omne-harness/tool-contract'
import { canonical } from '../src/canonical.ts'
import { createExecutionCoordinator } from '../src/loop/coordinator.ts'
import { reconciliationPacer } from '../src/loop/reconciliation.ts'
import { acceptedInput, ok, operation } from './journal-support.ts'
import { alice, eventually } from './loop-support.ts'
import { at, rebuilt, resumeEntry, saved, type Counts } from './loop-takeover-support.ts'
import {
  associatedTools,
  deliverToolSuggestion,
  pushToolResult,
  textBlock,
  toolAssembly,
  toolDelivery,
  toolReceiver,
} from './fixtures/tool-call.ts'

type Assembly = Awaited<ReturnType<typeof toolAssembly>>

function accepting(assembly: Assembly) {
  let accepted = 0
  assembly.controls.tools.invoke.always(async () => {
    accepted += 1
    return {
      kind: 'accepted',
      reference: ok(
        encodeToolInvocationRef({
          tenant: alice.tenant,
          call: ok(decodeToolCallId('tcall_1')),
          admission: ok(decodeToolOperationId('top_1')),
        }),
      ),
      state: {} as ToolState,
      recovered: accepted > 1,
    }
  })
}

const answering = (assembly: Assembly, kind: ToolCallContact['kind']) =>
  assembly.controls.tools.queries.contact.always(() => ({ ok: { kind } }))

async function dispatched(prepare: (assembly: Assembly) => void = accepting) {
  const counts: Counts = { loads: 0, received: 0, inputs: 0 }
  const assembly = await toolAssembly()
  prepare(assembly)
  const dependencies: Assembly['dependencies'] = {
    ...assembly.dependencies,
    journal: {
      ...assembly.dependencies.journal,
      load: input => {
        counts.loads += 1
        return assembly.dependencies.journal.load(input)
      },
    },
  }
  const entry = resumeEntry(dependencies, { toolConcurrency: 4 })
  const first = createExecutionCoordinator({
    ...entry,
    operation: operation('invoke-exec-1'),
    initial: acceptedInput('input-exec-1', 'hello exec-1'),
    grant: null,
  })
  ok(await first.accept())
  ok(await first.runExecution())
  await deliverToolSuggestion(assembly)
  ok(await first.runExecution())
  const parked = await saved(assembly)
  expect(parked.state).toMatchObject({ kind: 'waiting', waits: [{ kind: 'producer' }] })
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
})
