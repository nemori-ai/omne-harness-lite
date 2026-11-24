import { describe, expect, it } from 'vitest'
import {
  admissionPassageOf,
  decodeActionId,
  nestedActionOf,
  nestedPositionOf,
  type NestedActionTarget,
  type NestedActionVerdict,
} from '@omne-harness/agent-contract'
import { adoption, evidence, execution, ok, operation } from './journal-support.ts'
import * as agent from '../src/index.ts'
import { createAgentRuntime } from '@omne-harness/agent'
import { options } from './factory-support.ts'
import { alice, eventually, gate, invoke } from './loop-support.ts'
import {
  associatedTools,
  deliverToolSuggestion,
  pushToolResult,
  toolCall,
  toolDelivery,
  toolReceiver,
} from './fixtures/tool-call.ts'
import {
  allow,
  ask,
  cardAssembly,
  chosen,
  sleeping,
  snapshot,
  type Assembly,
} from './loop-cards-support.ts'

const parent = ok(decodeActionId('step-1/tool/0'))
const target = (name = 'write_file'): NestedActionTarget => ({
  definition: adoption(name),
  name,
  command: null,
  arguments: JSON.stringify({ path: 'a.txt' }),
})

/** A run whose one tool call was sent and is waiting for its result: the parent of nested actions. */
const handles = new WeakMap<
  Assembly,
  Awaited<ReturnType<Assembly['provider']['runtime']['invoke']>>
>()

async function waitingOnTool(): Promise<Assembly> {
  const assembly = await cardAssembly()
  assembly.controls.admission.admit.always(async () => allow)
  const invoked = await invoke(assembly)
  handles.set(assembly, invoked)
  ok(invoked)
  await deliverToolSuggestion(assembly, [toolCall('call-a')])
  await associatedTools(assembly, 1)
  return assembly
}

function asked(
  assembly: Assembly,
  ordinal: number,
  over: Partial<{ signal: AbortSignal; name: string }> = {},
) {
  return assembly.provider.nested.admit({
    ...alice,
    execution: execution(),
    parent,
    ordinal,
    target: target(over.name),
    signal: over.signal ?? new AbortController().signal,
  })
}

const nestedCalls = (assembly: Assembly) =>
  assembly.controls.admission.admit.calls.filter(call => call.nested !== undefined)

const chainOf = async (assembly: Assembly, ordinal: number) => {
  const passage = ok(admissionPassageOf(ok(nestedActionOf(parent, ordinal))))
  return (await snapshot(assembly)).checkpoint.passages.find(item => item.id === passage)
}

describe('the position of a nested action', () => {
  it('names the parent action and the ordinal, and reads them back', () => {
    const id = ok(nestedActionOf(parent, 7))
    expect(id).toBe('step-1/tool/0/nested/7')
    expect(nestedPositionOf(id)).toEqual({ parent, ordinal: 7 })
    expect(nestedPositionOf(parent)).toBeNull()
    expect(nestedPositionOf(ok(decodeActionId('a/nested/07')))).toBeNull()
  })
})

describe('AG-31 a nested action is judged by the admission a direct action is judged by', () => {
  it('is allowed after its conclusion is in the execution record, under its own position', async () => {
    const assembly = await waitingOnTool()
    const verdict = await asked(assembly, 1)
    expect(verdict).toEqual({ kind: 'allowed' })
    const [call] = nestedCalls(assembly)
    expect(call).toMatchObject({
      action: 'step-1/tool/0/nested/1',
      passage: 'step-1/tool/0/nested/1/admission',
      nested: { parent, ordinal: 1 },
      definition: adoption('write_file'),
      effectiveArguments: JSON.stringify({ path: 'a.txt' }),
      original: { kind: 'tool_call', name: 'write_file' },
      decision: null,
    })
    const chain = await chainOf(assembly, 1)
    expect(chain?.progress).toMatchObject({ conclusion: { output: { kind: 'observed' } } })
    expect((await snapshot(assembly)).checkpoint.batch?.actions).toHaveLength(1)
  })

  it('is denied with the reason the admission gave, and the same position asked again gets the same answer without a second judgment', async () => {
    const assembly = await waitingOnTool()
    assembly.controls.admission.admit.always(async () => ({
      ok: {
        kind: 'deny',
        category: 'prohibited',
        reason: 'not this tool',
        evidence: evidence('deny'),
      },
    }))
    const first = await asked(assembly, 2)
    expect(first).toEqual({ kind: 'denied', reason: 'prohibited' })
    const judged = nestedCalls(assembly).length
    expect(await asked(assembly, 2)).toEqual(first)
    expect(nestedCalls(assembly)).toHaveLength(judged)
  })
})

