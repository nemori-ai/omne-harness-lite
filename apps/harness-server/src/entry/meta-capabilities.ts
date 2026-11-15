import type { SessionInquiryView, SessionInteraction } from '@omne-harness/session-adapters'
import type { Outcome } from '@omne-harness/operation-result'
import type { SessionAccess } from '@omne-harness/session-contract'

export type SessionInteractionRead = (
  access: SessionAccess<unknown>,
) => Promise<Outcome<Pick<SessionInteraction, 'humanInteraction' | 'requestApproval'>, string>>

export type SessionInquiryRead = (
  access: SessionAccess<unknown>,
) => Promise<Outcome<SessionInquiryView['inquiry']['policy']['onAsk'], string>>

export type SessionCommandReads = Readonly<{
  interaction: SessionInteractionRead
  inquiry: SessionInquiryRead
}>

type Need = 'humanInteraction' | 'requestApproval'

const NEEDS: Readonly<Record<string, Readonly<Record<string, Need>>>> = Object.freeze({
  Ask: Object.freeze({ ask: 'humanInteraction', request_approval: 'requestApproval' }),
})

const CLOSED: Readonly<Record<Need, string>> = Object.freeze({
  humanInteraction:
    'This session does not let you ask a person (collaboration mode). Continue without the answer, or stop and report what you need.',
  requestApproval:
    'This session does not let you ask a person for approval (collaboration mode). This is not permission: do not do the action.',
})

const ASKS_NOBODY =
  'This session asks nobody for approval (permission mode). This is not permission: do not do the action.'

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
  const need = command === null ? undefined : NEEDS[tool]?.[command]
  if (need === undefined) return { kind: 'open' }
  const closed = (reason: string): MetaCommandVerdict => ({
    kind: 'closed',
    answer: `${tool}: the command "${command}" is not available now. ${reason}`,
  })
  const interaction = await read.interaction(access)
  if ('failure' in interaction)
    return {
      kind: 'unreadable',
      diagnostic: `the human interaction of the session is unreadable: ${interaction.failure}`,
    }
  if (!interaction.ok[need]) return closed(CLOSED[need])
  if (need !== 'requestApproval') return { kind: 'open' }
  const inquiry = await read.inquiry(access)
  if ('failure' in inquiry)
    return {
      kind: 'unreadable',
      diagnostic: `the permission inquiry of the session is unreadable: ${inquiry.failure}`,
    }
  return inquiry.ok === 'deny' ? closed(ASKS_NOBODY) : { kind: 'open' }
}
