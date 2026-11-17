import { describe, expect, it } from 'vitest'
import type {
  CardReply,
  DecisionCardDraft,
  ExecutionSnapshot,
  Position,
} from '@omne-harness/agent-contract'
import { fail } from '@omne-harness/operation-result'
import { evidence, execution, ok } from './journal-support.ts'
import { alice, eventsOf, eventually, invoke, loopAssembly } from './loop-support.ts'
import { deliverToolSuggestion, toolAssembly, toolCall } from './fixtures/tool-call.ts'
import {
  declare,
  implementations,
  observed,
  output,
  recordingPasses,
  tenantView,
  type Behavior,
} from './extension-support.ts'

const draft = (explanation: string, position: Position): DecisionCardDraft => ({
  explanation,
  options: [
    { id: 'yes', label: 'Go on' },
    { id: 'no', label: 'Stop here' },
  ],
  about: { position },
})
const ask = (explanation: string, position: Position = 'execution_started') =>
  output({ kind: 'ask', card: draft(explanation, position) })
const chosen = (option: string): CardReply => ({
  kind: 'chosen',
  option,
  value: null,
  evidence: evidence(`answer/${option}`),
})

type Assembly = Awaited<ReturnType<typeof loopAssembly>> | Awaited<ReturnType<typeof toolAssembly>>

/** The cards port in memory: every card is pending until the test answers it. */
function cardDesk(assembly: Assembly) {
  const replies = new Map<string, CardReply>()
  const { cards } = assembly.controls
  cards.present.always(async call => ({
    ok: call.requests.map(request => evidence(`card/${request.identity}`)),
  }))
  cards.read.always(async call => ({ ok: replies.get(call.card.record) ?? { kind: 'pending' } }))
  return {
    presented: () => cards.present.calls.flatMap(call => call.requests.map(r => r.identity)),
    answer(identity: string, reply: CardReply) {
      replies.set(`card/${identity}`, reply)
    },
  }
}

const loaded = async (assembly: Assembly): Promise<ExecutionSnapshot> =>
  ok(await assembly.dependencies.journal.load({ ...alice, execution: execution() }))

async function waitingForPerson(assembly: Assembly) {
  await eventually(async () => {
    const read = await loaded(assembly)
    return read.state.kind === 'waiting' && read.state.waits.some(wait => wait.kind === 'human')
  })
  return loaded(assembly)
}

async function nextCheck(assembly: Assembly) {
  await eventually(async () => assembly.controls.clock.pending().length === 1)
  const [check] = assembly.controls.clock.pending()
  if (check === undefined) throw new Error('the driver is not sleeping on a check time')
  ok(assembly.controls.clock.advanceTo(check))
}

async function scene(position: Position, behavior: Behavior, extra = {}) {
  const view = tenantView()
  const extensions = implementations()
  view.enable(declare('probe', position, extra))
  extensions.define('probe', behavior)
  let saved: ReturnType<typeof recordingPasses> | null = null
  const assembly = await loopAssembly([execution()], dependencies => {
    saved = recordingPasses({
      ...dependencies,
      extensions: extensions.port,
      enabledExtensions: view.port,
    })
    return saved.dependencies
  })
  assembly.release.open()
  const desk = cardDesk(assembly)
  const handle = ok(await invoke(assembly))
  const commits = () => (saved as ReturnType<typeof recordingPasses> | null)?.commits ?? []
  return { assembly, extensions, desk, handle, commits }
}

const first = 'step-0/execution_started/call/0'

