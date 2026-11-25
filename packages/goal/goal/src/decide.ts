import { createHash } from 'node:crypto'
import {
  baseOf,
  judgeCard,
  keptProgress,
  NO_GOAL,
  NO_PROGRESS,
  NO_READINGS,
  renderBody,
  reviseBody,
  transition,
  validateDraft,
  type AnsweredCard,
  type Attendance,
  type BodyCheck,
  type GoalBody,
  type GoalCommand,
  type GoalEvent,
  type GoalRecord,
  type GoalRefusal,
  type GoalState,
  type SetGoalState,
  type Proposal,
  type Proposed,
  type Provenance,
  type Readings,
} from '@omne-harness/goal-contract'

export type Entrance =
  | Readonly<{ via: 'direct'; draftedBy: 'person' | 'creator'; by: string }>
  | Readonly<{ via: 'card'; card: AnsweredCard }>

export type WriteInput = Readonly<{
  session: string
  attendance: Attendance
  moment: string
  proposal: Proposal
  entrance: Entrance
  operation: string
  words: string | null
  at: string
}>

export type Decided =
  | Readonly<{ kind: 'recalled'; record: GoalRecord }>
  | Readonly<{ kind: 'unchanged'; record: GoalRecord }>
  | Readonly<{ kind: 'refused'; reason: GoalRefusal }>
  | Readonly<{ kind: 'next'; record: GoalRecord }>

export const digestOf = (body: GoalBody): string =>
  `sha256:${createHash('sha256').update(renderBody(body)).digest('hex')}`

const refused = (reason: GoalRefusal): Decided => ({ kind: 'refused', reason })

export function proposedBody(
  current: GoalRecord | null,
  proposal: Proposal,
  attendance: Attendance,
): BodyCheck | Readonly<{ kind: 'no-live-goal' }> {
  if (proposal.kind === 'set') return validateDraft(proposal.draft, { attendance })
  const live = current !== null && current.state.status !== 'settled'
  return live
    ? reviseBody(current.body, proposal.changes, { attendance })
    : { kind: 'no-live-goal' }
}

function keptReadings(before: GoalBody, after: GoalBody, readings: Readings): Readings {
  const same = (section: 'criteria' | 'metrics' | 'rules') => {
    const was = new Map(before[section].map(entry => [entry.id, JSON.stringify(entry)]))
    const kept = new Set<string>(
      after[section].filter(entry => was.get(entry.id) === JSON.stringify(entry)).map(e => e.id),
    )
    return Object.fromEntries(Object.entries(readings[section]).filter(([id]) => kept.has(id)))
  }
  return { criteria: same('criteria'), metrics: same('metrics'), rules: same('rules') } as Readings
}

function cardRefusal(entrance: Entrance, state: GoalState, attendance: Attendance) {
  if (entrance.via !== 'card') return null
  if (attendance === 'unattended') return refused({ kind: 'state', reason: 'nobody-attends' })
  const { card } = entrance
  const stale = judgeCard(card, { digest: card.digest, base: baseOf(state), used: false })
  return stale === null ? null : refused({ kind: 'card', reason: stale })
}

function provenanceOf(input: WriteInput, revision: number): Provenance {
  const { entrance } = input
  const byCard = entrance.via === 'card'
  return {
    revision,
    via: entrance.via,
    words: input.words,
    draftedBy: byCard ? 'agent' : entrance.draftedBy,
    confirmedBy: byCard ? entrance.card.by : entrance.by,
    operation: input.operation,
    at: input.at,
  }
}

type Stood = Readonly<{
  state: SetGoalState
  body: GoalBody
  wakes: boolean
}>

/** The state and the body this write comes to, or why it does not stand: the card, then the state, then the body. */
function stand(current: GoalRecord | null, input: WriteInput): Stood | Decided {
  const { entrance, proposal, attendance } = input
  const state = current?.state ?? NO_GOAL
  const stop = cardRefusal(entrance, state, attendance)
  if (stop !== null) return stop
  const byCard = entrance.via === 'card'
  const event: GoalEvent =
    proposal.kind === 'set' ? { kind: 'set', attendance } : { kind: 'revise', confirmed: byCard }
  const step = transition(state, event)
  if (step.kind === 'refused') return refused({ kind: 'state', reason: step.reason })
  const checked = proposedBody(current, proposal, attendance)
  if (checked.kind === 'invalid') return refused({ kind: 'invalid', issues: checked.issues })
  if (checked.kind !== 'valid' || step.kind !== 'changed')
    return refused({ kind: 'state', reason: 'no-live-goal' })
  if (byCard && digestOf(checked.body) !== entrance.card.digest)
    return refused({ kind: 'card', reason: 'content-differs' })
  // On a card the agent that proposed is in its run and reads the answer there: nobody is to be woken.
  return { state: step.next, body: checked.body, wakes: !byCard && step.effects.includes('wake') }
}

