import type {
  CardRefusal,
  GoalRefusal,
  Outcome as DomainOutcome,
  Refusal,
} from '@omne-harness/goal-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolPrimitiveFailure } from '@omne-harness/tool-contract/provider'
import type { BoundGoal, Reached } from './port.ts'
import type { GoalCommandName } from './protocol.ts'

/** The text of a completed call, or why it failed. */
export type Answer = Outcome<string, ToolPrimitiveFailure>
export type Failed = Outcome<never, ToolPrimitiveFailure>
type Kind = 'invalid' | 'unsupported' | 'conflict'

const STATE: Readonly<Record<Refusal, readonly [Kind, string]>> = {
  'no-live-goal': ['conflict', 'this session has no goal in progress or paused; propose one first'],
  'goal-in-progress': [
    'conflict',
    'this session already has a goal that is not settled; propose changes to it instead',
  ],
  'nobody-attends': ['unsupported', 'nobody attends this session, so its goal is not changed here'],
  attended: ['unsupported', 'a person attends this session and decides that'],
  'not-its-cause': ['conflict', 'the goal is not paused by that exit'],
}
const CARD: Readonly<Record<CardRefusal, string>> = {
  'not-a-member': 'the card was not answered by a member of this session',
  'not-confirmed': 'the card was not answered with the confirm option',
  'already-used': 'the card already wrote its revision',
  'stale-base': 'the goal changed after this card was drafted; read it with show and propose again',
  'content-differs': 'the card showed another body than this proposal; propose again',
}

export const completed = (command: GoalCommandName, text: string): Answer =>
  succeed(`done Goal ${command}\n${text}`)

/** Every refusal of the domain is a failed result that names the reason and what to do about it. */
export function refused(reason: GoalRefusal): Failed {
  if (reason.kind === 'invalid') {
    const lines = reason.issues.map(
      issue => `${issue.entry ?? 'body'}.${issue.field}: ${issue.problem}`,
    )
    return fail({
      kind: 'invalid',
      reason: `invalid: ${lines.join('; ')}. Fix these and send it again.`,
    })
  }
  if (reason.kind === 'state') {
    const [kind, hint] = STATE[reason.reason]
    return fail({ kind, reason: `${reason.reason}: ${hint}` })
  }
  if (reason.kind === 'card')
    return fail({ kind: 'conflict', reason: `${reason.reason}: ${CARD[reason.reason]}` })
  const hint = reason.kind === 'denied' ? 'this call may not do that' : 'nothing to act on'
  return fail({ kind: 'unsupported', reason: `${reason.kind}: ${hint}` })
}

const operationOf = (command: GoalCommandName) => `Goal.${command}`

export const unavailable = (command: GoalCommandName, why: string): Failed =>
  fail({ kind: 'unavailable', operation: operationOf(command), reason: why })

const NOT_KNOWN =
  'it is not known whether this took effect; read the goal with show before you send it again'

export const unknown = (command: GoalCommandName): Failed =>
  fail({ kind: 'unknown', operation: operationOf(command), reason: NOT_KNOWN })

export const NOW_UNAVAILABLE = 'the goal services cannot answer now; nothing was changed'

/** What the domain answered, as the result of the call. */
export function answered<T>(
  command: GoalCommandName,
  outcome: DomainOutcome<T, GoalRefusal>,
  done: (value: T) => string,
): Answer {
  switch (outcome.kind) {
    case 'done':
      return completed(command, done(outcome.value))
    case 'refused':
      return refused(outcome.reason)
    case 'basis-unavailable':
      return unavailable(command, NOW_UNAVAILABLE)
    case 'unknown':
      return unknown(command)
  }
}

const UNREACHABLE = {
  unattached: 'the goal services are not attached to this call',
  unavailable: 'the goal services are not available now',
  forbidden: 'this call does not act as a session of the tenant',
} as const

/** The services of a call, or the failed result that says why they cannot be reached from it. */
export async function reachFrom(
  command: GoalCommandName,
  bound: BoundGoal | undefined,
): Promise<Readonly<{ reached: Reached; bound: BoundGoal }> | Failed> {
  if (bound === undefined) return unavailable(command, UNREACHABLE.unattached)
  const reached = await bound.reach()
  if ('unreachable' in reached) return unavailable(command, UNREACHABLE[reached.unreachable])
  return { reached, bound }
}
