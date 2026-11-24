import type {
  Access,
  ActionId,
  AgentCheckpoint,
  AgentClock,
  AgentExecutionId,
  CardReply,
  CardRoundId,
  Conclusion,
  DurableEvidence,
  EnabledExtension,
  EnabledExtensions,
  ExtensionChain,
  ExtensionImplementations,
  ExtensionInvocationMode,
  ExtensionInvocationResult,
  Failure,
  Passage,
  PassageId,
  Subject,
  Waiting,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { presentRequest } from './admission-chain.ts'
import {
  askedRound,
  callsOf,
  chainState,
  closedPass,
  concludeCall,
  effectiveSubject,
  membersAt,
  nextOrdinal,
  reduceChain,
  replayBinding,
  requestedCall,
  type PassEffect,
  type PassPlace,
  type PassState,
} from './extension-pass.ts'
import { agentEvidence } from './identities.ts'
import type { LoopNode } from './nodes.ts'
import {
  failPresent,
  markPresented,
  needOf,
  recordReply,
  resolve as resolveCall,
} from './passages.ts'

type Unavailable = Extract<Failure, { kind: 'unavailable' }>
type Recheck = () => Promise<Outcome<unknown, Failure>>
type Saved = Partial<Pick<AgentCheckpoint, 'chain' | 'passages'>>

export type PassSubject = Readonly<{ action: ActionId | null; subject: Subject }>

/** One pass over a position. `id` names it: a pass saved under it is continued, not begun again. */
export type Pass = PassPlace &
  Readonly<{
    id: string
    subjects(): Promise<Outcome<readonly PassSubject[], Failure>>
    trigger?: 'first-content' | 'final'
    failedStops?: 'ignored'
    system?: readonly EnabledExtension[]
  }>

export type PassResult =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'cancelled' }>
  | Readonly<{ kind: 'waiting'; failure: Unavailable; recheck: Recheck | null }>
  | Readonly<{ kind: 'human'; waits: readonly HumanWait[] }>
  | Readonly<{ kind: 'ended'; effects: readonly PassEffect[]; applied: Saved }>

export type HumanWait = Extract<Waiting, { kind: 'human' }>
export type RoundCards =
  | Readonly<{ kind: 'cards'; cards: readonly DurableEvidence[] }>
  | Readonly<{ kind: 'refused'; failure: DurableEvidence }>
  | Readonly<{ kind: 'unknown'; failure: Unavailable }>
export type CardDesk = Readonly<{
  present(
    request: NonNullable<ReturnType<typeof presentRequest>>,
  ): Promise<Outcome<RoundCards, Failure>>
  read(card: DurableEvidence): Promise<Outcome<CardReply, Failure>>
  opened(round: CardRoundId): void
}>

export type PassHost<P> = Readonly<{
  access: Access<P>
  execution: AgentExecutionId
  ports: Readonly<{
    extensions: ExtensionImplementations<P>
    enabledExtensions?: EnabledExtensions<P>
    clock: AgentClock
  }>
  definition: readonly EnabledExtension[]
  cards: CardDesk
  checkpoint(): AgentCheckpoint
  cancelled(): boolean
  save(node: LoopNode, write: Readonly<{ checkpoint: Saved }>): Promise<Outcome<void, Failure>>
  signal(): AbortSignal
}>

/** `mine`: the calls this process saved as requested and has not invoked. Only those are invoked fresh. */
type Driver<P> = Readonly<{ host: PassHost<P>; mine: Set<PassageId> }>

const placeOf = ({ position, dimension, purpose }: PassPlace): PassPlace => ({
  position,
  dimension,
  purpose,
})

const waitingOn = (failure: Failure, recheck: Recheck): Outcome<PassResult, Failure> =>
  failure.kind === 'unavailable' ? succeed({ kind: 'waiting', failure, recheck }) : fail(failure)

const inputOf = (chain: ExtensionChain, ordinal: number, item: PassSubject) =>
  agentEvidence(`${chain.pass}/${item.action ?? ''}/input/${ordinal}`, item.subject)

async function readTenant<P>({ host }: Driver<P>, place: PassPlace) {
  const port = host.ports.enabledExtensions
  if (port === undefined) return null
  return port.read({ ...host.access, execution: host.execution, ...placeOf(place) })
}

