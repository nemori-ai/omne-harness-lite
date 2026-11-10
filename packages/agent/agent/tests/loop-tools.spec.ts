import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type {
  AgentEventBody,
  EventPage,
  ExecutionSnapshot,
  Material,
  PendingCall,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail } from '@omne-harness/operation-result'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  type ToolInvokeOutcome,
  type ToolState,
} from '@omne-harness/tool-contract'
import {
  adoption,
  evidence,
  execution,
  ok,
  loadWithEntries,
  type LoadedWithEntries,
} from './journal-support.ts'
import { alice, eventually, invoke } from './loop-support.ts'
import {
  associatedTools,
  deliverModelReply,
  deliverToolSuggestion,
  fixedToolRequest,
  pushToolResult,
  textBlock,
  toolAccount,
  toolAssembly,
  toolCall,
  toolDelivery,
  toolReceiver,
} from './fixtures/tool-call.ts'
import { controlAssembly } from './fixtures/control-assembly.ts'

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
  // Agent keeps the receipt as an original fact and never reads it as the current state, so the
  // test does not build a full ToolState.
  return { kind: 'accepted', reference, state: {} as ToolState, recovered: false }
}

/** Accepts each invoke with a new Tool call, in the order the Tool runtime received them. */
function acceptEach(assembly: Assembly) {
  let count = 0
  assembly.controls.tools.invoke.always(async () => {
    count += 1
    return accepted(`call-${count}`)
  })
}

async function snapshot(assembly: Assembly): Promise<LoadedWithEntries> {
  return await loadWithEntries(assembly.dependencies, input)
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

function toolMessages(bodies: readonly AgentEventBody[]) {
  return bodies.flatMap(body =>
    body.kind === 'message' && body.message.role === 'tool' ? [body.message] : [],
  )
}

async function secondModelCall(assembly: Assembly) {
  await eventually(async () =>
    (await snapshot(assembly)).checkpoint.calls.some(
      call => call.kind === 'model' && call.action.startsWith('step-2/'),
    ),
  )
}

describe('tool action dispatch', () => {
  it('preserves the original request and intent before Tool receives it', async () => {
    const assembly = await toolAssembly()
    const observed: {
      snapshot: ExecutionSnapshot | null
      pending: PendingCall | null
      material: Material<ContentBlock> | null
    } = { snapshot: null, pending: null, material: null }
    assembly.controls.tools.invoke.always(async () => {
      const read = await snapshot(assembly)
      const pending = read.checkpoint.calls.find(call => call.kind === 'tool')
      if (pending === undefined) throw new Error('missing Tool intent')
      const material = ok(
        await assembly.dependencies.materials.read({ ...alice, source: pending.fixed }),
      )
      observed.snapshot = read
      observed.pending = pending
      observed.material = material
      return { kind: 'association-unknown' }
    })
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly)
    await eventually(async () => observed.material !== null)
    expect(observed.pending).toMatchObject({
      association: 'intent',
      position: assembly.controls.tools.invoke.calls[0]?.request.consumer,
    })
    expect(observed.material).toMatchObject({
      kind: 'facts',
      schema: { owner: 'agent', name: 'fixed-tool-request', revision: '1' },
    })
    expect(
      observed.snapshot?.effects.some(effect => effect.pending.action === observed.pending?.action),
    ).toBe(true)
    expect(assembly.controls.tools.invoke.calls[0]?.request.arguments).toEqual({
      original: '{}',
      effective: '{}',
      complete: true,
    })
  })
})