describe('AG-31 a nested action that needs a person waits on its own card', () => {
  /** Position 1 asks a person until it is answered; every other position is allowed at once. */
  async function oneAsks() {
    const assembly = await waitingOnTool()
    assembly.controls.admission.admit.always(async call =>
      call.nested?.ordinal === 1 && call.decision === null ? ask('Write the file?') : allow,
    )
    assembly.controls.cards.invalidate.always(async call => ({
      ok: call.cards.map(card => ({
        card,
        reply: { kind: 'invalidated', evidence: evidence('withdrawn') } as const,
      })),
    }))
    return assembly
  }
  const cardOut = (assembly: Assembly) =>
    eventually(async () => assembly.controls.cards.present.calls.length === 1)

  it('puts out one card whose round names the parent action and the ordinal, and is allowed once the person answers', async () => {
    const assembly = await oneAsks()
    let verdict: NestedActionVerdict | undefined
    const answering = asked(assembly, 1).then(given => {
      verdict = given
    })
    await cardOut(assembly)
    const [presented] = assembly.controls.cards.present.calls
    expect(presented?.round).toContain('step-1/tool/0/nested/1/admission')
    await eventually(async () => {
      const read = await snapshot(assembly)
      return read.state.kind === 'waiting' && read.state.waits.some(wait => wait.kind === 'human')
    })
    expect(verdict).toBeUndefined()
    assembly.controls.cards.read.always(async () => ({ ok: chosen }))
    assembly.controls.cards.changes.emit()
    await answering
    expect(verdict).toEqual({ kind: 'allowed' })
    const judged = nestedCalls(assembly).filter(call => call.nested?.ordinal === 1)
    expect(judged.map(call => call.decision?.answer.kind ?? null)).toEqual([null, 'chosen'])
    expect(assembly.controls.cards.present.calls).toHaveLength(1)
  })

  it('AG-31 refuses the action when the answer chosen would rewrite its arguments: what the program fixed is not changed', async () => {
    const assembly = await waitingOnTool()
    const rewrite = { option: 'once', effectiveArguments: JSON.stringify({ path: 'other.txt' }) }
    assembly.controls.admission.admit.always(async call =>
      call.nested !== undefined && call.decision === null
        ? ask('Write somewhere else?', { proposedRewrite: rewrite })
        : allow,
    )
    const answering = asked(assembly, 1)
    await cardOut(assembly)
    assembly.controls.cards.read.always(async () => ({ ok: chosen }))
    assembly.controls.cards.changes.emit()
    expect(await answering).toMatchObject({ kind: 'denied' })
    // The admission is not asked with the rewritten arguments: the refusal comes before it.
    expect(nestedCalls(assembly).map(call => call.effectiveArguments)).toEqual([
      JSON.stringify({ path: 'a.txt' }),
    ])
    expect((await chainOf(assembly, 1))?.progress).toMatchObject({
      conclusion: { output: { kind: 'veto' } },
    })
  })

  it('does not hold up another position: the second is allowed while the first still waits', async () => {
    const assembly = await oneAsks()
    const first = asked(assembly, 1)
    await cardOut(assembly)
    expect(await asked(assembly, 2)).toEqual({ kind: 'allowed' })
    expect((await chainOf(assembly, 1))?.progress.kind).toBe('asked')
    await sleeping(assembly)
    assembly.controls.cards.read.always(async () => ({ ok: chosen }))
    assembly.controls.cards.changes.emit()
    expect(await first).toEqual({ kind: 'allowed' })
  })

  it('withdraws the card and gives no conclusion when the caller withdraws the position', async () => {
    const assembly = await oneAsks()
    const caller = new AbortController()
    const withdrawn = asked(assembly, 1, { signal: caller.signal })
    await cardOut(assembly)
    caller.abort()
    await eventually(async () => assembly.controls.cards.invalidate.calls.length === 1)
    await eventually(async () => (await chainOf(assembly, 1))?.progress.kind !== 'asked')
    expect((await chainOf(assembly, 1))?.progress).toMatchObject({
      conclusion: { output: { kind: 'veto' } },
    })
    expect(await withdrawn).toMatchObject({ kind: 'unanswerable' })
  })

  it('refuses the action when its card was closed without an answer', async () => {
    const assembly = await oneAsks()
    const answering = asked(assembly, 1)
    await cardOut(assembly)
    assembly.controls.cards.read.always(async () => ({
      ok: { kind: 'invalidated', evidence: evidence('closed') },
    }))
    assembly.controls.cards.changes.emit()
    expect(await answering).toEqual({ kind: 'denied', reason: 'card-closed' })
  })
})