async function open<P>(
  driver: Driver<P>,
  node: LoopNode,
  pass: Pass,
): Promise<Outcome<ExtensionChain | PassResult, Failure>> {
  const { host, mine } = driver
  if (host.cancelled()) return succeed({ kind: 'cancelled' })
  const read = await readTenant(driver, pass)
  if (read !== null && 'failure' in read)
    return waitingOn(read.failure, async () => (await readTenant(driver, pass)) ?? succeed(null))
  const members = membersAt(pass, {
    definition: host.definition,
    tenant: read === null ? [] : read.ok.members,
    system: pass.system ?? [],
  })
  if (members.length === 0) return succeed({ kind: 'none' })
  const subjects = await pass.subjects()
  if ('failure' in subjects) return waitingOn(subjects.failure, pass.subjects)
  if (subjects.ok.length === 0) return succeed({ kind: 'none' })
  const basis = read === null ? null : read.ok.basis
  const chain: ExtensionChain = { ...placeOf(pass), pass: pass.id, members, basis }
  const first = subjects.ok.map(item =>
    requestedCall(chain, 0, item.action, inputOf(chain, 0, item)),
  )
  const saved = await host.save(node, {
    checkpoint: { chain, passages: [...host.checkpoint().passages, ...first] },
  })
  if ('failure' in saved) return saved
  for (const call of first) mine.add(call.id)
  return succeed(chain)
}

async function invoke<P>(
  { host }: Driver<P>,
  call: Passage,
  subject: Subject,
  earlier: readonly Conclusion[],
  fresh: boolean,
): Promise<ExtensionInvocationResult> {
  const resolved = await host.ports.extensions.resolve({ ...host.access, passage: call })
  if ('failure' in resolved) return { kind: 'notStartedUnavailable' }
  const mode: ExtensionInvocationMode = fresh
    ? { kind: 'fresh' }
    : { kind: 'replay', binding: replayBinding(call) }
  const { position, dimension, id: passage } = call
  const input = { position, subject, earlier, execution: host.execution, passage }
  return resolved.ok.invoke(
    dimension === null ? input : { ...input, dimension },
    host.signal(),
    mode,
  )
}

async function conclude<P>(
  driver: Driver<P>,
  call: Passage,
  subject: Subject,
  earlier: readonly Conclusion[],
  trigger: Pass['trigger'],
) {
  const fresh = driver.mine.delete(call.id)
  const instant = await driver.host.ports.clock.now()
  if ('failure' in instant) return instant
  const result = await invoke(driver, call, subject, earlier, fresh)
  const mode = fresh ? ('fresh' as const) : ('replay' as const)
  const invocation = { mode, subject, trigger: trigger ?? null, at: instant.ok }
  return succeed({ invocation, concluded: concludeCall(call, invocation, result) })
}

type Open = Readonly<{ item: PassSubject; call: Passage; earlier: readonly Conclusion[] }>
type Stepped = Promise<Outcome<PassResult | null, Failure>>

const saving = <P>(driver: Driver<P>, node: LoopNode, changed: readonly Passage[]) => {
  const kept = driver.host
    .checkpoint()
    .passages.filter(passage => !changed.some(call => call.id === passage.id))
  return driver.host.save(node, { checkpoint: { passages: [...kept, ...changed] } })
}

// A final conclusion and the requested call of the member after it are one commit.
async function settle<P>(
  driver: Driver<P>,
  node: LoopNode,
  chain: ExtensionChain,
  open: Open,
  resolved: Passage,
  conclusion: Conclusion,
): Stepped {
  const next = nextOrdinal(chain, open.call, conclusion)
  const subject = effectiveSubject(open.item.subject, [...open.earlier, conclusion])
  const after = { ...open.item, subject }
  const following =
    next === null ? [] : [requestedCall(chain, next, after.action, inputOf(chain, next, after))]
  const saved = await saving(driver, node, [resolved, ...following])
  if ('failure' in saved) return saved
  for (const item of following) driver.mine.add(item.id)
  return succeed(null)
}