export function decideWrite(current: GoalRecord | null, input: WriteInput): Decided {
  if (current?.history.some(entry => entry.operation === input.operation))
    return { kind: 'recalled', record: current }
  const stood = stand(current, input)
  if ('kind' in stood) return stood
  const { state, body } = stood
  const provenance = provenanceOf(input, state.revision)
  const before = input.proposal.kind === 'revise' ? current : null
  const version = (current?.version ?? 0) + 1
  const request = `start/${String(state.generation)}/${String(version)}`
  const wake = stood.wakes ? ({ kind: 'start', request } as const) : null
  const kept = before === null ? fresh(input.moment) : carried(before, body)
  const history = [...kept.history, provenance]
  return {
    kind: 'next',
    record: {
      session: input.session,
      version,
      state,
      body,
      ...kept,
      history,
      wake,
      observed: null,
    },
  }
}

type Kept = Pick<GoalRecord, 'history' | 'readings' | 'progress' | 'since'>
const fresh = (since: string): Kept => ({
  history: [],
  readings: NO_READINGS,
  progress: NO_PROGRESS,
  since,
})
/** What a revision carries over: the history, where the goal began, and what was read and said of the entries it left alone. */
const carried = (before: GoalRecord, body: GoalBody): Kept => ({
  history: before.history,
  readings: keptReadings(before.body, body, before.readings),
  progress: keptProgress(before.body, body, before.progress),
  since: before.since,
})

type Described = Readonly<{ proposed: Proposed }> | Readonly<{ refusal: GoalRefusal }>

/** What a confirmation card of this proposal would show and stand on, or why there is nothing to show. */
export function describeProposal(
  current: GoalRecord | null,
  proposal: Proposal,
  attendance: Attendance,
): Described {
  if (attendance === 'unattended') return { refusal: { kind: 'state', reason: 'nobody-attends' } }
  const checked = proposedBody(current, proposal, attendance)
  if (checked.kind === 'no-live-goal') return { refusal: { kind: 'state', reason: 'no-live-goal' } }
  if (checked.kind === 'invalid') return { refusal: { kind: 'invalid', issues: checked.issues } }
  const { body } = checked
  const changed = proposal.kind === 'set' ? [] : changedIn(current?.body, body)
  const base = baseOf(current?.state ?? NO_GOAL)
  const rendered = renderBody(body)
  return { proposed: { kind: proposal.kind, rendered, digest: digestOf(body), base, changed } }
}

function eventOf(body: GoalBody | null, command: GoalCommand): GoalEvent | null {
  if (command.kind !== 'settle-by-exit') return { kind: command.kind }
  const exit = body?.exits.find(entry => entry.id === command.exit)
  return exit === undefined ? null : { kind: 'settle-by-exit', exit: exit.id, counts: exit.counts }
}

/** A command of the owner: pause, resume, cancel, abort, or settle by the exit that paused it. Null: there is no goal and nothing to do. */
export function decideCommand(
  current: GoalRecord | null,
  command: GoalCommand,
  generation?: number,
): Decided | null {
  if (generation !== undefined && current?.state.generation !== generation)
    return refused({ kind: 'another-goal' })
  const event = eventOf(current?.body ?? null, command)
  if (event === null)
    return refused({ kind: 'state', reason: current === null ? 'no-live-goal' : 'not-its-cause' })
  const step = transition(current?.state ?? NO_GOAL, event)
  if (step.kind === 'refused') return refused({ kind: 'state', reason: step.reason })
  if (current === null) return null
  if (step.kind === 'unchanged') return { kind: 'unchanged', record: current }
  const version = current.version + 1
  const request = `resume/${String(current.state.generation)}/${String(version)}`
  const wake = step.effects.includes('wake') ? ({ kind: 'resume', request } as const) : null
  return { kind: 'next', record: { ...current, version, state: step.next, wake } }
}

const NUMBERED = ['criteria', 'metrics', 'rules', 'exits', 'references'] as const

/** What differs between two bodies, by number: entries added, replaced or removed, then `purpose` and `method` by name. */
export function changedIn(before: GoalBody | undefined, after: GoalBody): readonly string[] {
  if (before === undefined) return []
  const entries = (body: GoalBody) =>
    new Map(NUMBERED.flatMap(name => body[name].map(e => [e.id as string, JSON.stringify(e)])))
  const [was, now] = [entries(before), entries(after)]
  const ids = [...new Set([...was.keys(), ...now.keys()])].filter(id => was.get(id) !== now.get(id))
  const named = (['purpose', 'method'] as const).filter(
    name => JSON.stringify(before[name]) !== JSON.stringify(after[name]),
  )
  return [...ids, ...named]
}
