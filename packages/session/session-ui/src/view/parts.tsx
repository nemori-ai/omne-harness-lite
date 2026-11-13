import { memo, useState, type ReactNode } from 'react'
import { Streamdown } from 'streamdown'
import type { AskView, Item, Part, ToolResultView } from '../model/conversation.ts'
import type { Plain } from '../model/plain.ts'

function Markdown({ text, live }: { readonly text: string; readonly live: boolean }) {
  return (
    <Streamdown
      className="omne-markdown"
      mode={live ? 'streaming' : 'static'}
      isAnimating={live}
      controls={false}
    >
      {text}
    </Streamdown>
  )
}

function Expandable({
  title,
  badge,
  open: initiallyOpen = false,
  children,
}: {
  readonly title: ReactNode
  readonly badge?: string | undefined
  readonly open?: boolean
  readonly children: ReactNode
}) {
  const [open, setOpen] = useState(initiallyOpen)
  return (
    <div className="omne-card" data-open={open}>
      <button
        type="button"
        className="omne-card-head"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="omne-card-chevron" aria-hidden="true">
          ▸
        </span>
        <span className="omne-card-title">{title}</span>
        {badge === undefined ? null : <span className="omne-badge">{badge}</span>}
      </button>
      {open ? <div className="omne-card-body">{children}</div> : null}
    </div>
  )
}

function json(value: Plain): string {
  return JSON.stringify(value, null, 2) ?? 'null'
}

const ASK_STATUS: Readonly<Record<AskView['status'], string>> = {
  waiting: '等待答复',
  answered: '已答复',
  expired: '已失效',
}

function AskCard({
  ask,
  result,
}: {
  readonly ask: AskView
  readonly result: ToolResultView | null
}) {
  return (
    <section className="omne-ask" data-status={ask.status} aria-label="问题卡">
      <header className="omne-ask-head">
        <span>Agent 在问你</span>
        <span className="omne-badge" data-tone={ask.status}>
          {ASK_STATUS[ask.status]}
        </span>
      </header>
      {ask.questions.map((question, at) => (
        <div className="omne-ask-question" key={at}>
          <p className="omne-ask-title">{question.title}</p>
          {question.description === '' ? null : (
            <p className="omne-ask-text">{question.description}</p>
          )}
          <ul className="omne-ask-options">
            {question.options.map((option, index) => (
              <li key={index}>
                <span className="omne-ask-label">{option.label}</span>
                <span className="omne-ask-text">{option.description}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {ask.status === 'waiting' ? (
        <p className="omne-ask-hint">
          这一轮在等你答复。可以在命令行里答复，或在这里点「停止」取消这一轮。
        </p>
      ) : null}
      {ask.status === 'answered' && result !== null ? (
        <div className="omne-ask-answer">
          <PartList parts={result.parts} live={false} />
        </div>
      ) : null}
    </section>
  )
}

const TOOL_STATE: Readonly<Record<string, string>> = {
  incomplete: '参数没有生成完',
  unparsed: '参数解析不了',
  generating: '参数生成中',
}

function ToolCall({ part }: { readonly part: Extract<Part, { kind: 'tool-call' }> }) {
  if (part.ask !== null) return <AskCard ask={part.ask} result={part.result} />
  const badge = TOOL_STATE[part.state] ?? (part.result === null ? '等待结果' : '有结果')
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
      <pre className="omne-pre">{part.raw ?? json(part.arguments)}</pre>
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
      return <Markdown text={part.text} live={live} />
    case 'thinking':
      return (
        <Expandable title="推理" badge={live ? '进行中' : undefined}>
          <div className="omne-thinking">{part.text}</div>
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

const ROLE: Readonly<Record<string, string>> = { user: '你', assistant: 'Agent', tool: '工具' }

/** One conversation item. Memoized: a reply that grows re-renders only its own item. */
export const ItemView = memo(function ItemView({ item }: { readonly item: Item }) {
  switch (item.kind) {
    case 'message':
      return (
        <article className="omne-message" data-role={item.role} data-live={item.live}>
          <header className="omne-message-head">
            <span>{ROLE[item.role]}</span>
            {item.live ? <span className="omne-generating">正在生成</span> : null}
          </header>
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
      return <div className="omne-marker">{item.label}</div>
    case 'unknown':
      return <div className="omne-placeholder">不认识的历史条目种类：{item.entryKind}</div>
  }
})