async function judge<P>(
  driver: Driver<P>,
  node: LoopNode,
  pass: Pass,
  chain: ExtensionChain,
  open: Open,
): Stepped {
  const { call, earlier } = open
  const subject = effectiveSubject(open.item.subject, earlier)
  const judged = await conclude(driver, call, subject, earlier, pass.trigger)
  if ('failure' in judged) return judged
  let concluded = judged.ok.concluded
  if (concluded.kind === 'unresolved') {
    const diagnostic = `${call.id}: ${concluded.diagnostic}`
    const failure: Unavailable = { kind: 'unavailable', owner: 'agentExtensions', diagnostic }
    return succeed({ kind: 'waiting', failure, recheck: null })
  }
  if (concluded.kind === 'ask') {
    const asked = askedRound(call, concluded.conclusion)
    if (asked.kind === 'opened') {
      const saved = await saving(driver, node, [asked.call])
      if ('ok' in saved) driver.host.cards.opened(asked.round)
      return 'failure' in saved ? saved : succeed(null)
    }
    concluded = concludeCall(call, judged.ok.invocation, { kind: 'replayInconsistent' })
    if (concluded.kind !== 'final') throw new Error(`the call ${call.id} has no error conclusion`)
  }
  const { conclusion } = concluded
  const resolved = resolveCall(call, conclusion, agentEvidence(`${call.id}/conclusion`, conclusion))
  if ('failure' in resolved)
    throw new Error(`the call ${call.id} cannot take a conclusion in ${resolved.failure.state}`)
  return settle(driver, node, chain, open, resolved.ok, conclusion)
}

async function presentRounds<P>(
  driver: Driver<P>,
  node: LoopNode,
  chain: ExtensionChain,
  asking: readonly Open[],
): Stepped {
  let unknown: Unavailable | null = null
  for (const open of asking) {
    const request = presentRequest(open.call)
    if (request === null) continue
    const cards = await driver.host.cards.present(request)
    if ('failure' in cards) return cards
    if (cards.ok.kind === 'unknown') {
      unknown = cards.ok.failure
      continue
    }
    if (cards.ok.kind === 'cards') {
      const presented = markPresented(open.call, cards.ok.cards)
      if ('failure' in presented) throw new Error(`the round ${request.round} cannot be presented`)
      const saved = await saving(driver, node, [presented.ok])
      if ('failure' in saved) return saved
      continue
    }
    const instant = await driver.host.ports.clock.now()
    if ('failure' in instant) return instant
    const subject = effectiveSubject(open.item.subject, open.earlier)
    const invocation = { mode: 'replay' as const, subject, trigger: null, at: instant.ok }
    const refused = concludeCall(open.call, invocation, {
      kind: 'errored',
      error: 'card presentation failed',
    })
    if (refused.kind !== 'final')
      throw new Error(`the call ${open.call.id} has no error conclusion`)
    const failed = failPresent(open.call, cards.ok.failure, refused.conclusion, cards.ok.failure)
    if ('failure' in failed) throw new Error(`the round ${request.round} cannot fail its present`)
    const settled = await settle(driver, node, chain, open, failed.ok, refused.conclusion)
    if ('failure' in settled) return settled
  }
  if (unknown === null) return succeed(null)
  return succeed({ kind: 'waiting', failure: unknown, recheck: null })
}

async function readReplies<P>(driver: Driver<P>, node: LoopNode, asking: readonly Open[]): Stepped {
  const waits: HumanWait[] = []
  const answered: Passage[] = []
  for (const open of asking) {
    let call = open.call
    const round = call.progress.kind === 'asked' ? call.progress.rounds.at(-1) : undefined
    if (round?.progress.kind !== 'presented') continue
    const unanswered: DurableEvidence[] = []
    for (const { card, response } of round.progress.cards) {
      if (response !== null) continue
      const reply = await driver.host.cards.read(card)
      if ('failure' in reply && reply.failure.kind !== 'unavailable') return reply
      const recorded =
        'failure' in reply || reply.ok.kind === 'pending' ? null : recordReply(call, card, reply.ok)
      if (recorded === null || 'failure' in recorded) unanswered.push(card)
      else call = recorded.ok
    }
    if (call !== open.call) answered.push(call)
    if (unanswered.length > 0) waits.push({ kind: 'human', passage: call.id, cards: unanswered })
  }
  if (answered.length === 0) return succeed({ kind: 'human', waits })
  const saved = await saving(driver, node, answered)
  return 'failure' in saved ? saved : succeed(null)
}