describe('tool result round', () => {
  it('admits the received result as a tool message and sends the next model request', async () => {
    const assembly = await toolAssembly()
    acceptEach(assembly)
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly)
    const [pending] = await associatedTools(assembly, 1)
    if (pending === undefined) throw new Error('no associated Tool call')
    const receiver = toolReceiver(assembly)
    const delivery = toolDelivery(pending, {
      name: 'one',
      content: [textBlock('contents of the file', 'blk_result_one')],
      account: toolAccount(pending, '9'),
    })
    expect(await pushToolResult(receiver, delivery)).toHaveProperty('ok')
    await secondModelCall(assembly)

    const read = await snapshot(assembly)
    // The tool call left the open calls; its received entry still holds content and account.
    expect(read.checkpoint.calls.some(call => call.kind === 'tool')).toBe(false)
    expect(read.checkpoint.batch).toBeNull()
    const received = read.entries?.find(
      entry => entry.kind === 'received' && entry.delivery.producer === 'tool',
    )
    if (received?.kind !== 'received') throw new Error('Tool result not received')
    expect(received.delivery).toMatchObject({ account: { usage: [{ lexeme: '9' }] } })
    const bodies = await events(assembly)
    const [message] = toolMessages(bodies)
    expect(message?.blocks).toEqual([
      expect.objectContaining({ kind: 'tool_result', callId: 'tool-call-1' }),
      expect.objectContaining({ kind: 'text', text: 'contents of the file' }),
    ])
    expect(bodies).toContainEqual(
      expect.objectContaining({
        kind: 'producer',
        result: expect.objectContaining({
          producer: { kind: 'tool', call: 'tcall_call-1' },
          version: 'result-one',
        }),
      }),
    )
    expect(assembly.controls.tools.invoke.calls).toHaveLength(1)

    // The next step ends the execution through the one terminal commit.
    await deliverModelReply(assembly, [textBlock('done', 'blk_done')], 'final')
    await eventually(async () => (await snapshot(assembly)).state.kind === 'ended')
    expect((await snapshot(assembly)).state).toMatchObject({
      kind: 'ended',
      conclusion: { kind: 'complete' },
    })
  })

  it('runs concurrent calls in independent slots and admits their messages in action order', async () => {
    const assembly = await toolAssembly({ toolConcurrency: 2 })
    acceptEach(assembly)
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a'), toolCall('call-b')])
    const [first, second] = await associatedTools(assembly, 2)
    if (first === undefined || second === undefined) throw new Error('calls not associated')
    // Both are in flight before either result arrives.
    expect(assembly.controls.tools.invoke.calls).toHaveLength(2)
    const receiver = toolReceiver(assembly)
    // The second action's result arrives first; it is kept in its own slot at once.
    expect(
      await pushToolResult(
        receiver,
        toolDelivery(second, { name: 'b', content: [textBlock('result b', 'blk_b')] }),
      ),
    ).toHaveProperty('ok')
    await eventually(async () =>
      ((await snapshot(assembly)).checkpoint.batch?.slots ?? []).some(
        slot => slot.kind === 'result' && slot.action === second.action,
      ),
    )
    const waiting = await snapshot(assembly)
    expect(waiting.checkpoint.batch?.slots.find(slot => slot.action === first.action)?.kind).toBe(
      'dispatched',
    )
    expect(toolMessages(await events(assembly))).toEqual([])
    expect(
      await pushToolResult(
        receiver,
        toolDelivery(first, { name: 'a', content: [textBlock('result a', 'blk_a')] }),
      ),
    ).toHaveProperty('ok')
    await secondModelCall(assembly)
    expect(toolMessages(await events(assembly)).map(message => message.blocks[0])).toEqual([
      expect.objectContaining({ callId: 'call-a' }),
      expect.objectContaining({ callId: 'call-b' }),
    ])
  })

  it('waits for a free place of toolConcurrency before sending the next call', async () => {
    const assembly = await toolAssembly({ toolConcurrency: 1 })
    acceptEach(assembly)
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a'), toolCall('call-b')])
    const [first] = await associatedTools(assembly, 1)
    if (first === undefined) throw new Error('first call not associated')
    expect(assembly.controls.tools.invoke.calls).toHaveLength(1)
    const receiver = toolReceiver(assembly)
    ok(await pushToolResult(receiver, toolDelivery(first, { name: 'a' })))
    const [, second] = await associatedTools(assembly, 2)
    if (second === undefined) throw new Error('second call not associated')
    expect(assembly.controls.tools.invoke.calls).toHaveLength(2)
    ok(await pushToolResult(receiver, toolDelivery(second, { name: 'b' })))
    await secondModelCall(assembly)
  })

  it('keeps an association-unknown call as an intent and sends the same request again', async () => {
    const assembly = await toolAssembly()
    let attempts = 0
    assembly.controls.tools.invoke.always(async () => {
      attempts += 1
      return attempts === 1 ? { kind: 'association-unknown' } : accepted('retried')
    })
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly)
    await eventually(async () => {
      const read = await snapshot(assembly)
      return read.state.kind === 'waiting' && read.checkpoint.position === 'A2'
    })
    const unknown = await snapshot(assembly)
    // No slot and no denial: the action stays unresolved with its intent and request.
    expect(unknown.checkpoint.batch?.slots).toEqual([])
    expect(unknown.checkpoint.calls).toEqual([
      expect.objectContaining({ kind: 'tool', association: 'intent' }),
    ])
    // The wait wakes at its check time and A2 repeats the complete original invoke.
    const now = ok(await assembly.dependencies.clock.now())
    ok(assembly.controls.clock.advanceTo(new Date(Date.parse(now) + 2000).toISOString() as never))
    const [pending] = await associatedTools(assembly, 1)
    const requests = assembly.controls.tools.invoke.calls.map(call => call.request)
    expect(requests).toHaveLength(2)
    expect(requests[1]).toEqual(requests[0])
    if (pending === undefined) throw new Error('retried call not associated')
    ok(await pushToolResult(toolReceiver(assembly), toolDelivery(pending, { name: 'retried' })))
    await secondModelCall(assembly)
  })

  // Agent SPEC "依赖不可用时的等待": a rejected invoke whose failure is unavailable did not admit
  // the call and does not refuse the action. A2 waits on the Tool runtime and sends the same
  // request again at the check time; no denied slot is made.
  it('waits on a rejected invoke whose failure is unavailable and sends the same request again', async () => {
    const assembly = await toolAssembly()
    let attempts = 0
    assembly.controls.tools.invoke.always(async () => {
      attempts += 1
      return attempts === 1
        ? {
            kind: 'rejected',
            failure: {
              kind: 'unavailable',
              dependency: 'ledger-store',
              diagnostic: 'storage rejected the commit: queue_full',
            },
          }
        : accepted('after-wait')
    })
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly)
    await eventually(async () => {
      const read = await snapshot(assembly)
      return read.state.kind === 'waiting' && read.checkpoint.position === 'A2'
    })
    const waiting = await snapshot(assembly)
    expect(waiting.state).toEqual({
      kind: 'waiting',
      waits: [{ kind: 'dependency', owner: 'toolRuntime', position: 'A2' }],
    })
    expect(waiting.checkpoint.batch?.slots).toEqual([])
    const now = ok(await assembly.dependencies.clock.now())
    ok(assembly.controls.clock.advanceTo(new Date(Date.parse(now) + 2000).toISOString() as never))
    const [pending] = await associatedTools(assembly, 1)
    const requests = assembly.controls.tools.invoke.calls.map(call => call.request)
    expect(requests).toHaveLength(2)
    expect(requests[1]).toEqual(requests[0])
    if (pending === undefined) throw new Error('the call after the wait is not associated')
    ok(await pushToolResult(toolReceiver(assembly), toolDelivery(pending, { name: 'after-wait' })))
    await secondModelCall(assembly)
  })

  it('denies an action whose first invoke is rejected for good, and does not wait', async () => {
    const assembly = await toolAssembly()
    assembly.controls.tools.invoke.always(async () => ({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'request', reason: 'the arguments do not match' },
    }))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly)
    await eventually(async () =>
      ((await snapshot(assembly)).checkpoint.batch?.slots ?? []).some(
        slot => slot.kind === 'denied',
      ),
    )
    expect((await snapshot(assembly)).state).not.toMatchObject({
      waits: [{ kind: 'dependency', owner: 'toolRuntime' }],
    })
    expect(assembly.controls.tools.invoke.calls).toHaveLength(1)
  })

  // An unavailable answer admitted nothing, so the action still has no accepted or unknown attempt:
  // a definite rejection after the wait denies it like a first one (Agent SPEC "依赖不可用时的
  // 等待", Tool 受理), and the run does not wait on a producer that never comes.
  it('denies an action rejected for good after a wait on an unavailable invoke', async () => {
    const assembly = await toolAssembly()
    let attempts = 0
    assembly.controls.tools.invoke.always(async () => {
      attempts += 1
      return attempts === 1
        ? {
            kind: 'rejected',
            failure: { kind: 'unavailable', dependency: 'ledger-store', diagnostic: 'queue_full' },
          }
        : {
            kind: 'rejected',
            failure: { kind: 'invalid', field: 'request', reason: 'the arguments do not match' },
          }
    })
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly)
    await eventually(async () => {
      const read = await snapshot(assembly)
      return read.state.kind === 'waiting' && read.checkpoint.position === 'A2'
    })
    const now = ok(await assembly.dependencies.clock.now())
    ok(assembly.controls.clock.advanceTo(new Date(Date.parse(now) + 2000).toISOString() as never))
    await eventually(async () =>
      ((await snapshot(assembly)).checkpoint.batch?.slots ?? []).some(
        slot => slot.kind === 'denied',
      ),
    )
    expect(assembly.controls.tools.invoke.calls).toHaveLength(2)
  })

  // The same holds when the attempt is not made at all: after the intent is saved, a dependency
  // that A2 reads before invoke answers unavailable once (#1174 review round 2).
  for (const port of ['materials', 'journal'] as const)
    it(`denies an action rejected for good after ${port} was unavailable before its first invoke`, async () => {
      let intentSaved = false
      let refused = 0
      const refuse = () => {
        if (!intentSaved || refused > 0) return null
        refused += 1
        return fail({ kind: 'unavailable' as const, owner: port, diagnostic: 'queue_full' })
      }
      const assembly = await controlAssembly({}, d => ({
        ...d,
        toolRequests: {
          async describe() {
            return { ok: { kind: 'tool', definition: adoption('read_file') } }
          },
          async prepare(input) {
            return { ok: fixedToolRequest(input.consumer) }
          },
        },
        journal: {
          ...d.journal,
          async commit(input) {
            const committed = await d.journal.commit(input)
            if ('ok' in committed && input.effects.some(effect => effect.pending.kind === 'tool'))
              intentSaved = true
            return committed
          },
          async load(input) {
            return (port === 'journal' ? refuse() : null) ?? d.journal.load(input)
          },
        },
        materials: {
          ...d.materials,
          async read(input) {
            return (port === 'materials' ? refuse() : null) ?? d.materials.read(input)
          },
        },
      }))
      assembly.controls.tools.invoke.always(async () => ({
        kind: 'rejected',
        failure: { kind: 'invalid', field: 'request', reason: 'the arguments do not match' },
      }))
      ok(await invoke(assembly))
      await deliverToolSuggestion(assembly)
      await eventually(async () => {
        if (refused === 0) return false
        const now = ok(await assembly.dependencies.clock.now())
        ok(
          assembly.controls.clock.advanceTo(
            new Date(Date.parse(now) + 2000).toISOString() as never,
          ),
        )
        return ((await snapshot(assembly)).checkpoint.batch?.slots ?? []).some(
          slot => slot.kind === 'denied',
        )
      })
      expect(assembly.controls.tools.invoke.calls).toHaveLength(1)
    })

  it('admits a denial message for each action when the whole batch is denied', async () => {
    const assembly = await toolAssembly()
    assembly.controls.admission.admit.always(() => ({
      ok: { kind: 'deny', evidence: evidence('denied-by-policy'), reason: 'policy' },
    }))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a'), toolCall('call-b')])
    await secondModelCall(assembly)
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
    expect(toolMessages(await events(assembly)).map(message => message.blocks[0])).toEqual([
      expect.objectContaining({ callId: 'call-a' }),
      expect.objectContaining({ callId: 'call-b' }),
    ])
  })

  it('denies the whole batch when the admission answers unavailable, and the run goes on', async () => {
    const assembly = await toolAssembly()
    acceptEach(assembly)
    assembly.controls.admission.admit.always(() => ({
      ok: { kind: 'unavailable', diagnostic: 'no action rule matches this action' },
    }))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a'), toolCall('call-b')])
    await secondModelCall(assembly)
    // No later chain calls admit after the unavailable answer, and nothing reaches Tool.
    expect(assembly.controls.admission.admit.calls).toHaveLength(1)
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
    expect(toolMessages(await events(assembly)).map(message => message.blocks[0])).toEqual([
      expect.objectContaining({ callId: 'call-a' }),
      expect.objectContaining({ callId: 'call-b' }),
    ])
  })

  it('does not release an action allowed earlier in a batch whose later admission is unavailable', async () => {
    const assembly = await toolAssembly()
    acceptEach(assembly)
    assembly.controls.admission.admit.once(() => ({
      ok: { kind: 'allow', evidence: evidence('allowed-first') },
    }))
    assembly.controls.admission.admit.always(() => ({
      ok: { kind: 'unavailable', diagnostic: 'rule source down' },
    }))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a'), toolCall('call-b')])
    await secondModelCall(assembly)
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
    expect(toolMessages(await events(assembly))).toHaveLength(2)
  })

  it('reads a denied Failure of the admission port as unavailable and denies the batch', async () => {
    const assembly = await toolAssembly()
    acceptEach(assembly)
    assembly.controls.admission.admit.always(() => ({
      failure: { kind: 'denied', action: 'admit-action' },
    }))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a')])
    await secondModelCall(assembly)
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
    expect(toolMessages(await events(assembly))).toHaveLength(1)
  })

  it('denies the batch when the trusted Tool request source cannot describe the action', async () => {
    const assembly = await toolAssembly(
      {},
      {},
      {
        async describe() {
          return {
            failure: { kind: 'unavailable', owner: 'agentToolRequests', diagnostic: 'down' },
          }
        },
      },
    )
    acceptEach(assembly)
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a')])
    await secondModelCall(assembly)
    expect(assembly.controls.admission.admit.calls).toHaveLength(0)
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
    expect(toolMessages(await events(assembly))).toHaveLength(1)
  })

  it('denies only an action the source answered, and the model reads the answer as its result', async () => {
    const answer = 'Files: there is no command "nope".\nCall with {"command": <name>, …}'
    const assembly = await toolAssembly(
      {},
      {},
      {
        async describe(request) {
          return request.original.callId === 'call-a'
            ? { ok: { kind: 'answered', text: answer } }
            : { ok: { kind: 'tool', definition: adoption('read_file') } }
        },
      },
    )
    acceptEach(assembly)
    assembly.controls.admission.admit.always(() => ({
      ok: { kind: 'allow', evidence: evidence('allowed') },
    }))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a'), toolCall('call-b')])
    const [called] = await associatedTools(assembly, 1)
    if (called === undefined) throw new Error('call-b not associated')
    // The answered action is not admitted or sent; the other action of the batch runs.
    expect(assembly.controls.admission.admit.calls).toHaveLength(1)
    expect(assembly.controls.tools.invoke.calls).toHaveLength(1)
    const [denied] = (await snapshot(assembly)).checkpoint.batch?.actions ?? []
    expect(denied?.judgment).toMatchObject({
      kind: 'denied',
      evidence: { record: expect.stringMatching(/\/answered$/) },
      answer: expect.anything(),
    })
    // The answer is preserved under an identity that names its text, so another text is another material.
    const digest = createHash('sha256').update(answer).digest('hex')
    expect(
      assembly.controls.materials.preserve.calls
        .map(call => call.identity)
        .filter(identity => identity.includes('/answer/')),
    ).toEqual([expect.stringMatching(new RegExp(`/answer/${digest}$`))])
    expect(
      await pushToolResult(
        toolReceiver(assembly),
        toolDelivery(called, { name: 'b', content: [textBlock('result b', 'blk_b')] }),
      ),
    ).toHaveProperty('ok')
    await secondModelCall(assembly)
    const [first, second] = toolMessages(await events(assembly))
    expect(first?.blocks).toEqual([
      expect.objectContaining({ kind: 'tool_result', callId: 'call-a' }),
      expect.objectContaining({ kind: 'text', text: answer }),
    ])
    expect(second?.blocks[0]).toEqual(expect.objectContaining({ callId: 'call-b' }))
  })

  it('answers every action of a batch the source answered, through the all-denied barrier', async () => {
    const assembly = await toolAssembly(
      {},
      {},
      {
        async describe(request) {
          return { ok: { kind: 'answered', text: `guide for ${request.original.callId}` } }
        },
      },
    )
    acceptEach(assembly)
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a'), toolCall('call-b')])
    await secondModelCall(assembly)
    expect(assembly.controls.admission.admit.calls).toHaveLength(0)
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
    expect(toolMessages(await events(assembly)).map(message => message.blocks[1])).toEqual([
      expect.objectContaining({ kind: 'text', text: 'guide for call-a' }),
      expect.objectContaining({ kind: 'text', text: 'guide for call-b' }),
    ])
  })

  it('denies the batch when the source refuses to prepare an allowed action', async () => {
    const assembly = await toolAssembly(
      {},
      {},
      {
        async prepare() {
          return { failure: { kind: 'denied', action: 'tool-request' } }
        },
      },
    )
    acceptEach(assembly)
    assembly.controls.admission.admit.always(() => ({
      ok: { kind: 'allow', evidence: evidence('allowed') },
    }))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a')])
    await secondModelCall(assembly)
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
    expect(toolMessages(await events(assembly))).toHaveLength(1)
  })

  it('denies the batch when the assembly gave no trusted Tool request source', async () => {
    const assembly = await toolAssembly({}, {}, null)
    acceptEach(assembly)
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a')])
    await secondModelCall(assembly)
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
    expect(toolMessages(await events(assembly))).toHaveLength(1)
  })

  it('makes a rejected tool message a failure candidate of the execution', async () => {
    const assembly = await toolAssembly()
    acceptEach(assembly)
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly)
    const [pending] = await associatedTools(assembly, 1)
    if (pending === undefined) throw new Error('no associated Tool call')
    assembly.controls.handoff.prepare.always(input => {
      const { principal: _principal, tenant: _tenant, ...rest } = input
      return {
        ok: {
          request: rest.request,
          origin: null,
          provider: { owner: 'test', name: 'handoff', revision: '1', digest: 'test:handoff/1' },
          qualification: evidence('qualification'),
          record: evidence('handoff-record'),
          decision: { kind: 'rejected', reason: 'too-large', evidence: evidence('too-large') },
        },
      }
    })
    ok(await pushToolResult(toolReceiver(assembly), toolDelivery(pending, { name: 'one' })))
    await eventually(async () => (await snapshot(assembly)).state.kind === 'ended')
    expect((await snapshot(assembly)).state).toMatchObject({
      kind: 'ended',
      conclusion: { kind: 'fail' },
    })
    expect(toolMessages(await events(assembly))).toEqual([])
  })
})

