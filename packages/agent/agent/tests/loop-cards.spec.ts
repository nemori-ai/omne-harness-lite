import { describe, expect, it } from 'vitest'
import {
  decodeAgentOperationId,
  type ActionAdmission,
  type AgentEventBody,
  type CardReply,
  type DecisionCardDraft,
  type DenialCategory,
  type EventPage,
} from '@omne-harness/agent-contract'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  type ToolInvokeOutcome,
  type ToolState,
} from '@omne-harness/tool-contract'
import { recoveryRoute } from '../src/loop/coordinator.ts'
import { evidence, execution, ok, loadWithEntries } from './journal-support.ts'
import { alice, eventually, invoke } from './loop-support.ts'
import { deliverToolSuggestion, toolAssembly, toolCall } from './fixtures/tool-call.ts'

type Assembly = Awaited<ReturnType<typeof toolAssembly>>
type Admit = Awaited<ReturnType<ActionAdmission<string>['admit']>>

const input = { ...alice, execution: execution() }
const draft = (explanation: string, extra: Partial<DecisionCardDraft> = {}): DecisionCardDraft => ({
  explanation,
  options: [
    { id: 'once', label: 'Allow once' },
    { id: 'no', label: 'Do not allow' },
  ],
  about: { position: 'before_action' },
  ...extra,
})
const ask = (explanation = 'Run the command?', extra: Partial<DecisionCardDraft> = {}): Admit => ({
  ok: { kind: 'need-decision', card: draft(explanation, extra), evidence: evidence('ask') },
})
const allow: Admit = { ok: { kind: 'allow', evidence: evidence('allow') } }
const operation = ok(decodeAgentOperationId('present-cards'))
const chosen: CardReply = {
  kind: 'chosen',
  option: 'once',
  value: null,
  evidence: evidence('answer'),
}

async function cardAssembly(): Promise<Assembly> {
  const assembly = await toolAssembly()
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
  assembly.controls.cards.present.always(async call => ({
    ok: call.requests.map(request => evidence(`card/${request.identity}`)),
  }))
  assembly.controls.cards.read.always(async () => ({ ok: { kind: 'pending' } }))
  return assembly
}

const snapshot = (assembly: Assembly) => loadWithEntries(assembly.dependencies, input)

async function toolMessages(assembly: Assembly) {
  const bodies: AgentEventBody[] = []
  let after: string | null = null
  for (;;) {
    const page: EventPage = ok(
      await assembly.dependencies.journal.output.read({ ...input, after, limit: 100 }),
    )
    if (page.kind !== 'page') throw new Error('event gap')
    bodies.push(...page.events.map(event => event.body))
    if (page.caughtUp || page.events.length === 0) break
    after = page.next
  }
  return bodies.flatMap(body =>
    body.kind === 'message' && body.message.role === 'tool' ? [body.message] : [],
  )
}

async function waitingForPerson(assembly: Assembly) {
  await eventually(async () => {
    const read = await snapshot(assembly)
    return read.state.kind === 'waiting' && read.state.waits.some(wait => wait.kind === 'human')
  })
  return snapshot(assembly)
}

async function sleeping(assembly: Assembly) {
  await eventually(async () => assembly.controls.clock.pending().length === 1)
}

async function nextCheck(assembly: Assembly) {
  await sleeping(assembly)
  const [check] = assembly.controls.clock.pending()
  if (check === undefined) throw new Error('the driver is not sleeping on a check time')
  ok(assembly.controls.clock.advanceTo(check))
}

async function secondModelCall(assembly: Assembly) {
  await eventually(async () =>
    (await snapshot(assembly)).checkpoint.calls.some(
      call => call.kind === 'model' && call.action.startsWith('step-2/'),
    ),
  )
}

const judgments = async (assembly: Assembly) =>
  (await snapshot(assembly)).checkpoint.batch?.actions.map(action => action.judgment.kind)