// Every chain is judged as far as it goes before a card is presented, and the cards of a pass are presented together.
async function advance<P>(
  driver: Driver<P>,
  node: LoopNode,
  pass: Pass,
  chain: ExtensionChain,
  subjects: readonly PassSubject[],
): Promise<Outcome<PassResult, Failure>> {
  const { host } = driver
  for (;;) {
    const passages = host.checkpoint().passages
    const states = subjects.map(item => ({
      item,
      state: chainState(callsOf(chain, passages, item.action)),
    }))
    const open: Open[] = states.flatMap(({ item, state }) =>
      state.kind === 'pending' ? [{ item, call: state.call, earlier: state.earlier }] : [],
    )
    if (open.length === 0) {
      const effects = states.map(({ item, state }) =>
        reduceChain(item.subject, state.kind === 'ended' ? state.conclusions : []),
      )
      return succeed({ kind: 'ended', effects, applied: closedPass({ chain, passages }) })
    }
    if (host.cancelled()) return succeed({ kind: 'cancelled' })
    const needs = open.map(item => needOf(item.call))
    const judging = open[needs.indexOf('judge')]
    if (needs.includes('closed'))
      return fail({
        kind: 'unavailable',
        owner: '@omne-harness/agent',
        diagnostic: `${chain.pass}: a card round that was closed without an answer is not handled yet`,
      })
    const stepped =
      judging !== undefined
        ? await judge(driver, node, pass, chain, judging)
        : needs.includes('present')
          ? await presentRounds(driver, node, chain, open)
          : await readReplies(driver, node, open)
    if ('failure' in stepped) return stepped
    if (stepped.ok !== null) return succeed(stepped.ok)
  }
}

async function run<P>(
  driver: Driver<P>,
  node: LoopNode,
  pass: Pass,
): Promise<Outcome<PassResult, Failure>> {
  let chain = driver.host.checkpoint().chain
  if (chain !== null && chain.pass !== pass.id)
    return fail({
      kind: 'unavailable',
      owner: '@omne-harness/agent#defect',
      diagnostic: `the pass ${pass.id} began while the pass ${chain.pass} is open`,
    })
  if (chain === null) {
    const opened = await open(driver, node, pass)
    if ('failure' in opened) return opened
    if ('kind' in opened.ok) return succeed(opened.ok)
    chain = opened.ok
  }
  const subjects = await pass.subjects()
  if ('failure' in subjects) return waitingOn(subjects.failure, pass.subjects)
  return advance(driver, node, pass, chain, subjects.ok)
}

// Nothing is saved after the terminal: the observers are requested before it, for the terminal to owe them.
async function planObservers<P>(
  driver: Driver<P>,
  pass: PassPlace & Readonly<{ id: string }>,
  at: Pick<AgentCheckpoint, 'passages'>,
): Promise<Outcome<PassState | null, Failure>> {
  const chain: ExtensionChain = { ...placeOf(pass), pass: pass.id, members: [], basis: null }
  const read = await readTenant(driver, pass)
  if (read !== null && 'failure' in read) {
    if (read.failure.kind !== 'unavailable') return read
    const unread = agentEvidence(`${pass.id}/unread`, read.failure)
    return succeed({ chain: { ...chain, unread }, passages: at.passages })
  }
  const members = membersAt(pass, {
    definition: driver.host.definition,
    tenant: read === null ? [] : read.ok.members,
    system: [],
  })
  if (members.length === 0) return succeed(null)
  const formed = { ...chain, members, basis: read === null ? null : read.ok.basis }
  const calls = members.map((_, ordinal) =>
    requestedCall(formed, ordinal, null, agentEvidence(`${pass.id}/input/${ordinal}`)),
  )
  for (const call of calls) driver.mine.add(call.id)
  return succeed({ chain: formed, passages: [...at.passages, ...calls] })
}

async function observe<P>(
  driver: Driver<P>,
  call: Passage,
  subject: Subject,
): Promise<Outcome<Conclusion | null, Failure>> {
  const judged = await conclude(driver, call, subject, [], undefined)
  if ('failure' in judged) return judged
  const { concluded } = judged.ok
  return succeed(concluded.kind === 'final' ? concluded.conclusion : null)
}

export function createPassDriver<P>(host: PassHost<P>) {
  const driver: Driver<P> = { host, mine: new Set() }
  return {
    run: (node: LoopNode, pass: Pass) => run(driver, node, pass),
    planObservers: (
      pass: PassPlace & Readonly<{ id: string }>,
      at: Pick<AgentCheckpoint, 'passages'>,
    ): Promise<Outcome<PassState | null, Failure>> => planObservers(driver, pass, at),
    observe: (call: Passage, subject: Subject) => observe(driver, call, subject),
  }
}

export type PassDriver = ReturnType<typeof createPassDriver>