/** One tool round, up to the second Model call, on an assembly with the given joint commits. */
async function toolRound(
  jointCommits: readonly ('message' | 'context-transition')[],
  participants: readonly ('message' | 'context-transition')[],
) {
  const assembly = await toolAssembly({ jointCommits }, { participants })
  acceptEach(assembly)
  ok(await invoke(assembly))
  await deliverToolSuggestion(assembly)
  const [pending] = await associatedTools(assembly, 1)
  if (pending === undefined) throw new Error('no associated Tool call')
  ok(await pushToolResult(toolReceiver(assembly), toolDelivery(pending, { name: 'one' })))
  await secondModelCall(assembly)
  return assembly
}

/** The handoff records of one source kind, each with the Ja that published its history. */
/** The committed H of `source`, closed ones included: the snapshot lists the open records only. */
function published(assembly: Assembly, source: 'tool-result' | 'model-reply') {
  const records = assembly.controls.journal.handoffRecords({
    tenant: alice.tenant,
    execution: input.execution,
  })
  return records.flatMap(record =>
    record.request.kind === 'execution' &&
    record.request.source.kind === source &&
    record.resolution?.kind === 'recorded' &&
    record.history.kind === 'committed'
      ? [{ outcome: record.resolution.outcome, operation: record.history.operation }]
      : [],
  )
}

