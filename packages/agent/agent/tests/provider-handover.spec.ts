// The handover of a waiting execution at quiesce and its resume in another runtime (SPEC "交接与停用",
// "创建、登记与复用" resume). An execution whose drive sleeps on a saved wait is handed over by its
// own drive: Journal.detach revokes the attachment, the slot is free and quiesce answers drained. The
// Tool call it waits for is not stopped. A new runtime over the same Journal resumes it: Journal.attach
// grants a new attachment, and a new coordinator comes back to the saved position and goes on.
import { describe, expect, it } from 'vitest'
import { createAgentRuntime } from '@omne-harness/agent'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  type ToolInvokeOutcome,
  type ToolState,
} from '@omne-harness/tool-contract'
import { options } from './factory-support.ts'
import {
  evidence,
  execution,
  failure,
  loadWithEntries,
  ok,
  operation,
  type LoadedWithEntries,
} from './journal-support.ts'
import { alice, eventually, invoke, loopAssembly } from './loop-support.ts'
import {
  associatedTools,
  deliverModelReply,
  deliverToolSuggestion,
  pushToolResult,
  textBlock,
  toolAccount,
  toolAssembly,
  toolDelivery,
  toolReceiver,
} from './fixtures/tool-call.ts'

type Assembly = Awaited<ReturnType<typeof toolAssembly>>

const input = { ...alice, execution: execution() }

/** The receipt of an accepted Tool invoke. Agent keeps it as a fact and does not read its state. */
function accepted(name: string): ToolInvokeOutcome {
  const reference = ok(
    encodeToolInvocationRef({
      tenant: alice.tenant,
      call: ok(decodeToolCallId(`tcall_${name}`)),
      admission: ok(decodeToolOperationId(`top_${name}`)),
    }),
  )
  return { kind: 'accepted', reference, state: {} as ToolState, recovered: false }
}

async function snapshot(assembly: Assembly): Promise<LoadedWithEntries> {
  return await loadWithEntries(assembly.dependencies, input)
}

/** One execution whose only Tool call is accepted and open, with the wait saved in the Journal. */
async function waitingOnTool(assembly: Assembly) {
  assembly.controls.tools.invoke.always(async () => accepted('call-1'))
  ok(await invoke(assembly))
  await deliverToolSuggestion(assembly)
  const [pending] = await associatedTools(assembly, 1)
  if (pending === undefined) throw new Error('no associated Tool call')
  await eventually(async () => (await snapshot(assembly)).state.kind === 'waiting')
  return pending
}

const quiesce = (assembly: Assembly) =>
  assembly.provider.control.quiesce({
    ...alice,
    operation: operation('quiesce-1'),
    reason: evidence('stop'),
  })

/** Another runtime over the same dependencies, as the process that starts after a stop. */
async function successor(assembly: Assembly) {
  return ok(
    await createAgentRuntime(assembly.dependencies, options({ reconciliationDelaysMs: [1000] })),
  )
}

const resumeIn = (runtime: Awaited<ReturnType<typeof successor>>, name = 'resume-1') =>
  runtime.runtime.resume({
    ...input,
    operation: operation(name),
    recovery: evidence('recovery'),
    grant: null,
  })

describe('quiesce with an execution that waits', () => {
  it('hands the execution over, frees the slot and answers drained; the Tool call is not stopped', async () => {
    const assembly = await toolAssembly()
    await waitingOnTool(assembly)
    const before = await snapshot(assembly)

    const result = ok(await quiesce(assembly))

    expect(result).toMatchObject({ kind: 'drained', remaining: [] })
    const after = await snapshot(assembly)
    expect(after.state.kind).toBe('suspended')
    expect(after.executionAttachment).toBeNull()
    // The position and the open call stay as saved: the handover is not an interruption.
    expect(after.checkpoint).toEqual(before.checkpoint)
    expect(assembly.controls.tools.commands.control.calls).toEqual([])
  })

  it('answers unresolved when the Journal does not confirm the handover, keeps the wait, and drains on the retry', async () => {
    const assembly = await toolAssembly()
    await waitingOnTool(assembly)
    assembly.controls.journal.failNext('detach', { kind: 'unavailable' })

    expect(ok(await quiesce(assembly))).toMatchObject({
      kind: 'unresolved',
      remaining: [execution()],
    })
    const kept = await snapshot(assembly)
    expect(kept.state.kind).toBe('waiting')
    expect(kept.executionAttachment).toMatchObject({ generation: '1' })

    expect(ok(await quiesce(assembly))).toMatchObject({ kind: 'drained', remaining: [] })
    expect((await snapshot(assembly)).state.kind).toBe('suspended')
  })

  it('answers the same result to a repeated quiesce', async () => {
    const assembly = await toolAssembly()
    await waitingOnTool(assembly)
    const first = ok(await quiesce(assembly))
    expect(ok(await quiesce(assembly))).toEqual(first)
  })
})

