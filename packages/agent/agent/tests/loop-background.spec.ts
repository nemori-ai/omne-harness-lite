import { describe, expect, it } from 'vitest'
import type { AgentEventBody, EventPage } from '@omne-harness/agent-contract'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  type ToolInvokeOutcome,
  type ToolState,
} from '@omne-harness/tool-contract'
import { decodeAgentToolDeliveryMaterial } from '@omne-harness/agent'
import { toolDeliveryMaterial } from '../src/tool-receiving-material.ts'
import { execution, loadWithEntries, ok } from './journal-support.ts'
import { alice, eventually, invoke } from './loop-support.ts'
import {
  associatedTools,
  deliverModelReply,
  deliverToolSuggestion,
  pushToolResult,
  textBlock,
  toolAssembly,
  toolDelivery,
  toolPlaceholder,
  toolReceiver,
} from './fixtures/tool-call.ts'

type Assembly = Awaited<ReturnType<typeof toolAssembly>>

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

async function events(assembly: Assembly): Promise<readonly AgentEventBody[]> {
  const bodies: AgentEventBody[] = []
  let after: string | null = null
  for (;;) {
    const page: EventPage = ok(
      await assembly.dependencies.journal.output.read({ ...input, after, limit: 100 }),
    )
    if (page.kind !== 'page') throw new Error('event gap')
    bodies.push(...page.events.map(event => event.body))
    if (page.caughtUp || page.events.length === 0) return bodies
    after = page.next
  }
}

const toolMessages = (bodies: readonly AgentEventBody[]) =>
  bodies.flatMap(body =>
    body.kind === 'message' && body.message.role === 'tool' ? [body.message] : [],
  )

const modelCalls = async (assembly: Assembly) =>
  (await loadWithEntries(assembly.dependencies, input)).checkpoint.calls.filter(
    call => call.kind === 'model',
  )

async function backgrounded(source?: Parameters<typeof toolPlaceholder>[1]) {
  const assembly = await toolAssembly()
  assembly.controls.tools.invoke.always(async () => accepted('call-1'))
  ok(await invoke(assembly))
  await deliverToolSuggestion(assembly)
  const [pending] = await associatedTools(assembly, 1)
  if (pending === undefined) throw new Error('no associated Tool call')
  const receiver = toolReceiver(assembly)
  expect(await pushToolResult(receiver, toolPlaceholder(pending, source))).toHaveProperty('ok')
  await eventually(async () =>
    (await modelCalls(assembly)).some(call => call.action.startsWith('step-2/')),
  )
  return { assembly, pending, receiver }
}

describe('a Tool call moved to the background', () => {
  it('fills the slot with the placeholder, leaves the wait, writes a placeholder message and asks the model again', async () => {
    const { assembly } = await backgrounded()
    const read = await loadWithEntries(assembly.dependencies, input)
    expect(read.checkpoint.calls.some(call => call.kind === 'tool')).toBe(false)
    const bodies = await events(assembly)
    const [message] = toolMessages(bodies)
    expect(message?.blocks).toEqual([
      expect.objectContaining({ kind: 'tool_result', callId: 'tool-call-1' }),
      expect.objectContaining({ kind: 'text', text: expect.stringContaining('tcall_call-1') }),
    ])
    expect(bodies).toContainEqual(
      expect.objectContaining({
        kind: 'producer',
        result: expect.objectContaining({
          producer: { kind: 'tool', call: 'tcall_call-1' },
          version: 'placeholder',
        }),
      }),
    )
    expect(assembly.controls.tools.invoke.calls).toHaveLength(1)
    const sources = assembly.controls.journal
      .handoffRecords({ tenant: alice.tenant, execution: input.execution })
      .flatMap(record => (record.request.kind === 'execution' ? [record.request.source] : []))
    expect(sources).toContainEqual(
      expect.objectContaining({
        kind: 'tool-result',
        call: 'tcall_call-1',
        result: expect.objectContaining({ version: 'placeholder' }),
      }),
    )
  })

  it.each([
    [{ kind: 'launched' } as const, 'started in the background'],
    [
      { kind: 'control', operation: ok(decodeToolOperationId('top_move')) } as const,
      'moved to the background',
    ],
    [{ kind: 'threshold' } as const, 'moved to the background'],
    [{ kind: 'foreground-limit' } as const, 'foreground time limit'],
  ])(
    'states the reason of a %j placeholder and that the outcome comes later',
    async (source, reason) => {
      const { assembly } = await backgrounded(source)
      const [message] = toolMessages(await events(assembly))
      const text = message?.blocks.find(block => block.kind === 'text')
      expect(text).toMatchObject({ text: expect.stringContaining(reason) })
      expect(text).toMatchObject({ text: expect.stringContaining('system reminder') })
    },
  )

  it('keeps the final result that arrives later and changes nothing in the run', async () => {
    const { assembly, pending, receiver } = await backgrounded()
    const before = await loadWithEntries(assembly.dependencies, input)
    const final = toolDelivery(pending, { name: 'one', content: [textBlock('built', 'blk_built')] })
    expect(await pushToolResult(receiver, final)).toHaveProperty('ok')
    const after = await loadWithEntries(assembly.dependencies, input)
    expect(after.checkpoint).toEqual(before.checkpoint)
    expect(toolMessages(await events(assembly))).toHaveLength(1)
    expect(
      after.entries?.filter(
        entry =>
          entry.kind === 'received' &&
          entry.delivery.producer === 'tool' &&
          entry.delivery.key.kind === 'result',
      ),
    ).toHaveLength(1)
  })

  it('keeps the label of the placeholder as given, and the message does not show it (C4)', async () => {
    const { assembly, pending } = await backgrounded()
    const placeholder = toolPlaceholder(pending)
    const kept = decodeAgentToolDeliveryMaterial(toolDeliveryMaterial(alice, placeholder))
    expect(kept?.delivery).toEqual(placeholder)
    const broken = { ...placeholder, label: { ...placeholder.label, intent: 'one\ntwo' } }
    expect(decodeAgentToolDeliveryMaterial(toolDeliveryMaterial(alice, broken))).toBeNull()
    const [message] = toolMessages(await events(assembly))
    expect(JSON.stringify(message)).not.toContain('wait for the build')
  })

  it('keeps the final result that arrives after the run ended', async () => {
    const { assembly, pending, receiver } = await backgrounded()
    await deliverModelReply(assembly, [textBlock('done for now', 'blk_done')], 'final')
    await eventually(
      async () => (await loadWithEntries(assembly.dependencies, input)).state.kind === 'ended',
    )
    const final = toolDelivery(pending, { name: 'one', content: [textBlock('built', 'blk_built')] })
    expect(await pushToolResult(receiver, final)).toHaveProperty('ok')
    const ended = await loadWithEntries(assembly.dependencies, input)
    expect(ended.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    expect(toolMessages(await events(assembly))).toHaveLength(1)
  })
})