// SPEC "真实历史的提交点": with the kind declared, T5 hands its message to the participant; without
// it, the caller is none. The main reply is never a CallerCommit.
describe('the caller commit of a source Ja', () => {
  it('hands the tool message to the declared message participant in the same commit', async () => {
    const assembly = await toolRound(['message'], ['message'])
    const [tool] = published(assembly, 'tool-result')
    if (tool === undefined) throw new Error('tool message not published')
    const decision = tool.outcome.decision
    if (decision.kind !== 'prepared') throw new Error('tool message not prepared')
    expect(assembly.controls.journal.joint()).toEqual([
      {
        execution: input.execution,
        operation: tool.operation,
        caller: {
          kind: 'message',
          message: decision.message,
          source: tool.outcome.record,
          admission: decision.admission,
        },
      },
    ])
  })

  it('commits the tool message with caller none when the assembly did not declare message', async () => {
    // The Journal binding offers the participant, but the factory configuration does not use it.
    const assembly = await toolRound([], ['message'])
    expect(published(assembly, 'tool-result')).toHaveLength(1)
    expect(assembly.controls.journal.joint()).toEqual([])
  })

  it('keeps the main reply at caller none when message is declared', async () => {
    const assembly = await toolRound(['message'], ['message'])
    await deliverModelReply(assembly, [textBlock('done', 'blk_done')], 'final')
    await eventually(async () => (await snapshot(assembly)).state.kind === 'ended')
    const replies = published(assembly, 'model-reply')
    expect(replies).toHaveLength(2)
    const operations = assembly.controls.journal.joint().map(fact => fact.operation)
    for (const reply of replies) expect(operations).not.toContain(reply.operation)
  })
})
