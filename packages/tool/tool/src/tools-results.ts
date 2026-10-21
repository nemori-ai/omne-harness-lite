import { judgeContentBlock } from '@omne-harness/content-block'
import { readJsonText } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  defaultResultPolicy,
  type Attachment,
  type OutputCodec,
  type ToolFailure,
  type ToolMessageContentBlock,
  type ToolResult,
} from '@omne-harness/tool-contract'
import { formatError, formatSection } from '@omne-harness/unix-format'
import { toolsAdoption } from './tools-protocol.ts'

export type MessageResult = ToolResult<ToolMessageContentBlock>
export function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value))
}
export function message(
  text: string,
  content: readonly ToolMessageContentBlock[] = [],
  attachments: readonly Attachment[] = [],
): MessageResult {
  let id = 'Tools.status'
  const used = new Set<string>(content.map(block => block.id))
  while (used.has(id)) id += '.'
  const block = judgeContentBlock({
    kind: 'text',
    id,
    visibility: { toModel: true, toHuman: true },
    text,
  })
  if ('rejected' in block || block.ok.kind !== 'text')
    throw new TypeError('Invalid Tools status block')
  return {
    content: [block.ok, ...content],
    data: { kind: 'none' },
    original: { kind: 'none' },
    attachments,
  }
}
export function failureResult(failure: ToolFailure): MessageResult {
  const detail =
    failure.kind === 'denied' &&
    ['read-result', 'read-content', 'read-raw-content', 'read-raw'].includes(failure.action)
      ? ` (${failure.action})`
      : ''
  const command =
    failure.kind === 'invalid' &&
    failure.field === 'command' &&
    failure.reason === 'unknown-command'
      ? ' (unknown-command)'
      : ''
  return message(formatError(`${failure.kind}${detail}${command}`))
}
export const budgetFailure = (): ToolFailure => ({
  kind: 'unsupported',
  adoption: toolsAdoption,
  reason: 'tools-reply-budget-or-provider',
})
export function fits(
  value: MessageResult,
  options: Readonly<{ resultPageBytes: number; replyMaxBytes: number }>,
): boolean {
  return (
    value.content.every(block => jsonBytes(block) <= options.resultPageBytes) &&
    jsonBytes(value) <= options.replyMaxBytes
  )
}
export function bounded(
  value: MessageResult,
  options: Readonly<{ resultPageBytes: number; replyMaxBytes: number }>,
): MessageResult {
  return fits(value, options) ? value : failureResult(budgetFailure())
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function none(value: unknown): boolean {
  return record(value) && Object.keys(value).length === 1 && value.kind === 'none'
}
function attachment(value: unknown): Outcome<Attachment, Readonly<{ reason: string }>> {
  const block = judgeContentBlock({
    kind: 'file',
    id: 'attachment',
    visibility: { toModel: true, toHuman: true },
    ref: value,
    transcript: null,
  })
  if ('rejected' in block) return fail({ reason: 'invalid-attachment' })
  const judged = defaultResultPolicy.judge(block.ok)
  return 'ok' in judged && 'ref' in judged.ok
    ? succeed(judged.ok.ref)
    : fail({ reason: 'invalid-attachment' })
}
export function checkMessage(value: unknown): Outcome<MessageResult, Readonly<{ reason: string }>> {
  if (
    !record(value) ||
    Object.keys(value).length !== 4 ||
    !Array.isArray(value.content) ||
    !Array.isArray(value.attachments) ||
    !none(value.data) ||
    !none(value.original)
  )
    return fail({ reason: 'invalid-tools-result' })
  const content: ToolMessageContentBlock[] = [],
    attachments: Attachment[] = []
  for (const block of value.content) {
    const checked = judgeContentBlock(block)
    if ('rejected' in checked) return fail({ reason: 'invalid-tools-content' })
    const allowed = defaultResultPolicy.judge(checked.ok)
    if ('failure' in allowed) return allowed
    content.push(allowed.ok)
  }
  for (const item of value.attachments) {
    const checked = attachment(item)
    if ('failure' in checked) return checked
    attachments.push(checked.ok)
  }
  return succeed({ content, attachments, data: { kind: 'none' }, original: { kind: 'none' } })
}
export function outputCodec(maxBytes: number): OutputCodec<MessageResult> {
  const check = (value: unknown) => {
    const checked = checkMessage(value)
    return 'ok' in checked && jsonBytes(checked.ok) > maxBytes
      ? fail({ reason: 'tools-output-budget' })
      : checked
  }
  return {
    adoption: toolsAdoption,
    encode(value) {
      const checked = check(value)
      return 'failure' in checked ? checked : succeed(Buffer.from(JSON.stringify(checked.ok)))
    },
    decode(bytes) {
      if (bytes.byteLength > maxBytes) return fail({ reason: 'tools-output-budget' })
      const text = Buffer.from(bytes).toString('utf8')
      const parsed = readJsonText(text, {
        maxBytes,
        maxDepth: 64,
        maxItems: maxBytes,
        maxMembers: maxBytes,
        maxStringLength: maxBytes,
        maxNumberLength: 64,
      })
      if (parsed.kind !== 'ok' || !Buffer.from(text).equals(bytes))
        return fail({ reason: 'invalid-tools-output-json' })
      const value: unknown = JSON.parse(text)
      return check(value)
    },
  }
}
export function section(title: string, body: string): string {
  return formatSection(title, body, { indent: 0 })
}
