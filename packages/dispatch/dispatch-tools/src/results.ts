import type {
  AcceptRefusal,
  MessageRefusal,
  Outcome as DomainOutcome,
  ParseRefusal,
  ReportRefusal,
  ShowRefusal,
  WithdrawRefusal,
} from '@omne-harness/dispatch-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolPrimitiveFailure } from '@omne-harness/tool-contract/provider'
import type { AgentsCommandName } from './protocol.ts'

/** The text of a completed call, or why it failed. */
export type Answer = Outcome<string, ToolPrimitiveFailure>
export type Failed = Outcome<never, ToolPrimitiveFailure>

export type Refusal =
  | ParseRefusal
  | AcceptRefusal
  | MessageRefusal
  | WithdrawRefusal
  | ReportRefusal
  | ShowRefusal
type Kind = 'invalid' | 'unsupported' | 'capacity' | 'conflict'

/** Every refusal of the domain is a failed result that names the reason and what to do about it. */
const REFUSALS: Readonly<Record<Refusal, readonly [Kind, string]>> = {
  'invalid-request': ['invalid', 'the dispatch services refuse a value of this command'],
  'not-permitted': ['unsupported', 'this call may not do that'],
  'dispatcher-archived': ['unsupported', 'this session is archived; it cannot dispatch'],
  'unknown-agent': ['invalid', 'no such agent definition for this tenant; see targets'],
  'agent-not-master': ['unsupported', 'a handoff goes to a master definition only; see targets'],
  'too-deep': [
    'unsupported',
    'this session is at the deepest layer that can be dispatched to; do the work here, or use handoff',
  ],
  'too-many-open': [
    'capacity',
    'this session has as many open dispatches as it may; wait for a report or withdraw one',
  ],
  'context-unavailable': [
    'unsupported',
    'the copy of this conversation that spawn hands over cannot be given now; use delegate and write the context into the instruction',
  ],
  conflict: ['conflict', 'this call already asked for another dispatch'],
  'to-self': ['invalid', 'a message goes to another session, not to your own'],
  'no-such-session': ['invalid', 'no such session for this tenant; see list'],
  archived: ['unsupported', 'that session is archived and takes no message'],
  'no-such-dispatch': ['invalid', 'no such dispatch for this tenant; see list'],
  'not-started': ['conflict', 'the session of the dispatch does not exist yet; try again shortly'],
  'already-reported': ['conflict', 'the dispatch already has its one report'],
  failed: ['conflict', 'the dispatch has failed; see show'],
  withdrawn: ['conflict', 'the dispatch was withdrawn; a report is no longer taken'],
  'no-report-in-this-mode': ['unsupported', 'work that was handed over has no report'],
  'cannot-withdraw-a-handoff': ['unsupported', 'work that was handed over cannot be taken back'],
  unreachable: ['conflict', 'the dispatch is in a state this command does not apply to; see show'],
  'not-dispatched': ['unsupported', 'no work was dispatched to this session, so it has no report'],
}

export const completed = (command: AgentsCommandName, value: unknown): Answer =>
  succeed(`done Agents ${command}\n${JSON.stringify(value)}`)

export function refused(reason: Refusal): Failed {
  const [kind, hint] = REFUSALS[reason]
  return fail({ kind, reason: `${reason}: ${hint}` })
}

const operationOf = (command: AgentsCommandName) => `Agents.${command}`

export const unavailable = (command: AgentsCommandName, why: string): Failed =>
  fail({ kind: 'unavailable', operation: operationOf(command), reason: why })

const NOT_KNOWN =
  'it is not known whether this took effect; send the same command again: what took effect is recalled, not done twice'

export const unknown = (command: AgentsCommandName): Failed =>
  fail({ kind: 'unknown', operation: operationOf(command), reason: NOT_KNOWN })

export const NOW_UNAVAILABLE = 'the dispatch services cannot answer now; nothing was changed'

/** What the domain answered, as the result of the call. */
export function answered<T, R extends Refusal>(
  command: AgentsCommandName,
  outcome: DomainOutcome<T, R>,
  done: (value: T, recalled: boolean) => unknown,
): Answer {
  switch (outcome.kind) {
    case 'done':
      return completed(command, done(outcome.value, outcome.recalled))
    case 'refused':
      return refused(outcome.reason)
    case 'basis-unavailable':
      return unavailable(command, NOW_UNAVAILABLE)
    case 'unknown':
      return unknown(command)
  }
}

type Call<T, R> = () => Promise<DomainOutcome<T, R>>

/** A read that throws has no basis. */
export async function reading<T, R extends Refusal>(
  command: AgentsCommandName,
  call: Call<T, R>,
  done: (value: T) => unknown,
): Promise<Answer> {
  const outcome = await call().catch(() => ({ kind: 'basis-unavailable' }) as const)
  return answered(command, outcome, done)
}

/** A write that throws has an unknown result. */
export async function writing<T, R extends Refusal>(
  command: AgentsCommandName,
  call: Call<T, R>,
  done: (value: T, recalled: boolean) => unknown,
): Promise<Answer> {
  const outcome = await call().catch(() => ({ kind: 'unknown' }) as const)
  return answered(command, outcome, done)
}
