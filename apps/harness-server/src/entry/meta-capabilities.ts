import type { SessionInteraction } from '@omne-harness/session-adapters'
import type { Outcome } from '@omne-harness/operation-result'
import type { SessionAccess } from '@omne-harness/session-contract'

export type SessionInteractionRead = (
  access: SessionAccess<unknown>,
) => Promise<Outcome<Pick<SessionInteraction, 'humanInteraction'>, string>>

export type SessionCommandReads = Readonly<{ interaction: SessionInteractionRead }>

const ASKS_A_PERSON: Readonly<Record<string, readonly string[]>> = Object.freeze({
  Ask: Object.freeze(['ask']),
})

const CLOSED =
  'This session does not let you ask a person (collaboration mode). Continue without the answer, or stop and report what you need.'

export type MetaCommandVerdict =
  | Readonly<{ kind: 'open' }>
  | Readonly<{ kind: 'closed'; answer: string }>
  | Readonly<{ kind: 'unreadable'; diagnostic: string }>

export async function judgeMetaCommand(
  read: SessionCommandReads,
  access: SessionAccess<unknown>,
  tool: string,
  command: string | null,
): Promise<MetaCommandVerdict> {
  if (command === null || ASKS_A_PERSON[tool]?.includes(command) !== true) return { kind: 'open' }
  const interaction = await read.interaction(access)
  if ('failure' in interaction)
    return {
      kind: 'unreadable',
      diagnostic: `the human interaction of the session is unreadable: ${interaction.failure}`,
    }
  return interaction.ok.humanInteraction
    ? { kind: 'open' }
    : {
        kind: 'closed',
        answer: `${tool}: the command "${command}" is not available now. ${CLOSED}`,
      }
}