describe('an admission that asks a person', () => {
  it('saves the round, presents it once, waits without a dispatch, and hands the answer back', async () => {
    const assembly = await cardAssembly()
    const { admit } = assembly.controls.admission
    admit.always(async call => (call.decision === null ? ask() : allow))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a')])

    const waiting = await waitingForPerson(assembly)
    const card = evidence('card/step-1/tool/0/admission/round/1/card/1')
    expect(waiting.state).toEqual({
      kind: 'waiting',
      waits: [{ kind: 'human', passage: 'step-1/tool/0/admission', cards: [card] }],
    })
    expect(waiting.checkpoint.position).toBe('A1')
    expect(waiting.checkpoint.batch?.barrier.kind).toBe('closed')
    expect(waiting.checkpoint.batch?.actions[0]?.judgment).toEqual({
      kind: 'waiting',
      passage: 'step-1/tool/0/admission',
      cards: [card],
    })
    expect(waiting.checkpoint.passages).toMatchObject([
      {
        id: 'step-1/tool/0/admission',
        progress: { kind: 'asked', rounds: [{ progress: { kind: 'presented' } }] },
      },
    ])
    expect(ok(recoveryRoute({ ...waiting, unresolved: [] }))).toBe('A1')
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
    expect(assembly.controls.cards.present.calls).toMatchObject([
      { passage: 'step-1/tool/0/admission', round: 'step-1/tool/0/admission/round/1' },
    ])

    const reads = assembly.controls.cards.read.calls.length
    await nextCheck(assembly)
    await eventually(async () => assembly.controls.cards.read.calls.length > reads)
    await sleeping(assembly)
    expect((await snapshot(assembly)).revision).toBe(waiting.revision)
    expect(admit.calls).toHaveLength(1)

    assembly.controls.cards.read.always(async () => ({ ok: chosen }))
    await nextCheck(assembly)
    await eventually(async () => assembly.controls.tools.invoke.calls.length === 1)
    expect(admit.calls).toHaveLength(2)
    expect(admit.calls[1]?.decision).toEqual({ card, answer: chosen })
    expect(assembly.controls.cards.present.calls).toHaveLength(1)
    const dispatched = await snapshot(assembly)
    expect(dispatched.checkpoint.batch?.barrier.kind).toBe('open')
    expect(dispatched.checkpoint.passages).toMatchObject([
      { progress: { kind: 'applied', rounds: [{ progress: { kind: 'processed' } }] } },
    ])
  })

  it('denies the action when the admission denies it with the answer of the person', async () => {
    const assembly = await cardAssembly()
    const declined: CardReply = { kind: 'declined', evidence: evidence('declined') }
    assembly.controls.admission.admit.always(async call =>
      call.decision === null
        ? ask()
        : {
            ok: {
              kind: 'deny',
              category: 'not-released',
              reason: 'declined',
              evidence: evidence('deny-after-answer'),
            },
          },
    )
    assembly.controls.cards.read.always(async () => ({ ok: declined }))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a')])
    await secondModelCall(assembly)
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
    expect((await toolMessages(assembly)).map(message => message.blocks[0])).toEqual([
      expect.objectContaining({ callId: 'call-a' }),
    ])
    expect(assembly.controls.admission.admit.calls[1]?.decision?.answer).toEqual(declined)
    expect((await snapshot(assembly)).checkpoint.passages).toEqual([])
  })

  describe('the message of a denial after the person answered, fixed by its category', () => {
    const WORDS = 'Use port 8081, not 8080.'
    const remark: CardReply = { kind: 'remark', text: WORDS, evidence: evidence('remark') }

    async function denialTexts(category: DenialCategory, reply: CardReply = remark) {
      const assembly = await cardAssembly()
      assembly.controls.admission.admit.always(async call =>
        call.decision === null
          ? ask()
          : {
              ok: {
                kind: 'deny',
                category,
                reason: 'fixture',
                evidence: evidence('deny-after-remark'),
              },
            },
      )
      assembly.controls.cards.read.always(async () => ({ ok: reply }))
      ok(await invoke(assembly))
      await deliverToolSuggestion(assembly, [toolCall('call-a')])
      await secondModelCall(assembly)
      expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
      expect(assembly.controls.admission.admit.calls[1]?.decision?.answer).toEqual(reply)
      const [message, ...others] = await toolMessages(assembly)
      expect(others).toEqual([])
      // Every block counts: a denial message is its fixed text, plus the words only for guidance.
      return message?.blocks.map(block => (block.kind === 'text' ? block.text : block.kind))
    }

    it('carries the words of the person after the guidance message', async () => {
      expect(await denialTexts('guidance')).toEqual([
        'tool_result',
        'The tool call did not run. The person answered the approval card with guidance instead of a decision. Their words follow.',
        WORDS,
      ])
    })

    it.each([
      ['rule', 'The tool call was denied by a rule or a prohibition and did not run.'],
      ['not-released', 'The tool call did not run: the person did not allow it this time.'],
      [
        'prohibited',
        'The tool call did not run: the person prohibited this capability, so later calls to it are denied too.',
      ],
      [
        'card-closed',
        'The tool call did not run: its approval card was closed before the person answered.',
      ],
    ] as const)(
      'gives %s its own message, and the words are not guidance then',
      async (category, text) => {
        expect(await denialTexts(category)).toEqual(['tool_result', text])
      },
    )
  })

  it('changes the effective arguments when the person chooses the option bound to the rewrite', async () => {
    const assembly = await cardAssembly()
    const rewrite = { option: 'once', effectiveArguments: '{"path":"notes.txt","safe":"true"}' }
    assembly.controls.admission.admit.always(async call =>
      call.decision === null ? ask('Run it safely?', { proposedRewrite: rewrite }) : allow,
    )
    assembly.controls.cards.read.always(async () => ({ ok: chosen }))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a')])
    const { calls } = assembly.controls.admission.admit
    await eventually(async () => calls.length === 2)
    expect(calls[1]?.effectiveArguments).toBe(rewrite.effectiveArguments)
    expect(calls[0]?.effectiveArguments).not.toBe(rewrite.effectiveArguments)
  })

  it('keeps the effective arguments when the person chooses an option that is not bound to the rewrite', async () => {
    const assembly = await cardAssembly()
    const rewrite = { option: 'no', effectiveArguments: '{"path":"notes.txt","safe":"true"}' }
    assembly.controls.admission.admit.always(async call =>
      call.decision === null ? ask('Run it safely?', { proposedRewrite: rewrite }) : allow,
    )
    assembly.controls.cards.read.always(async () => ({ ok: chosen }))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a')])
    const { calls } = assembly.controls.admission.admit
    await eventually(async () => calls.length === 2)
    expect(calls[1]?.effectiveArguments).toBe(calls[0]?.effectiveArguments)
    expect(calls[1]?.effectiveArguments).not.toBe(rewrite.effectiveArguments)
  })
})