describe('resume of an execution that was handed over', () => {
  it('attaches anew, comes back to the wait, takes the Tool result and goes on to the end', async () => {
    const assembly = await toolAssembly()
    const pending = await waitingOnTool(assembly)
    ok(await quiesce(assembly))
    const next = await successor(assembly)

    const handle = ok(await resumeIn(next))

    expect(handle.execution).toBe(execution())
    // The new coordinator saves the same wait again, under the new attachment.
    await eventually(async () => (await snapshot(assembly)).state.kind === 'waiting')
    const waiting = await snapshot(assembly)
    expect(waiting.executionAttachment).toMatchObject({ generation: '2' })
    expect(waiting.state).toMatchObject({
      kind: 'waiting',
      waits: [{ kind: 'producer', pending: { action: pending.action } }],
    })
    // The call was sent once: the resumed execution waits for the original call.
    expect(assembly.controls.tools.invoke.calls).toHaveLength(1)

    const delivery = toolDelivery(pending, {
      name: 'one',
      content: [textBlock('contents of the file', 'blk_result_one')],
      account: toolAccount(pending, '9'),
    })
    expect(await pushToolResult(toolReceiver(assembly), delivery)).toHaveProperty('ok')
    await deliverModelReply(assembly, [textBlock('done', 'blk_done')], 'final')
    await eventually(async () => (await snapshot(assembly)).state.kind === 'ended')
    expect((await snapshot(assembly)).state).toMatchObject({
      kind: 'ended',
      conclusion: { kind: 'complete' },
    })
  })

  it('takes a result that was received while no runtime held the execution', async () => {
    const assembly = await toolAssembly()
    const pending = await waitingOnTool(assembly)
    ok(await quiesce(assembly))
    const delivery = toolDelivery(pending, {
      name: 'one',
      content: [textBlock('contents of the file', 'blk_result_one')],
      account: toolAccount(pending, '9'),
    })
    expect(await pushToolResult(toolReceiver(assembly), delivery)).toHaveProperty('ok')
    expect((await snapshot(assembly)).state.kind).toBe('suspended')

    ok(await resumeIn(await successor(assembly)))

    await deliverModelReply(assembly, [textBlock('done', 'blk_done')], 'final')
    await eventually(async () => (await snapshot(assembly)).state.kind === 'ended')
    expect(assembly.controls.tools.invoke.calls).toHaveLength(1)
  })

  it('goes on from the wait for a Model call whose result arrived while no runtime held the execution', async () => {
    const assembly = await loopAssembly([execution()])
    ok(await invoke(assembly))
    ok(
      await assembly.provider.control.quiesce({
        ...alice,
        operation: operation('quiesce-1'),
        reason: evidence('stop'),
      }),
    )
    const load = async () => ok(await assembly.dependencies.journal.load(input))
    expect((await load()).state.kind).toBe('suspended')
    // The Model settles its call now: the receiver keeps the result without an attachment.
    assembly.release.open()

    const next = ok(
      await createAgentRuntime(assembly.dependencies, options({ reconciliationDelaysMs: [1000] })),
    )
    ok(await resumeIn(next))

    await eventually(async () => (await load()).state.kind === 'ended')
    expect((await load()).state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
  })

  it('answers changed and keeps its slot free when the execution was not handed over', async () => {
    const assembly = await toolAssembly()
    await waitingOnTool(assembly)
    const next = await successor(assembly)

    expect(failure(await resumeIn(next))).toEqual({ kind: 'changed' })

    // The first runtime still holds the attachment, and the second one is free for another resume.
    expect((await snapshot(assembly)).executionAttachment).toMatchObject({ generation: '1' })
    expect(failure(await resumeIn(next, 'resume-2'))).toEqual({ kind: 'changed' })
  })

  it('answers busy while the slot holds an execution', async () => {
    const assembly = await toolAssembly()
    await waitingOnTool(assembly)
    expect(failure(await resumeIn(assembly.provider))).toEqual({ kind: 'busy' })
  })
})
