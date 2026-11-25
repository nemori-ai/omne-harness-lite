import { testToolDefinition } from '@omne-harness/agent/testing'
import { describe, expect, it } from 'vitest'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  type ToolInvokeOutcome,
  type ToolState,
} from '@omne-harness/tool-contract'
import { adoption, evidence, execution, loadWithEntries, ok, operation } from './journal-support.ts'
import { alice, eventually, invoke } from './loop-support.ts'
import {
  deliverToolSuggestion,
  pushToolResult,
  toolAssembly,
  toolCall,
  toolDelivery,
  toolPlaceholder,
  toolReceiver,
} from './fixtures/tool-call.ts'

type Assembly = Awaited<ReturnType<typeof toolAssembly>>

const input = { ...alice, execution: execution() }

// AG-33. A call whose id starts with "read" may run beside the others; "ask" is answered by the source.
async function ordered(calls: readonly string[]) {
  const assembly = await toolAssembly(
    { toolConcurrency: 8 },
    {},
    {
      async describe({ original }) {
        if (original.callId.startsWith('ask'))
          return { ok: { kind: 'answered', text: 'not a command' } }
        const definition = testToolDefinition(adoption('read_file'))
        return original.callId.startsWith('read')
          ? { ok: { kind: 'tool', definition, concurrent: true } }
          : { ok: { kind: 'tool', definition } }
      },
    },
  )
  let count = 0
  assembly.controls.tools.invoke.always(async (): Promise<ToolInvokeOutcome> => {
    count += 1
    const reference = ok(
      encodeToolInvocationRef({
        tenant: alice.tenant,
        call: ok(decodeToolCallId(`tcall_call-${count}`)),
        admission: ok(decodeToolOperationId(`top_call-${count}`)),
      }),
    )
    return { kind: 'accepted', reference, state: {} as ToolState, recovered: false }
  })
  const handle = ok(await invoke(assembly))
  await deliverToolSuggestion(
    assembly,
    calls.map(call => toolCall(call)),
  )
  return { assembly, handle, receiver: toolReceiver(assembly) }
}

const batchOf = async (assembly: Assembly) =>
  (await loadWithEntries(assembly.dependencies, input)).checkpoint.batch

/** The call ids whose Tool call is associated, once exactly these are; the batch is then at rest. */
async function sent(assembly: Assembly, expected: readonly string[]) {
  const associated = async () =>
    ((await batchOf(assembly))?.actions ?? []).flatMap(action =>
      action.call?.kind === 'tool' && action.call.association === 'associated'
        ? [{ id: action.original.callId, call: action.call }]
        : [],
    )
  await eventually(async () => (await associated()).length >= expected.length)
  const found = await associated()
  expect(found.map(entry => entry.id)).toEqual(expected)
  expect(assembly.controls.tools.invoke.calls).toHaveLength(expected.length)
  return new Map(found.map(entry => [entry.id, entry.call]))
}

async function filled(assembly: Assembly, callId: string) {
  await eventually(async () => {
    const batch = await batchOf(assembly)
    const action = batch?.actions.find(entry => entry.original.callId === callId)
    const slot = batch?.slots.find(entry => entry.action === action?.id)
    return batch === null || (slot !== undefined && slot.kind !== 'dispatched')
  })
}

describe('the order of the allowed actions of one batch', () => {
  it('sends an action with effects only after the one before it has its result', async () => {
    const { assembly, receiver } = await ordered(['write-a', 'write-b'])
    const first = await sent(assembly, ['write-a'])
    ok(await pushToolResult(receiver, toolDelivery(first.get('write-a')!, { name: 'a' })))
    await filled(assembly, 'write-a')
    const both = await sent(assembly, ['write-a', 'write-b'])
    const requests = assembly.controls.tools.invoke.calls.map(call => call.request)
    expect(requests.map(request => request.limits.scopeBudget)).toEqual([8, 8])
    expect(both.size).toBe(2)
  })

  it('sends read-only actions together, an action with effects after all before it, and a read-only one after it only once it is filled', async () => {
    const { assembly, receiver } = await ordered(['read-1', 'read-2', 'write', 'read-3'])
    const reads = await sent(assembly, ['read-1', 'read-2'])
    ok(await pushToolResult(receiver, toolDelivery(reads.get('read-2')!, { name: 'r2' })))
    await filled(assembly, 'read-2')
    await sent(assembly, ['read-1', 'read-2'])
    ok(await pushToolResult(receiver, toolDelivery(reads.get('read-1')!, { name: 'r1' })))
    await filled(assembly, 'read-1')
    const third = await sent(assembly, ['read-1', 'read-2', 'write'])
    ok(await pushToolResult(receiver, toolDelivery(third.get('write')!, { name: 'w' })))
    await filled(assembly, 'write')
    await sent(assembly, ['read-1', 'read-2', 'write', 'read-3'])
  })

  it('takes a background placeholder as a filled slot', async () => {
    const { assembly, receiver } = await ordered(['write-a', 'write-b'])
    const first = await sent(assembly, ['write-a'])
    ok(await pushToolResult(receiver, toolPlaceholder(first.get('write-a')!)))
    await filled(assembly, 'write-a')
    await sent(assembly, ['write-a', 'write-b'])
  })

  it('does not hold an action behind one that was not allowed', async () => {
    const { assembly } = await ordered(['ask', 'write'])
    await sent(assembly, ['write'])
  })

  it('leaves an action that was never sent without an intent when the run is cancelled', async () => {
    const { assembly, handle, receiver } = await ordered(['write-a', 'write-b'])
    const first = await sent(assembly, ['write-a'])
    ok(
      await handle.control.control({
        ...input,
        operation: operation('cancel-issued'),
        command: { kind: 'cancel', reason: evidence('cancel-issued') },
      }),
    )
    ok(await pushToolResult(receiver, toolDelivery(first.get('write-a')!, { name: 'a' })))
    await eventually(
      async () => (await loadWithEntries(assembly.dependencies, input)).state.kind === 'ended',
    )
    expect(assembly.controls.tools.invoke.calls).toHaveLength(1)
  })
})
