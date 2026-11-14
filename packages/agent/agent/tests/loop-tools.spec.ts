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
  return { kind: 'accepted', reference, state: {} as ToolState, recovered: false }
}

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

async function denied(assembly: Assembly): Promise<boolean> {
  const slots = (await snapshot(assembly)).checkpoint.batch?.slots ?? []
  return (
    slots.some(slot => slot.kind === 'denied') || toolMessages(await events(assembly)).length > 0
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
    expect(assembly.controls.tools.invoke.calls).toHaveLength(2)
    const receiver = toolReceiver(assembly)
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

  it('sends every allowed action in the original order, with toolConcurrency as the scope budget', async () => {
    const assembly = await toolAssembly({ toolConcurrency: 1 })
    acceptEach(assembly)
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [
      toolCall('call-a'),
      toolCall('call-b'),
      toolCall('call-c'),
    ])
    const sent = await associatedTools(assembly, 3)
    const requests = assembly.controls.tools.invoke.calls.map(call => call.request)
    expect(requests.map(request => request.consumer)).toEqual(sent.map(call => call.position))
    for (const request of requests) {
      expect(request.limits.scopeBudget).toBe(1)
      expect(request.scope).toEqual({
        owner: 'test-scope',
        key: 'one',
        grant: evidence('scope-grant'),
      })
    }
    const receiver = toolReceiver(assembly)
    for (const [index, call] of sent.entries())
      ok(await pushToolResult(receiver, toolDelivery(call, { name: `r${index}` })))
    await secondModelCall(assembly)
    expect(toolMessages(await events(assembly)).map(message => message.blocks[0])).toEqual([
      expect.objectContaining({ callId: 'call-a' }),
      expect.objectContaining({ callId: 'call-b' }),
      expect.objectContaining({ callId: 'call-c' }),
    ])
  })

  it('commits nothing when a wake finds the Tool calls still open (D-104)', async () => {
    const assembly = await toolAssembly({ toolConcurrency: 1, reconciliationDelaysMs: [0] })
    let attempts = 0
    assembly.controls.tools.invoke.always(async () => {
      attempts += 1
      return attempts === 1 ? accepted('a') : { kind: 'association-unknown' }
    })
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a'), toolCall('call-b')])
    await eventually(async () => assembly.controls.tools.invoke.calls.length >= 3)
    const before = await snapshot(assembly)
    expect(before.state.kind).toBe('waiting')
    const seen = assembly.controls.tools.invoke.calls.length
    await eventually(async () => assembly.controls.tools.invoke.calls.length >= seen + 2)
    const after = await snapshot(assembly)
    expect(after.revision).toBe(before.revision)
    expect(after.checkpoint).toEqual(before.checkpoint)
    const [, first, again] = assembly.controls.tools.invoke.calls.map(call => call.request)
    expect(again).toEqual(first)
    expect(again?.limits.scopeBudget).toBe(1)
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
    expect(unknown.checkpoint.batch?.slots).toEqual([])
    expect(unknown.checkpoint.calls).toEqual([
      expect.objectContaining({ kind: 'tool', association: 'intent' }),
    ])
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
    await eventually(async () => await denied(assembly))
    expect((await snapshot(assembly)).state).not.toMatchObject({
      waits: [{ kind: 'dependency', owner: 'toolRuntime' }],
    })
    expect(assembly.controls.tools.invoke.calls).toHaveLength(1)
  })

  it('ends the run as complete after the Tool refused an action for good', async () => {
    const assembly = await toolAssembly()
    assembly.controls.tools.invoke.always(async () => ({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'request', reason: 'the arguments do not match' },
    }))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly)
    await secondModelCall(assembly)
    await deliverModelReply(assembly, [textBlock('after the denial')], 'final')
    await eventually(async () => (await snapshot(assembly)).state.kind !== 'waiting')
    await eventually(async () => (await snapshot(assembly)).state.kind === 'ended').catch(() => {})
    const after = await snapshot(assembly)
    expect(after.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    expect(after.checkpoint.voided).toEqual([
      {
        kind: 'tool',
        step: 'step-1',
        action: 'step-1/tool/0',
        cause: 'not-accepted',
        basis: expect.objectContaining({ record: 'exec-1/step-1/tool/0/rejected' }),
      },
    ])
  })

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
    await eventually(async () => await denied(assembly))
    expect(assembly.controls.tools.invoke.calls).toHaveLength(2)
  })

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
        return await denied(assembly)
      })
      expect(assembly.controls.tools.invoke.calls).toHaveLength(1)
    })

  it('denies an action whose denied slot could not be saved at first', async () => {
    let refused = 0
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
          const denies = (input.checkpoint?.batch?.slots ?? []).some(slot => slot.kind === 'denied')
          if (denies && refused === 0) {
            refused += 1
            return fail({
              kind: 'unavailable' as const,
              owner: 'journal',
              diagnostic: 'queue_full',
            })
          }
          return d.journal.commit(input)
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
      ok(assembly.controls.clock.advanceTo(new Date(Date.parse(now) + 2000).toISOString() as never))
      return await denied(assembly)
    })
    expect(assembly.controls.tools.invoke.calls).toHaveLength(2)
  })

  it('denies an action whose intent commit had an unknown outcome', async () => {
    let unknown = 0
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
          const intent = input.effects.some(effect => effect.pending.kind === 'tool')
          if ('ok' in committed && intent && unknown === 0) {
            unknown += 1
            return fail({ kind: 'commit-unknown' as const, operation: input.operation })
          }
          return committed
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
      if (unknown === 0) return false
      const now = ok(await assembly.dependencies.clock.now())
      ok(assembly.controls.clock.advanceTo(new Date(Date.parse(now) + 2000).toISOString() as never))
      return await denied(assembly)
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
    expect(assembly.controls.admission.admit.calls).toHaveLength(1)
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
    const messages = toolMessages(await events(assembly))
    expect(messages.map(message => message.blocks[0])).toEqual([
      expect.objectContaining({ callId: 'call-a' }),
      expect.objectContaining({ callId: 'call-b' }),
    ])
    const unchecked =
      'The tool call did not run: its permission could not be checked, because the permission basis was unavailable at that moment. No rule and no person refused it. The same call may run when it is made again.'
    expect(
      messages.map(message =>
        message.blocks.flatMap(block => (block.kind === 'text' ? [block.text] : [])),
      ),
    ).toEqual([[unchecked], [unchecked]])
  })

  it('keeps the plain denial for an action that a decision denied', async () => {
    const assembly = await toolAssembly()
    acceptEach(assembly)
    assembly.controls.admission.admit.always(() => ({
      ok: { kind: 'deny', reason: 'rule/no-shell', evidence: evidence('denied-by-rule') },
    }))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a')])
    await secondModelCall(assembly)
    expect(
      toolMessages(await events(assembly)).map(message =>
        message.blocks.flatMap(block => (block.kind === 'text' ? [block.text] : [])),
      ),
    ).toEqual([['The tool call was denied and did not run.']])
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
    expect(assembly.controls.admission.admit.calls).toHaveLength(1)
    expect(assembly.controls.tools.invoke.calls).toHaveLength(1)
    const [denied] = (await snapshot(assembly)).checkpoint.batch?.actions ?? []
    expect(denied?.judgment).toMatchObject({
      kind: 'denied',
      evidence: { record: expect.stringMatching(/\/answered$/) },
      answer: expect.anything(),
    })
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

  it('closes the intent of a first attempt that Tool rejected, and the denied action reaches the next Model call', async () => {
    const assembly = await toolAssembly()
    assembly.controls.tools.invoke.always(async () => ({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'request', reason: 'the arguments do not match' },
    }))
    assembly.controls.admission.admit.always(() => ({
      ok: { kind: 'allow', evidence: evidence('allowed') },
    }))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a')])
    await secondModelCall(assembly)
    expect(assembly.controls.tools.invoke.calls).toHaveLength(1)
    expect(
      (await snapshot(assembly)).checkpoint.calls.filter(call => call.kind === 'tool'),
    ).toEqual([])
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
