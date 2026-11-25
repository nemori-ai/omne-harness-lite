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
  acceptedInput,
  evidence,
  execution,
  failure,
  loadWithEntries,
  ok,
  operation,
} from './journal-support.ts'
import { alice, eventually, invoke, shown } from './loop-support.ts'
import {
  associatedTools,
  deliverModelReply,
  deliverToolSuggestion,
  textBlock,
  toolAssembly,
} from './fixtures/tool-call.ts'

type Assembly = Awaited<ReturnType<typeof toolAssembly>>
type Runtime = Assembly['provider']

const input = { ...alice, execution: execution() }

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

/** A Tool assembly that counts the Model calls it admits. */
async function counted(): Promise<Readonly<{ assembly: Assembly; admitted: () => number }>> {
  let admitted = 0
  const assembly = await toolAssembly({}, {}, {}, dependencies => ({
    ...dependencies,
    models: {
      ...dependencies.models,
      calls: {
        ...dependencies.models.calls,
        admit: async call => {
          admitted += 1
          return dependencies.models.calls.admit(call)
        },
      },
    },
  }))
  assembly.controls.tools.invoke.always(async () => accepted('call-1'))
  return { assembly, admitted: () => admitted }
}

const snapshot = (assembly: Assembly) => loadWithEntries(assembly.dependencies, input)

const handOver = (runtime: Runtime, name = 'handover-1') =>
  runtime.control.handOver({ ...input, operation: operation(name), reason: evidence('reload') })

async function waitingOnTool(assembly: Assembly): Promise<void> {
  ok(await invoke(assembly))
  await deliverToolSuggestion(assembly)
  await associatedTools(assembly, 1)
  await eventually(async () => (await snapshot(assembly)).state.kind === 'waiting')
}

/** Lets the runtime run what it can now, so a request it holds would have been answered. */
async function quiet(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await new Promise(settle => setTimeout(settle, 5))
}

describe('a handover the session asks for, for a reload', () => {
  it('asleep on a saved wait for a Tool: hands over at once, keeps the call and frees the slot', async () => {
    const { assembly } = await counted()
    await waitingOnTool(assembly)
    const before = await snapshot(assembly)

    const handed = ok(await handOver(assembly.provider))

    const after = await snapshot(assembly)
    expect(after.state).toEqual({ kind: 'suspended', handoff: handed })
    expect(after.checkpoint).toEqual(before.checkpoint)
    expect(assembly.controls.tools.commands.control.calls).toEqual([])
    expect((await shown(assembly)).kind).toBe('idle')
  })

  it('in the middle of a step: keeps the request while the Model is asked, and hands over at the Tool wait after it', async () => {
    const { assembly, admitted } = await counted()
    ok(await invoke(assembly))
    let answered = false
    const asked = handOver(assembly.provider).finally(() => (answered = true))
    await quiet()
    expect(answered).toBe(false)
    expect((await snapshot(assembly)).state.kind).not.toBe('suspended')

    await deliverToolSuggestion(assembly)
    const handed = ok(await asked)

    expect((await snapshot(assembly)).state).toEqual({ kind: 'suspended', handoff: handed })
    expect(admitted()).toBe(1)
    expect(assembly.controls.tools.invoke.calls).toHaveLength(1)
  })

  it('between two steps: hands over after the evaluation takes the next input, before the next Model call', async () => {
    const { assembly, admitted } = await counted()
    const handle = ok(await invoke(assembly))
    const asked = handOver(assembly.provider)
    ok(
      await handle.input.submit({
        ...input,
        operation: operation('submit-2'),
        value: acceptedInput('input-2', 'and one more thing'),
      }),
    )

    await deliverModelReply(assembly, [textBlock('first answer', 'blk_first')], 'first')
    const handed = ok(await asked)

    const after = await snapshot(assembly)
    expect(after.state).toEqual({ kind: 'suspended', handoff: handed })
    expect(after.checkpoint.position).toBe('I0')
    expect(admitted()).toBe(1)
  })

  it('while the run ends: refuses, the run is ending, and it ends as it would', async () => {
    const { assembly } = await counted()
    ok(await invoke(assembly))
    const asked = handOver(assembly.provider)

    await deliverModelReply(assembly, [textBlock('done', 'blk_done')], 'final')

    expect(failure(await asked)).toEqual({ kind: 'terminal' })
    await eventually(async () => (await snapshot(assembly)).state.kind === 'ended')
  })

  it('refuses a runtime that does not drive the execution: not the current advancer', async () => {
    const { assembly } = await counted()
    await waitingOnTool(assembly)
    const other = ok(
      await createAgentRuntime(assembly.dependencies, options({ reconciliationDelaysMs: [1000] })),
    )
    expect(failure(await handOver(other))).toEqual({ kind: 'stale-advance' })

    ok(await handOver(assembly.provider))
    expect(failure(await handOver(assembly.provider, 'handover-2'))).toEqual({
      kind: 'stale-advance',
    })
  })

  it('joins a repeat of the same request and answers another one busy', async () => {
    const { assembly } = await counted()
    ok(await invoke(assembly))
    const first = handOver(assembly.provider)
    const again = handOver(assembly.provider)
    expect(failure(await handOver(assembly.provider, 'handover-2'))).toEqual({ kind: 'busy' })

    await deliverToolSuggestion(assembly)
    const handed = ok(await first)
    expect(ok(await again)).toEqual(handed)
  })

  it('answers the failure when the Journal does not take the handover between two steps, and the run goes on to the next step', async () => {
    const { assembly, admitted } = await counted()
    const handle = ok(await invoke(assembly))
    const asked = handOver(assembly.provider)
    ok(
      await handle.input.submit({
        ...input,
        operation: operation('submit-2'),
        value: acceptedInput('input-2', 'and one more thing'),
      }),
    )
    assembly.controls.journal.failNext('detach', { kind: 'unavailable' })

    await deliverModelReply(assembly, [textBlock('first answer', 'blk_first')], 'first')

    expect(failure(await asked)).toMatchObject({ kind: 'unavailable' })
    await eventually(async () => admitted() === 2)
    expect((await snapshot(assembly)).state.kind).not.toBe('suspended')
  })

  it('answers the failure when the Journal does not take the handover, and the run keeps waiting', async () => {
    const { assembly } = await counted()
    await waitingOnTool(assembly)
    assembly.controls.journal.failNext('detach', { kind: 'unavailable' })

    expect(failure(await handOver(assembly.provider))).toMatchObject({ kind: 'unavailable' })
    expect((await snapshot(assembly)).state.kind).toBe('waiting')

    const handed = ok(await handOver(assembly.provider, 'handover-2'))
    expect((await snapshot(assembly)).state).toEqual({ kind: 'suspended', handoff: handed })
  })
})