describe('the barrier of a batch with a card', () => {
  it('dispatches no allowed action before the asked one is answered (constraint 4)', async () => {
    const assembly = await cardAssembly()
    assembly.controls.admission.admit.always(async call =>
      call.decision === null && call.original.callId === 'call-a' ? ask() : allow,
    )
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a'), toolCall('call-b')])
    await waitingForPerson(assembly)
    expect(await judgments(assembly)).toEqual(['waiting', 'allowed'])
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)

    assembly.controls.cards.read.always(async () => ({ ok: chosen }))
    await nextCheck(assembly)
    await eventually(async () => assembly.controls.tools.invoke.calls.length === 2)
    expect(assembly.controls.admission.admit.calls.map(call => call.original.callId)).toEqual([
      'call-a',
      'call-b',
      'call-a',
    ])
  })
})

describe('a present without a certain result', () => {
  it('is looked up with the saved round and is not sent again (constraint 2)', async () => {
    const assembly = await cardAssembly()
    const { present, lookup } = assembly.controls.cards
    assembly.controls.admission.admit.always(async call => (call.decision === null ? ask() : allow))
    present.always(async () => ({ failure: { kind: 'commit-unknown', operation } }))
    lookup.always(async call => ({
      ok: {
        kind: 'presented',
        cards: call.requests.map(request => evidence(`card/${request.identity}`)),
      },
    }))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a')])
    await waitingForPerson(assembly)
    expect(present.calls).toHaveLength(1)
    expect(lookup.calls).toMatchObject([
      {
        execution: execution(),
        passage: 'step-1/tool/0/admission',
        round: 'step-1/tool/0/admission/round/1',
      },
    ])
    expect(lookup.calls[0]?.requests).toEqual(present.calls[0]?.requests)
    expect(lookup.calls[0]?.original).toEqual(present.calls[0]?.original)
  })

  it('waits on the card port while the lookup does not know, and asks no person', async () => {
    const assembly = await cardAssembly()
    const { present, lookup } = assembly.controls.cards
    assembly.controls.admission.admit.always(async call => (call.decision === null ? ask() : allow))
    present.always(async () => ({ failure: { kind: 'commit-unknown', operation } }))
    lookup.always(async () => ({ ok: { kind: 'unknown' } }))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a')])
    await eventually(async () => {
      const { state } = await snapshot(assembly)
      return state.kind === 'waiting' && state.waits.some(wait => wait.kind === 'dependency')
    })
    const read = await snapshot(assembly)
    expect(read.state).toEqual({
      kind: 'waiting',
      waits: [{ kind: 'dependency', owner: 'agentDecisionCards', position: 'A1' }],
    })
    expect(ok(recoveryRoute({ ...read, unresolved: [] }))).toBe('A1')
    expect(read.checkpoint.passages).toMatchObject([
      { progress: { kind: 'asked', rounds: [{ progress: { kind: 'requested' } }] } },
    ])
    expect(present.calls).toHaveLength(1)
  })
})