describe('AG-31 answers that are not conclusions', () => {
  it('an admission that cannot answer now leaves no record, and the position is judged when asked again', async () => {
    const assembly = await waitingOnTool()
    assembly.controls.admission.admit.always(async () => ({
      ok: { kind: 'unavailable', diagnostic: 'rules are loading' },
    }))
    expect(await asked(assembly, 1)).toMatchObject({ kind: 'unanswerable' })
    expect(await chainOf(assembly, 1)).toBeUndefined()
    assembly.controls.admission.admit.always(async () => allow)
    expect(await asked(assembly, 1)).toEqual({ kind: 'allowed' })
  })

  it('an admission that cannot decide refuses this one action only', async () => {
    const assembly = await waitingOnTool()
    assembly.controls.admission.admit.always(async call =>
      call.nested?.ordinal === 1 ? { ok: { kind: 'undecidable', diagnostic: 'no rule' } } : allow,
    )
    expect(await asked(assembly, 1)).toMatchObject({ kind: 'denied' })
    expect(await asked(assembly, 2)).toEqual({ kind: 'allowed' })
  })

  it('a position that asks for another action than it asked before is refused, and arguments that are not JSON are refused', async () => {
    const assembly = await waitingOnTool()
    assembly.controls.admission.admit.always(async () => ask())
    void asked(assembly, 1)
    await eventually(async () => assembly.controls.cards.present.calls.length === 1)
    expect(await asked(assembly, 1, { name: 'another_tool' })).toMatchObject({ kind: 'denied' })
    assembly.controls.admission.admit.always(async () => allow)
    const broken = assembly.provider.nested.admit({
      ...alice,
      execution: execution(),
      parent,
      ordinal: 3,
      target: { ...target(), arguments: '{' },
      signal: new AbortController().signal,
    })
    expect(await broken).toMatchObject({ kind: 'denied' })
    expect(nestedCalls(assembly).filter(call => call.nested?.ordinal === 3)).toEqual([])
  })
})

