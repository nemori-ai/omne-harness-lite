import { Disclosure, Prose, StatusPill } from '@omne-harness/ui-kit'
import { memo, type ReactNode } from 'react'
import type { Item, Part } from '../model/conversation.ts'
import type { Plain } from '../model/plain.ts'

function Expandable({
  title,
  badge,
  children,
}: {
  readonly title: ReactNode
  readonly badge?: string | undefined
  readonly children: ReactNode
}) {
  return (
    <Disclosure
      className="omne-card"
      label={
        <>
          {title}
          {badge === undefined ? null : <StatusPill tone="neutral">{badge}</StatusPill>}
        </>
      }
    >
      {children}
    </Disclosure>
  )
}

function entriesOf(value: Plain): readonly (readonly [string, Plain])[] | null {
  if (Array.isArray(value))
    return (value as readonly Plain[]).map((item, at) => [String(at), item] as const)
  if (typeof value === 'object' && value !== null) return Object.entries(value)
  return null
}

function ValueView({ name, value }: { readonly name: string; readonly value: Plain }) {
  const entries = entriesOf(value)
  if (entries === null) return <span className="omne-argument-value">{String(value)}</span>
  return (
    <ul className="omne-arguments" aria-label={name}>
      {entries.map(([key, item]) => (
        <li key={key}>
          <span className="omne-argument-name">{key}</span>
          <ValueView name={key} value={item} />
        </li>
      ))}
    </ul>
  )
}

const TOOL_STATE: Readonly<Record<string, string>> = {
  incomplete: '参数没有生成完',
  unparsed: '参数解析不了',
  generating: '参数生成中',
}

function resultBadge(part: Extract<Part, { kind: 'tool-call' }>): string {
  if (part.result !== null) return '有结果'
  return part.ended ? '没有结果' : '等待结果'
}

function ToolCall({ part }: { readonly part: Extract<Part, { kind: 'tool-call' }> }) {
  const badge = TOOL_STATE[part.state] ?? resultBadge(part)
  return (
    <Expandable
      title={
        <>
          工具 <code>{part.name ?? '（名字还没生成）'}</code>
        </>
      }
      badge={badge}
    >
      <p className="omne-card-label">参数</p>
      {part.raw === null ? (
        <ValueView name="参数" value={part.arguments} />
      ) : (
        <pre className="omne-pre">{part.raw}</pre>
      )}
      {part.result === null ? null : (
        <>
          <p className="omne-card-label">结果</p>
          <PartList parts={part.result.parts} live={false} />
        </>
      )}
    </Expandable>
  )
}

function PartView({ part, live }: { readonly part: Part; readonly live: boolean }) {
  switch (part.kind) {
    case 'text':
      return <Prose text={part.text} isAnimating={live} />
    case 'thinking':
      return (
        <Expandable title="推理" badge={live ? '进行中' : undefined}>
          <Prose text={part.text} isAnimating={live} />
        </Expandable>
      )
    case 'tool-call':
      return <ToolCall part={part} />
    case 'tool-result':
      return (
        <Expandable
          title={
            <>
              工具结果 <code>{part.callId}</code>
            </>
          }
        >
          <PartList parts={part.result.parts} live={false} />
        </Expandable>
      )
    case 'media':
      return (
        <p className="omne-placeholder">
          〔{part.media}〕{part.detail}
        </p>
      )
    case 'unknown':
      return <p className="omne-placeholder">不认识的内容种类：{part.partKind}</p>
  }
}

function PartList({ parts, live }: { readonly parts: readonly Part[]; readonly live: boolean }) {
  return (
    <>
      {parts.map(part => (
        <PartView key={part.key} part={part} live={live} />
      ))}
    </>
  )
}

/** Who said a message: not drawn, read out to screen readers. */
const SPEAKER: Readonly<Record<string, string>> = { user: '你', assistant: 'Agent', tool: '工具' }

/** Whose turn a transcript row belongs to; a change of speaker is a wider gap. Markers belong to nobody. */
export function speakerOf(item: Item): 'user' | 'agent' | undefined {
  if (item.kind === 'message') return item.role === 'user' ? 'user' : 'agent'
  return item.kind === 'note' ? 'agent' : undefined
}

export const ItemView = memo(function ItemView({
  item,
  failed = false,
}: {
  readonly item: Item
  /** A marker of a run that failed: its words take the failure colour. */
  readonly failed?: boolean
}) {
  switch (item.kind) {
    case 'message':
      return (
        <article className="omne-message" data-role={item.role} data-live={item.live}>
          <span className="omne-message-speaker">{SPEAKER[item.role]}</span>
          <div className="omne-message-body">
            <PartList parts={item.parts} live={item.live} />
          </div>
        </article>
      )
    case 'note':
      return (
        <div className="omne-note">
          <Expandable title={item.label}>
            <PartList parts={item.parts} live={false} />
          </Expandable>
        </div>
      )
    case 'marker':
      return (
        <div className="omne-marker" data-tone={failed ? 'danger' : undefined}>
          {item.label}
        </div>
      )
    case 'unknown':
      return <div className="omne-placeholder">不认识的历史条目种类：{item.entryKind}</div>
  }
})
