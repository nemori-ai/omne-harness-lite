// 元能力宿主对命令可用性的判定（meta-capabilities 产品正文「协作模式与命令限制」；session-adapters SPEC「模式翻译表」）：
// 元工具的某些命令要会话允许与人交互。宿主只读 Session 翻译好的值，不认识模式词；判在调用准入那一刻，
// 每次现读，所以切换模式之后的下一次调用就按新值判，已经在等的调用与卡片不受影响。
// - 允许：命令照常送去运行。
// - 不允许：命令不运行，调用方得到不可用的原因作为这次调用的答复；元工具与它的其他命令照常可见。
// - 读不到：不猜，不放行，答 unavailable。
// 本发行只有 Ask 的两条命令受此限制，读两个翻译值：
// - 协作一侧的两个布尔值（人机交互可用、可请求批准）：ask 与 request_approval 各按自己的值判。
// - 权限一侧的询问处理（`InquiryPolicy.onAsk`）：为 `deny` 时会话不向人问批准，request_approval 不可用
//   （产品正文同节「`never` 使 request_approval 不可用」）。两个布尔值不重复表达它（session-adapters SPEC 同表），
//   所以宿主另读这一个值；协作一侧已经关掉时不再读它。
import type { SessionInquiryView, SessionInteraction } from '@omne-harness/session-adapters'
import type { Outcome } from '@omne-harness/operation-result'
import type { SessionAccess } from '@omne-harness/session-contract'

/** 会话当前允许的人机交互；读不到时答原因。 */
export type SessionInteractionRead = (
  access: SessionAccess<unknown>,
) => Promise<Outcome<Pick<SessionInteraction, 'humanInteraction' | 'requestApproval'>, string>>

/** 会话当前的询问处理（权限一侧的翻译值）；读不到时答原因。 */
export type SessionInquiryRead = (
  access: SessionAccess<unknown>,
) => Promise<Outcome<SessionInquiryView['inquiry']['policy']['onAsk'], string>>

/** 元能力宿主判命令时读的两个来源，每次调用现读。 */
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

/** 询问处理为 `deny` 时 request_approval 的答复。 */
const ASKS_NOBODY =
  'This session asks nobody for approval (permission mode). This is not permission: do not do the action.'

export type MetaCommandVerdict =
  | Readonly<{ kind: 'open' }>
  | Readonly<{ kind: 'closed'; answer: string }>
  | Readonly<{ kind: 'unreadable'; diagnostic: string }>

/** 这条命令此刻能否运行。不受限制的命令不读会话。 */
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