describe('an extension that asks a person', () => {
  it('saves the round, presents it once, waits on the person, and is invoked again in replay with the answer', async () => {
    const s = await scene('execution_started', (_input, mode) =>
      mode.kind === 'fresh' ? ask('Start this run?') : observed,
    )
    const waiting = await waitingForPerson(s.assembly)
    expect(waiting.state).toMatchObject({
      waits: [{ kind: 'human', passage: first, cards: [evidence(`card/${first}/round/1/card/1`)] }],
    })
    expect(waiting.checkpoint.position).toBe('E3')
    expect(s.commits().map(commit => commit.calls.map(call => call.state))).toEqual([
      ['requested'],
      ['asked'],
    ])
    expect(waiting.checkpoint.passages[0]?.progress).toMatchObject({
      kind: 'asked',
      rounds: [{ round: `${first}/round/1`, progress: { kind: 'presented' } }],
    })
    expect(s.desk.presented()).toEqual([`${first}/round/1/card/1`])
    expect(s.extensions.invocations.map(item => item.mode)).toEqual(['fresh'])

    s.desk.answer(`${first}/round/1/card/1`, chosen('yes'))
    await nextCheck(s.assembly)
    expect((await eventsOf(s.handle)).at(-1)?.body.kind).toBe('ended')
    expect(s.extensions.invocations.map(item => item.mode)).toEqual(['fresh', 'replay'])
    expect(s.extensions.replays[0]).toMatchObject({
      passage: first,
      control: 'valid',
      rounds: [
        {
          round: `${first}/round/1`,
          cards: [{ response: { answer: { kind: 'chosen', option: 'yes' } } }],
        },
      ],
    })
    expect(s.desk.presented()).toHaveLength(1)
  })

  it('a replay that asks again opens a second round; the answers of both rounds reach the last replay', async () => {
    const s = await scene('execution_started', (_input, mode) => {
      if (mode.kind === 'fresh') return ask('First question')
      return mode.binding.rounds.length === 1 ? ask('Second question') : observed
    })
    await waitingForPerson(s.assembly)
    s.desk.answer(`${first}/round/1/card/1`, chosen('yes'))
    await nextCheck(s.assembly)
    await eventually(async () => s.desk.presented().length === 2)
    await waitingForPerson(s.assembly)
    s.desk.answer(`${first}/round/2/card/1`, chosen('no'))
    await nextCheck(s.assembly)
    expect((await eventsOf(s.handle)).at(-1)?.body.kind).toBe('ended')
    expect(s.desk.presented()).toEqual([`${first}/round/1/card/1`, `${first}/round/2/card/1`])
    expect(
      s.extensions.replays.at(-1)?.rounds.map(round => round.cards[0]?.response?.answer),
    ).toMatchObject([{ option: 'yes' }, { option: 'no' }])
  })

  it('a replay that asks the question it was just answered is an error, not a second card', async () => {
    const s = await scene('execution_started', () => ask('The same question'))
    await waitingForPerson(s.assembly)
    s.desk.answer(`${first}/round/1/card/1`, chosen('yes'))
    await nextCheck(s.assembly)
    expect((await eventsOf(s.handle)).at(-1)?.body.kind).toBe('ended')
    expect(s.desk.presented()).toHaveLength(1)
    expect(s.commits().flatMap(commit => commit.calls.map(call => call.output))).toContain(
      'errored',
    )
  })

  it('a present whose receipt is lost is looked up by its round and not presented again', async () => {
    const s = await scene('execution_started', (_input, mode) =>
      mode.kind === 'fresh' ? ask('Start this run?') : observed,
    )
    await waitingForPerson(s.assembly)
    expect(s.desk.presented()).toHaveLength(1)
    const lost = await scene2Lost()
    expect(lost.presents).toBe(1)
    expect(lost.lookups).toBeGreaterThan(0)
    expect(lost.waiting.state).toMatchObject({ waits: [{ kind: 'human', passage: first }] })
  })

  it('a refused present ends the call by the agent: the run goes on at a position after the change, and a veto member before the terminal vetoes', async () => {
    const refused = async (position: Position) => {
      const view = tenantView()
      const extensions = implementations()
      view.enable(declare('probe', position))
      extensions.define('probe', () => ask('Allowed?', position))
      const assembly = await loopAssembly([execution()], dependencies => ({
        ...dependencies,
        extensions: extensions.port,
        enabledExtensions: view.port,
      }))
      assembly.release.open()
      assembly.controls.cards.present.always(async () =>
        fail({ kind: 'denied' as const, action: 'present' }),
      )
      const handle = ok(await invoke(assembly))
      return { assembly, handle, extensions }
    }
    const started = await refused('execution_started')
    expect((await eventsOf(started.handle)).at(-1)?.body.kind).toBe('ended')
    expect(started.extensions.invocations).toHaveLength(1)
    const terminal = await refused('before_terminal')
    await eventually(async () => (await loaded(terminal.assembly)).state.kind === 'waiting')
    expect((await loaded(terminal.assembly)).state).toMatchObject({
      waits: [{ kind: 'dependency', owner: 'agentExtensions', position: 'I8' }],
    })
  })
})

async function scene2Lost() {
  const view = tenantView()
  const extensions = implementations()
  view.enable(declare('probe', 'execution_started'))
  extensions.define('probe', (_input, mode) => (mode.kind === 'fresh' ? ask('Start?') : observed))
  const assembly = await loopAssembly([execution()], dependencies => ({
    ...dependencies,
    extensions: extensions.port,
    enabledExtensions: view.port,
  }))
  assembly.release.open()
  const { cards } = assembly.controls
  const created: ReturnType<typeof evidence>[] = []
  cards.present.always(async call => {
    created.push(...call.requests.map(request => evidence(`card/${request.identity}`)))
    return fail({ kind: 'commit-unknown' as const, operation: 'present' as never })
  })
  cards.lookup.always(async () => ({ ok: { kind: 'presented', cards: created } }))
  cards.read.always(async () => ({ ok: { kind: 'pending' } }))
  ok(await invoke(assembly))
  const waiting = await waitingForPerson(assembly)
  return { presents: cards.present.calls.length, lookups: cards.lookup.calls.length, waiting }
}

describe('cards of a batch before its actions', () => {
  it('judges every action before any card is presented, presents the cards of the batch together, and sends no tool while they wait', async () => {
    const view = tenantView()
    const extensions = implementations()
    view.enable(declare('probe', 'before_action'))
    extensions.define('probe', (_input, mode) =>
      mode.kind === 'fresh' ? ask('Run this tool?', 'before_action') : observed,
    )
    const assembly = await toolAssembly({ toolConcurrency: 2 }, {}, {}, dependencies => ({
      ...dependencies,
      extensions: extensions.port,
      enabledExtensions: view.port,
    }))
    const desk = cardDesk(assembly)
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a'), toolCall('call-b')])
    const waiting = await waitingForPerson(assembly)
    expect(extensions.invocations.map(item => item.mode)).toEqual(['fresh', 'fresh'])
    expect(desk.presented()).toHaveLength(2)
    expect(waiting.state.kind === 'waiting' && waiting.state.waits).toHaveLength(2)
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
    expect(assembly.controls.admission.admit.calls).toHaveLength(0)
  })
})