describe('a saved round whose cards may exist', () => {
  it('is looked up before it is presented again (constraint 3)', async () => {
    const assembly = await cardAssembly()
    const { present, lookup } = assembly.controls.cards
    assembly.controls.admission.admit.always(async call => (call.decision === null ? ask() : allow))
    present.always(async () => ({ failure: { kind: 'commit-unknown', operation } }))
    lookup.always(async () => ({ ok: { kind: 'unknown' } }))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a')])
    await eventually(async () => {
      const { state } = await snapshot(assembly)
      return state.kind === 'waiting' && state.waits.some(wait => wait.kind === 'dependency')
    })
    lookup.always(async call => ({
      ok: {
        kind: 'presented',
        cards: call.requests.map(request => evidence(`card/${request.identity}`)),
      },
    }))
    await nextCheck(assembly)
    await waitingForPerson(assembly)
    expect(present.calls).toHaveLength(1)
    expect(lookup.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('presents the same request again once the lookup excludes the original cards', async () => {
    const assembly = await cardAssembly()
    const { present, lookup } = assembly.controls.cards
    assembly.controls.admission.admit.always(async call => (call.decision === null ? ask() : allow))
    present.once(async () => ({ failure: { kind: 'commit-unknown', operation } }))
    lookup.always(async () => ({ ok: { kind: 'not-presented', exclusion: evidence('excluded') } }))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a')])
    await waitingForPerson(assembly)
    expect(present.calls).toHaveLength(2)
    expect(present.calls[1]?.round).toBe(present.calls[0]?.round)
    expect(present.calls[1]?.requests).toEqual(present.calls[0]?.requests)
  })

  it('hands no answer back while another round of the batch has no certain result', async () => {
    const assembly = await cardAssembly()
    const { present, lookup, read } = assembly.controls.cards
    const { admit } = assembly.controls.admission
    admit.always(async call =>
      call.decision === null ? ask(`Run ${call.original.callId}?`) : allow,
    )
    present.always(async call =>
      call.passage === 'step-1/tool/0/admission'
        ? { failure: { kind: 'commit-unknown', operation } }
        : { ok: call.requests.map(request => evidence(`card/${request.identity}`)) },
    )
    lookup.always(async () => ({ ok: { kind: 'unknown' } }))
    read.always(async () => ({ ok: chosen }))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a'), toolCall('call-b')])
    await eventually(async () => {
      const { state } = await snapshot(assembly)
      return state.kind === 'waiting' && state.waits.some(wait => wait.kind === 'dependency')
    })
    expect(admit.calls.map(call => call.original.callId)).toEqual(['call-a', 'call-b'])
    expect(await judgments(assembly)).toEqual(['pending', 'waiting'])
    expect(read.calls).toHaveLength(0)

    lookup.always(async call => ({
      ok: {
        kind: 'presented',
        cards: call.requests.map(request => evidence(`card/${request.identity}`)),
      },
    }))
    await nextCheck(assembly)
    await eventually(async () => assembly.controls.tools.invoke.calls.length === 2)
    expect(admit.calls.map(call => [call.original.callId, call.decision === null])).toEqual([
      ['call-a', true],
      ['call-b', true],
      ['call-a', false],
      ['call-b', false],
    ])
  })
})

describe('cards that are refused for certain', () => {
  it('deny the action with the failure and wait for no person (rule 11)', async () => {
    const assembly = await cardAssembly()
    assembly.controls.admission.admit.always(async () => ask())
    assembly.controls.cards.present.always(async () => ({
      failure: { kind: 'conflict', operation },
    }))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a')])
    await secondModelCall(assembly)
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
    expect(assembly.controls.cards.read.calls).toHaveLength(0)
    expect(assembly.controls.admission.admit.calls).toHaveLength(1)
    expect((await toolMessages(assembly)).map(message => message.blocks[0])).toEqual([
      expect.objectContaining({ callId: 'call-a' }),
    ])
  })
})

describe('an admission that asks again', () => {
  it('opens a second round for a new card and keeps the first answered', async () => {
    const assembly = await cardAssembly()
    const { admit } = assembly.controls.admission
    admit.once(async () => ask('Run the command?'))
    admit.once(async () => ask('Also outside the project directory?'))
    admit.always(async () => allow)
    assembly.controls.cards.read.always(async () => ({ ok: chosen }))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a')])
    await eventually(async () => assembly.controls.tools.invoke.calls.length === 1)
    expect(assembly.controls.cards.present.calls.map(call => call.round)).toEqual([
      'step-1/tool/0/admission/round/1',
      'step-1/tool/0/admission/round/2',
    ])
    expect(admit.calls).toHaveLength(3)
  })

  it('denies the action when the admission repeats the card the person answered', async () => {
    const assembly = await cardAssembly()
    assembly.controls.admission.admit.always(async () => ask('Run the command?'))
    assembly.controls.cards.read.always(async () => ({ ok: chosen }))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a')])
    await secondModelCall(assembly)
    expect(assembly.controls.cards.present.calls).toHaveLength(1)
    expect(assembly.controls.admission.admit.calls).toHaveLength(2)
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
  })
})

describe('a card round always ends (Agent rule: card rounds always settle)', () => {
  const CLOSED =
    'The tool call did not run: its approval card was closed before the person answered.'
  const withdrawn = (assembly: Assembly) =>
    assembly.controls.cards.invalidate.always(async call => ({
      ok: call.cards.map(card => ({
        card,
        reply: { kind: 'invalidated', evidence: evidence('withdrawn') } as const,
      })),
    }))

  it('denies the action as card-closed when its card closes unanswered, and the Run goes on', async () => {
    const assembly = await cardAssembly()
    withdrawn(assembly)
    assembly.controls.admission.admit.always(async () => ask())
    assembly.controls.cards.read.always(async () => ({
      ok: { kind: 'invalidated', evidence: evidence('closed') },
    }))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a')])
    await secondModelCall(assembly)
    expect(assembly.controls.admission.admit.calls).toHaveLength(1)
    expect(assembly.controls.cards.invalidate.calls).toHaveLength(0)
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
    const [message] = await toolMessages(assembly)
    expect(message?.blocks.map(block => (block.kind === 'text' ? block.text : block.kind))).toEqual(
      ['tool_result', CLOSED],
    )
  })

  it('withdraws the cards still open when the batch is denied as a whole', async () => {
    const assembly = await cardAssembly()
    withdrawn(assembly)
    assembly.controls.admission.admit.always(async call =>
      call.original.callId === 'call-a' && call.decision !== null
        ? { ok: { kind: 'undecidable', diagnostic: 'judging fails now' } }
        : ask(),
    )
    assembly.controls.cards.read.always(async call => ({
      ok: call.card.record.includes('tool/0') ? chosen : { kind: 'pending' },
    }))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a'), toolCall('call-b')])
    await secondModelCall(assembly)
    const { calls } = assembly.controls.cards.invalidate
    expect(calls).toHaveLength(1)
    expect(calls[0]?.round).toContain('tool/1')
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
    expect((await snapshot(assembly)).checkpoint.passages).toEqual([])
  })

  it('withdraws the open card when the Run is cancelled, and the Run ends cancelled', async () => {
    const assembly = await cardAssembly()
    withdrawn(assembly)
    assembly.controls.admission.admit.always(async () => ask())
    const handle = ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a')])
    await waitingForPerson(assembly)
    ok(
      await handle.control.control({
        ...input,
        operation: ok(decodeAgentOperationId('cancel-the-run')),
        command: { kind: 'cancel', reason: evidence('cancel') },
      }),
    )
    await eventually(async () => (await snapshot(assembly)).state.kind === 'ended')
    expect((await snapshot(assembly)).state).toMatchObject({
      kind: 'ended',
      conclusion: { kind: 'cancelled' },
    })
    const [withdraw] = assembly.controls.cards.invalidate.calls
    expect(withdraw).toMatchObject({
      operation: 'step-1/tool/0/admission/round/1/withdraw',
      passage: 'step-1/tool/0/admission',
      round: 'step-1/tool/0/admission/round/1',
      cards: [evidence('card/step-1/tool/0/admission/round/1/card/1')],
    })
    expect(withdraw?.reason.record).toBe(`${execution()}/F0/cancel`)
    expect(assembly.controls.cards.invalidate.calls).toHaveLength(1)
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
  })

  async function cancelWhilePresentUnknown(
    assembly: Assembly,
    onCancel: Parameters<Assembly['controls']['cards']['lookup']['always']>[0],
  ) {
    const { present, lookup } = assembly.controls.cards
    assembly.controls.admission.admit.always(async () => ask())
    present.always(async () => ({ failure: { kind: 'commit-unknown', operation } }))
    lookup.always(async () => ({ ok: { kind: 'unknown' } }))
    const handle = ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a')])
    await eventually(async () => {
      const { state } = await snapshot(assembly)
      return state.kind === 'waiting' && state.waits.some(wait => wait.kind === 'dependency')
    })
    lookup.always(onCancel)
    ok(
      await handle.control.control({
        ...input,
        operation: ok(decodeAgentOperationId('cancel-the-run')),
        command: { kind: 'cancel', reason: evidence('cancel') },
      }),
    )
  }

  it('looks a card up before withdrawing it when its present had no certain result', async () => {
    const assembly = await cardAssembly()
    withdrawn(assembly)
    const found = [evidence('card/found')]
    await cancelWhilePresentUnknown(assembly, async () => ({
      ok: { kind: 'presented', cards: found },
    }))
    await eventually(async () => (await snapshot(assembly)).state.kind === 'ended')
    expect(assembly.controls.cards.invalidate.calls.map(call => call.cards)).toEqual([found])
  })

  it('withdraws nothing when the lookup finds the card was never presented', async () => {
    const assembly = await cardAssembly()
    withdrawn(assembly)
    await cancelWhilePresentUnknown(assembly, async () => ({
      ok: { kind: 'not-presented', exclusion: evidence('excluded') },
    }))
    await eventually(async () => (await snapshot(assembly)).state.kind === 'ended')
    expect((await snapshot(assembly)).state).toMatchObject({ conclusion: { kind: 'cancelled' } })
    expect(assembly.controls.cards.invalidate.calls).toHaveLength(0)
  })

  it('does not end the Run while it cannot know whether the card it must withdraw exists', async () => {
    const assembly = await cardAssembly()
    withdrawn(assembly)
    await cancelWhilePresentUnknown(assembly, async () => ({ ok: { kind: 'unknown' } }))
    await eventually(async () => {
      const { state } = await snapshot(assembly)
      return (
        state.kind === 'waiting' &&
        state.waits.some(wait => wait.kind === 'dependency' && wait.owner === 'agentDecisionCards')
      )
    })
    expect((await snapshot(assembly)).state.kind).not.toBe('ended')
    expect(assembly.controls.cards.invalidate.calls).toHaveLength(0)
  })

  it('does not end the Run as cancelled while the open card could not be withdrawn', async () => {
    const assembly = await cardAssembly()
    assembly.controls.cards.invalidate.always(async () => ({
      failure: { kind: 'unavailable', owner: 'agentDecisionCards', diagnostic: 'down' },
    }))
    assembly.controls.admission.admit.always(async () => ask())
    const handle = ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a')])
    await waitingForPerson(assembly)
    ok(
      await handle.control.control({
        ...input,
        operation: ok(decodeAgentOperationId('cancel-the-run')),
        command: { kind: 'cancel', reason: evidence('cancel') },
      }),
    )
    await eventually(async () => assembly.controls.cards.invalidate.calls.length >= 1)
    expect((await snapshot(assembly)).state).toMatchObject({
      kind: 'waiting',
      waits: [{ kind: 'human' }],
    })
  })
})
