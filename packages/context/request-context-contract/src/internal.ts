import { createHash } from 'node:crypto'
import { judgeBlockIdentity, type TextContentBlock } from '@omne-harness/content-block'
import { parseMessageId, type MessageId, type SystemReminderMessage } from '@omne-harness/message'
/** Canonical data encoding. Object keys are sorted recursively; array order is retained. */
export function canonical(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
    .join(',')}}`
}
export function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('base64url')
}
export function messageId(value: unknown): MessageId {
  const parsed = parseMessageId(`msg_${digest(value)}`)
  if (!parsed.ok) throw new Error('Deterministic message identity is invalid')
  return parsed.value
}
export function textBlock(text: string, identity: unknown): TextContentBlock {
  const parsed = judgeBlockIdentity({
    id: `rq_${digest(identity)}`,
    visibility: { toHuman: true, toModel: true },
  })
  if ('rejected' in parsed) throw new Error('Deterministic block identity is invalid')
  return { kind: 'text', ...parsed.ok, text }
}
export function reminder(text: string, identity: unknown): SystemReminderMessage {
  return { role: 'system_reminder', id: messageId(identity), blocks: [textBlock(text, identity)] }
}
export function nonEmpty<T>(xs: readonly T[]): xs is readonly [T, ...T[]] {
  return xs.length > 0
}
export function decimalParts(text: string): Readonly<{ n: bigint; scale: bigint }> {
  const [whole = '0', fraction = ''] = text.split('.')
  return { n: BigInt(whole + fraction), scale: 10n ** BigInt(fraction.length) }
}
export function measuredAmount(check: import('@omne-harness/model-contract').BudgetCheck): bigint {
  const value = decimalParts(check.measurement.amount),
    margin = decimalParts(check.measurement.kind === 'estimate' ? check.measurement.margin : '0')
  const n = value.n * margin.scale + margin.n * value.scale,
    d = value.scale * margin.scale
  return (n + d - 1n) / d
}
