import { createHash } from 'node:crypto'
import {
  baseOf,
  judgeCard,
  NO_GOAL,
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
  type Proposal,
  type Provenance,
  type Readings,
  type Transition,
  type Wake,
} from '@omne-harness/goal-contract'

export type Entrance =
  | Readonly<{ via: 'direct'; draftedBy: 'person' | 'creator'; by: string }>
  | Readonly<{ via: 'card'; card: AnsweredCard }>

export type WriteInput = Readonly<{
  session: string
  attendance: Attendance
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

/** What a confirmation card shows is the rendered body; its digest is what the card is checked against. */
export const digestOf = (body: GoalBody): string =>
  `sha256:${createHash('sha256').update(renderBody(body)).digest('hex')}`

const refused = (reason: GoalRefusal): Decided => ({ kind: 'refused', reason })

/** The body this proposal comes to on what stands now. A revision needs a live body to change. */
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

/** A reading stays only while the entry it read stands unchanged. */
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

const wakeOf = (step: Transition, kind: Wake['kind'], state: GoalState, version: number) =>
  step.kind === 'changed' && step.effects.includes('wake') && state.status !== 'none'
    ? { kind, request: `${kind}/${String(state.generation)}/${String(version)}` }
    : null

/** A set or a revision, by the direct way in or on a card: what is written next, or why nothing is. */
export function decideWrite(current: GoalRecord | null, input: WriteInput): Decided {
  const { entrance, proposal, attendance } = input
  if (current?.history.some(entry => entry.operation === input.operation))
    return { kind: 'recalled', record: current }
  const state = current?.state ?? NO_GOAL
  if (entrance.via === 'card') {
    if (attendance === 'unattended') return refused({ kind: 'state', reason: 'nobody-attends' })
    const { card } = entrance
    const stale = judgeCard(card, { digest: card.digest, base: baseOf(state), used: false })
    if (stale !== null) return refused({ kind: 'card', reason: stale })
  }
  const byCard = entrance.via === 'card'
  const event: GoalEvent =
    proposal.kind === 'set' ? { kind: 'set', attendance } : { kind: 'revise', confirmed: byCard }
  const step = transition(state, event)
  if (step.kind === 'refused') return refused({ kind: 'state', reason: step.reason })
  const checked = proposedBody(current, proposal, attendance)
  if (checked.kind === 'no-live-goal') return refused({ kind: 'state', reason: 'no-live-goal' })
  if (checked.kind === 'invalid') return refused({ kind: 'invalid', issues: checked.issues })
  if (step.kind !== 'changed' || step.next.status === 'none')
    return refused({ kind: 'state', reason: 'no-live-goal' })
  const { body } = checked
  if (byCard && digestOf(body) !== entrance.card.digest)
    return refused({ kind: 'card', reason: 'content-differs' })
  const provenance: Provenance = {
    revision: step.next.revision,
    via: entrance.via,
    words: input.words,
    draftedBy: byCard ? 'agent' : entrance.draftedBy,
    confirmedBy: byCard ? entrance.card.by : entrance.by,
    operation: input.operation,
    at: input.at,
  }
  const revising = proposal.kind === 'revise' && current !== null
  const version = (current?.version ?? 0) + 1
  const kind = proposal.kind === 'set' ? 'start' : 'resume'
  return {
    kind: 'next',
    record: {
      session: input.session,
      version,
      state: step.next,
      body,
      history: revising ? [...current.history, provenance] : [provenance],
      readings: revising ? keptReadings(current.body, body, current.readings) : NO_READINGS,
      // On a card the agent that proposed is in its run and reads the answer there: nobody is to be woken.
      wake: byCard ? null : wakeOf(step, kind, step.next, version),
    },
  }
}

function eventOf(body: GoalBody | null, command: GoalCommand): GoalEvent | null {
  if (command.kind !== 'settle-by-exit') return { kind: command.kind }
  const exit = body?.exits.find(entry => entry.id === command.exit)
  return exit === undefined ? null : { kind: 'settle-by-exit', exit: exit.id, counts: exit.counts }
}

/** A command of the owner: pause, resume, cancel, abort, or settle by the exit that paused it. Null: there is no goal and nothing to do. */
export function decideCommand(current: GoalRecord | null, command: GoalCommand): Decided | null {
  const event = eventOf(current?.body ?? null, command)
  if (event === null)
    return refused({ kind: 'state', reason: current === null ? 'no-live-goal' : 'not-its-cause' })
  const step = transition(current?.state ?? NO_GOAL, event)
  if (step.kind === 'refused') return refused({ kind: 'state', reason: step.reason })
  if (current === null) return null
  if (step.kind === 'unchanged') return { kind: 'unchanged', record: current }
  const version = current.version + 1
  const wake = wakeOf(step, 'resume', step.next, version)
  return { kind: 'next', record: { ...current, version, state: step.next, wake } }
}
