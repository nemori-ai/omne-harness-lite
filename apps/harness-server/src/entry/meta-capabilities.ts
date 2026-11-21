import type { SessionInteraction } from '@omne-harness/session-adapters'
import type { Outcome } from '@omne-harness/operation-result'
import type { SessionAccess } from '@omne-harness/session-contract'
import { unmetConditions, type ToolDefinition } from '@omne-harness/tool-contract'

export type SessionFacts = Pick<SessionInteraction, 'attendance' | 'humanInteraction' | 'child'>

export type SessionInteractionRead = (
  access: SessionAccess<unknown>,
) => Promise<Outcome<SessionFacts, string>>

export type SessionCommandReads = Readonly<{ interaction: SessionInteractionRead }>

type Condition = Readonly<{ holds(facts: SessionFacts): boolean; lacking: string }>

// The names a command may declare, each a fact the session publishes. Which command needs which
// is written in the definition of its tool: no tool and no command is named here.
const CONDITIONS: Readonly<Record<string, Condition>> = Object.freeze({
  'person-present': {
    holds: facts => facts.attendance === 'attended',
    lacking: 'no person attends this session',
  },
  'person-answers': {
    holds: facts => facts.humanInteraction,
    lacking: 'no person can be asked for an answer in this session now',
  },
  dispatched: {
    holds: facts => facts.child,
    lacking: 'this session was not dispatched by another agent',
  },
})

const NOTHING: ReadonlySet<string> = new Set()

export function heldConditions(facts: SessionFacts): ReadonlySet<string> {
  const held = Object.entries(CONDITIONS).filter(([, condition]) => condition.holds(facts))
  return new Set(held.map(([name]) => name))
}

/** True when some call of this tool needs a condition, so the facts of the session must be read. */
export function declaresConditions(definition: ToolDefinition): boolean {
  return definition.kind === 'function'
    ? definition.conditions !== undefined
    : definition.commands.some(command => command.conditions !== undefined)
}

function closedAnswer(tool: string, command: string | null, unmet: readonly string[]): string {
  const reasons = unmet.map(name => CONDITIONS[name]?.lacking ?? `"${name}" does not hold here`)
  const what = command === null ? 'this tool' : `the command "${command}"`
  return `${tool}: ${what} is not available here: ${reasons.join('; ')}. Continue without it, or stop and report what you need.`
}

export type MetaCommandVerdict =
  | Readonly<{ kind: 'open' }>
  | Readonly<{ kind: 'closed'; answer: string }>
  | Readonly<{ kind: 'unreadable'; diagnostic: string }>

/** Judges one call by the conditions its command declares and the facts the session publishes. */
export async function judgeCallConditions(
  read: SessionCommandReads,
  access: SessionAccess<unknown>,
  definition: ToolDefinition,
  command: string | null,
): Promise<MetaCommandVerdict> {
  if (unmetConditions(definition, command, NOTHING).length === 0) return { kind: 'open' }
  const interaction = await read.interaction(access)
  if ('failure' in interaction)
    return {
      kind: 'unreadable',
      diagnostic: `the standing of the session is unreadable: ${interaction.failure}`,
    }
  const unmet = unmetConditions(definition, command, heldConditions(interaction.ok))
  return unmet.length === 0
    ? { kind: 'open' }
    : { kind: 'closed', answer: closedAnswer(definition.name, command, unmet) }
}