describe('AG-32 nothing is allowed once the parent is no longer waiting', () => {
  it('refuses, without asking the admission or a person, after the parent has its result', async () => {
    const assembly = await waitingOnTool()
    const [pending] = await associatedTools(assembly, 1)
    if (pending === undefined) throw new Error('no pending tool call')
    ok(await pushToolResult(toolReceiver(assembly), toolDelivery(pending, { name: 'done' })))
    await eventually(async () => {
      const batch = (await snapshot(assembly)).checkpoint.batch
      return batch === null || batch.slots.every(slot => slot.kind !== 'dispatched')
    })
    const before = nestedCalls(assembly).length
    expect(await asked(assembly, 1)).toMatchObject({ kind: 'denied' })
    expect(nestedCalls(assembly)).toHaveLength(before)
    expect(assembly.controls.cards.present.calls).toHaveLength(0)
  })

  it('refuses an action of a tool call the run does not have, and of an execution it is not running', async () => {
    const assembly = await waitingOnTool()
    const stranger = assembly.provider.nested.admit({
      ...alice,
      execution: execution(),
      parent: ok(decodeActionId('step-1/tool/9')),
      ordinal: 1,
      target: target(),
      signal: new AbortController().signal,
    })
    expect(await stranger).toMatchObject({ kind: 'denied' })
    const elsewhere = assembly.provider.nested.admit({
      ...alice,
      execution: execution('another'),
      parent,
      ordinal: 1,
      target: target(),
      signal: new AbortController().signal,
    })
    expect(await elsewhere).toMatchObject({ kind: 'unanswerable' })
    expect(nestedCalls(assembly)).toEqual([])
  })

  it('withdraws an open nested card and allows nothing after the run is cancelled', async () => {
    const assembly = await waitingOnTool()
    assembly.controls.admission.admit.always(async () => ask())
    assembly.controls.cards.invalidate.always(async call => ({
      ok: call.cards.map(card => ({
        card,
        reply: { kind: 'invalidated', evidence: evidence('withdrawn') } as const,
      })),
    }))
    const waiting = asked(assembly, 1)
    await eventually(async () => assembly.controls.cards.present.calls.length === 1)
    const handle = ok(handles.get(assembly)!)
    ok(
      await handle.control.control({
        ...alice,
        execution: execution(),
        operation: operation('cancel-nested'),
        command: { kind: 'cancel', reason: evidence('cancel-nested') },
      }),
    )
    expect(await waiting).toMatchObject({ kind: 'denied' })
    await eventually(async () => assembly.controls.cards.invalidate.calls.length >= 1)
    const late = await asked(assembly, 2)
    expect(late.kind).not.toBe('allowed')
  })
})

describe('AG-32 the qualification of a nested action, as the permission check asks for it', () => {
  /** The admission is held while it is asked about position 1, so the request can be qualified meanwhile. */
  async function judging(first: 'held' | 'asks' = 'held') {
    const assembly = await waitingOnTool()
    const held = gate()
    assembly.controls.admission.admit.always(async call => {
      if (call.nested === undefined) return allow
      if (first === 'asks' && call.decision === null) return ask('Read the file?')
      await held.opened
      return allow
    })
    const answer = asked(assembly, 1, { name: 'read_file' })
    await eventually(async () => nestedCalls(assembly).length === 1)
    const [input] = nestedCalls(assembly)
    if (input === undefined) throw new Error('the admission was not asked')
    const qualifier = agent.createAgentActionQualification(assembly.dependencies)
    return { assembly, held, answer, input, qualifier }
  }

  it('qualifies the request the program made under a waiting call, and gives the facts of the execution', async () => {
    const { assembly, held, answer, input, qualifier } = await judging()
    const current = await snapshot(assembly)
    expect(ok(await qualifier.qualify(input))).toMatchObject({
      version: 1,
      agentDefinition: current.checkpoint.definition,
      revision: current.revision,
      request: { action: 'step-1/tool/0/nested/1', passage: input.passage },
    })
    const wrong = [
      { ...input, passage: ok(admissionPassageOf(ok(nestedActionOf(parent, 2)))) },
      { ...input, action: ok(nestedActionOf(ok(decodeActionId('step-1/tool/9')), 1)) },
      { ...input, original: { ...input.original, callId: 'another-call' } },
      { ...input, advance: { ...input.advance, generation: 'another-generation' } },
      { ...input, definition: adoption('another-tool') },
    ]
    for (const request of wrong) expect(await qualifier.qualify(request)).toHaveProperty('failure')
    held.open()
    expect(await answer).toEqual({ kind: 'allowed' })
    // The position has its conclusion now: nothing is left to qualify for it.
    expect(await qualifier.qualify(input)).toEqual({
      failure: { kind: 'denied', action: 'qualify-action' },
    })
  })

  it('holds a position that waits for a person to the arguments its chain was opened with', async () => {
    const { assembly, input, qualifier } = await judging('asks')
    await eventually(async () => (await chainOf(assembly, 1))?.progress.kind === 'asked')
    expect(await qualifier.qualify(input)).toHaveProperty('ok')
    expect(
      await qualifier.qualify({ ...input, effectiveArguments: JSON.stringify({ path: 'b.txt' }) }),
    ).toEqual({ failure: { kind: 'denied', action: 'qualify-action' } })
  })

  it('qualifies nothing once the parent call has its result', async () => {
    const { assembly, held, answer, input, qualifier } = await judging()
    const action = ok(nestedActionOf(parent, 2))
    const next = {
      ...input,
      action,
      passage: ok(admissionPassageOf(action)),
      original: { ...input.original, callId: action },
    }
    expect(await qualifier.qualify(next)).toHaveProperty('ok')
    held.open()
    await answer
    const [pending] = await associatedTools(assembly, 1)
    if (pending === undefined) throw new Error('no pending tool call')
    ok(await pushToolResult(toolReceiver(assembly), toolDelivery(pending, { name: 'done' })))
    await eventually(async () => {
      const batch = (await snapshot(assembly)).checkpoint.batch
      return batch === null || batch.slots.every(slot => slot.kind !== 'dispatched')
    })
    expect(await qualifier.qualify(next)).toHaveProperty('failure')
  })
})

describe('AG-31 a nested action after the run moved to another runtime', () => {
  it('answers a position that has its conclusion from the record, and does not put a waiting card out again', async () => {
    const assembly = await waitingOnTool()
    const { admission, cards } = assembly.controls
    admission.admit.always(async call =>
      call.nested?.ordinal === 2 && call.decision === null ? ask('Write the file?') : allow,
    )
    expect(await asked(assembly, 1)).toEqual({ kind: 'allowed' })
    const waiting = asked(assembly, 2)
    await eventually(async () => cards.present.calls.length === 1)
    await eventually(async () => (await chainOf(assembly, 2))?.progress.kind === 'asked')

    // The runtime hands the run over: what it had not answered is answered as not answerable now.
    ok(
      await assembly.provider.control.quiesce({
        ...alice,
        operation: operation('quiesce-nested'),
        reason: evidence('stop'),
      }),
    )
    expect(await waiting).toMatchObject({ kind: 'unanswerable' })
    const judged = nestedCalls(assembly).length

    const next = ok(
      await createAgentRuntime(assembly.dependencies, options({ reconciliationDelaysMs: [1000] })),
    )
    ok(
      await next.runtime.resume({
        ...alice,
        execution: execution(),
        operation: operation('resume-nested'),
        recovery: evidence('recovery'),
        grant: null,
      }),
    )
    const ask2 = (ordinal: number) =>
      next.nested.admit({
        ...alice,
        execution: execution(),
        parent,
        ordinal,
        target: target(),
        signal: new AbortController().signal,
      })
    // Position 1 is answered as before, and nothing judges it a second time.
    expect(await ask2(1)).toEqual({ kind: 'allowed' })
    expect(nestedCalls(assembly).filter(call => call.nested?.ordinal === 1)).toHaveLength(1)
    // Position 2 goes on waiting on the card that is already out.
    const again = ask2(2)
    const reads = cards.read.calls.length
    await eventually(async () => cards.read.calls.length > reads)
    expect(cards.present.calls).toHaveLength(1)
    expect(nestedCalls(assembly)).toHaveLength(judged)
    cards.read.always(async () => ({ ok: chosen }))
    cards.changes.emit()
    expect(await again).toEqual({ kind: 'allowed' })
    expect(cards.present.calls).toHaveLength(1)
  })
})
