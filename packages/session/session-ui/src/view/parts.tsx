import {
  CodeSurface,
  CommandsIcon,
  DisclosureContent,
  FactList,
  FactRow,
  ProcessIcon,
  Prose,
  StateWord,
  TraceHeader,
  type Icon,
} from '@omne-harness/ui-kit'
import type { PartProps } from '@omne-harness/shell-contract'
import { memo, useContext, useId, useState, type ReactNode } from 'react'
import { toolCallState, type Item, type Part } from '../model/conversation.ts'
import { isRecord, type Plain } from '../model/plain.ts'
import { BlockSlotContext, ToolCallSlotContext, type ToolCallPart } from './block-slot.ts'
import { PartDrawContext } from './part-draw.ts'
import {
  sessionTranscriptAgentMessage,
  sessionTranscriptBubble,
  sessionTranscriptReasoning,
  sessionTranscriptToolCall,
  sessionTranscriptUserMessage,
} from '../parts.ts'

/** A process line (`TraceRow` family): icon, name, state word, unfolding in place; quiet, the figure speaks. */
function ProcessLine({
  icon,
  name,
  word,
  live = false,
  light = false,
  children,
  partProps,
}: {
  readonly icon?: Icon
  readonly name: ReactNode
  readonly word?: ReactNode
  readonly live?: boolean
  readonly light?: boolean
  readonly partProps?: PartProps
  readonly children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const region = useId()
  return (
    <div className="omne-process" data-weight={light ? 'light' : undefined} {...partProps}>
      <TraceHeader
        state={live ? 'live' : 'settled'}
        quiet
        announce={false}
        {...(icon === undefined ? {} : { icon })}
        label={
          <span className="omne-process-label">
            {name}
            {word}
          </span>
        }
        expanded={open}
        controls={region}
        onToggle={() => setOpen(!open)}
      />
      <div id={region}>
        <DisclosureContent open={open}>
          <div className="omne-process-body">{children}</div>
        </DisclosureContent>
      </div>
    </div>
  )
}

const isEmptyObject = (value: Plain): boolean => isRecord(value) && Object.keys(value).length === 0

const summary = (value: Plain): string =>
  JSON.stringify(value, function (this: unknown, key: string, item: Plain) {
    return key !== '' && !Array.isArray(this) && isEmptyObject(item) ? undefined : item
  })

function Value({ value }: { readonly value: Plain }) {
  const nested = typeof value === 'object' && value !== null
  const text = nested ? summary(value) : String(value)
  return (
    <span
      className="omne-process-value"
      data-nested={nested || undefined}
      title={nested ? text : undefined}
    >
      {text}
    </span>
  )
}

function Arguments({ value }: { readonly value: Plain }) {
  if (value === null || isEmptyObject(value)) return null
  if (!isRecord(value)) return <CodeSurface name="参数" text={summary(value)} />
  const rows = Object.entries(value).filter(([, item]) => !isEmptyObject(item))
  if (rows.length === 0) return null
  return (
    <FactList aria-label="参数">
      {rows.map(([name, item]) => (
        <FactRow key={name} term={<code className="omne-process-term">{name}</code>}>
          <Value value={item} />
        </FactRow>
      ))}
    </FactList>
  )
}

type Fact = Readonly<{ name: string; value: Plain }>

const ELEMENT = /^<([A-Za-z][\w-]*)((?:\s+[\w-]+="[^"]*")*)\s*>$/
const ONE_LINE_ELEMENT = /^<([A-Za-z][\w-]*)\b[^>]*>.*<\/\1>$/
const KEY = /\skey="([^"]*)"/

function valueOf(text: string): Plain {
  try {
    return JSON.parse(text) as Plain
  } catch {
    return text
  }
}

/** Each element on lines of its own is one value named by its `key`; a whole JSON object gives its fields. */
function factsOf(text: string): readonly Fact[] | null {
  const lines = text.split('\n').map(line => line.trim())
  const facts: Fact[] = []
  for (let at = 0; at < lines.length; at += 1) {
    const open = ELEMENT.exec(lines[at]!)
    if (open === null) continue
    const end = lines.indexOf(`</${open[1]}>`, at + 1)
    if (end === -1) return null
    const body = lines.slice(at + 1, end).filter(line => !ONE_LINE_ELEMENT.test(line))
    facts.push({ name: KEY.exec(open[2]!)?.[1] ?? open[1]!, value: valueOf(body.join('\n')) })
    at = end
  }
  if (facts.length > 0) return facts
  const whole = valueOf(text.trim())
  return isRecord(whole) ? Object.entries(whole).map(([name, value]) => ({ name, value })) : null
}

function NoteText({ text }: { readonly text: string }) {
  const facts = factsOf(text)
  if (facts === null)
    return (
      <div className="omne-process-reading">
        <Prose text={text} />
      </div>
    )
  return (
    <ul className="omne-process-facts">
      {facts.map((fact, at) => (
        <li key={at} className="omne-process-fact">
          <span className="omne-process-term">{fact.name}</span>：<Value value={fact.value} />
        </li>
      ))}
    </ul>
  )
}

function NoteParts({ parts }: { readonly parts: readonly Part[] }) {
  return (
    <>
      {parts.map(part =>
        part.kind === 'text' ? (
          <NoteText key={part.key} text={part.text} />
        ) : (
          <Parts key={part.key} parts={[part]} live={false} />
        ),
      )}
    </>
  )
}

const RAW_NOTE: Readonly<Record<ToolCallPart['state'], string | null>> = {
  complete: null,
  generating: '还在生成',
  incomplete: '没有生成完',
  unparsed: '解析不了',
}

function Result({ parts }: { readonly parts: readonly Part[] }) {
  const text = parts.flatMap(part => (part.kind === 'text' ? [part.text] : []))
  const others = parts.filter(part => part.kind !== 'text')
  return (
    <>
      {text.length === 0 ? null : <CodeSurface name="结果" text={text.join('\n')} />}
      <Parts parts={others} live={false} />
    </>
  )
}

/** A tool result carries no outcome, so the transcript knows of no failed call. */
function toolWord(part: ToolCallPart): Readonly<{ word: ReactNode; live: boolean }> {
  const state = toolCallState(part)
  if (state === 'completed') return { word: <StateWord state="completed" />, live: false }
  if (state === 'no-result')
    return { word: <span className="omne-process-word">没有结果</span>, live: false }
  return { word: <StateWord state="working" />, live: true }
}

function ToolCall({ part }: { readonly part: ToolCallPart }) {
  const { word, live } = toolWord(part)
  const note = RAW_NOTE[part.state]
  return (
    <ProcessLine
      icon={CommandsIcon}
      name={<code className="omne-process-name">{part.name ?? '（名字还没生成）'}</code>}
      word={word}
      live={live}
      partProps={sessionTranscriptToolCall.props}
    >
      {part.raw === null ? (
        <Arguments value={part.arguments} />
      ) : (
        <>
          <CodeSurface name="参数" text={part.raw} />
          {note === null ? null : <p className="omne-process-note">{note}</p>}
        </>
      )}
      {part.result === null ? null : <Result parts={part.result.parts} />}
    </ProcessLine>
  )
}

function DrawnToolCall({ part }: { readonly part: ToolCallPart }) {
  const slot = useContext(ToolCallSlotContext)
  const generic = (): ReactNode => <ToolCall part={part} />
  return slot === null ? generic() : slot(part, generic)
}

function Reasoning({ text, live }: { readonly text: string; readonly live: boolean }) {
  return (
    <ProcessLine
      icon={ProcessIcon}
      name="推理"
      word={<StateWord state={live ? 'thinking' : 'completed'} />}
      live={live}
      partProps={sessionTranscriptReasoning.props}
    >
      <div className="omne-process-reading">
        <Prose text={text} isAnimating={live} />
      </div>
    </ProcessLine>
  )
}

const inBubble = (part: Part): boolean =>
  part.kind === 'text' || part.kind === 'media' || part.kind === 'unknown'

function MediaPart({ part }: { readonly part: Extract<Part, { kind: 'media' }> }) {
  const slot = useContext(BlockSlotContext)
  const placeholder = (
    <p className="omne-placeholder">
      〔{part.media}〕{part.detail}
    </p>
  )
  return slot === null || part.source === null
    ? placeholder
    : slot(part.media, part.source, placeholder)
}

function BubblePart({ part, live }: { readonly part: Part; readonly live: boolean }) {
  switch (part.kind) {
    case 'text':
      return <Prose text={part.text} isAnimating={live} />
    case 'media':
      return <MediaPart part={part} />
    case 'unknown':
      return <p className="omne-placeholder">不认识的内容种类：{part.partKind}</p>
    default:
      return null
  }
}

function LinePart({ part, live }: { readonly part: Part; readonly live: boolean }) {
  switch (part.kind) {
    case 'thinking':
      return <Reasoning text={part.text} live={live} />
    case 'tool-call':
      return <DrawnToolCall part={part} />
    case 'tool-result':
      return (
        <ProcessLine
          icon={CommandsIcon}
          name={
            <span>
              工具结果 <code className="omne-process-name">{part.callId}</code>
            </span>
          }
        >
          <Result parts={part.result.parts} />
        </ProcessLine>
      )
    default:
      return null
  }
}

type Run = Readonly<{ key: string; words: readonly Part[] }> | Readonly<{ key: string; line: Part }>

function runsOf(parts: readonly Part[]): readonly Run[] {
  const runs: Run[] = []
  let words: Part[] | null = null
  for (const part of parts) {
    if (!inBubble(part)) {
      words = null
      runs.push({ key: part.key, line: part })
    } else if (words === null) {
      words = [part]
      runs.push({ key: part.key, words })
    } else words.push(part)
  }
  return runs
}

export function Bubble({
  role,
  live,
  children,
}: {
  readonly role: string
  readonly live: boolean
  readonly children: ReactNode
}) {
  const drawer = useContext(PartDrawContext)
  const builtIn = (): ReactNode => (
    <div className="omne-message-body" data-role={role} {...sessionTranscriptBubble.props}>
      {children}
    </div>
  )
  if (drawer === null) return builtIn()
  return sessionTranscriptBubble.draw(drawer, builtIn, { role, live, content: children })
}

function Parts({
  parts,
  live,
  role,
}: {
  readonly parts: readonly Part[]
  readonly live: boolean
  readonly role?: string
}) {
  const last = parts.at(-1)?.key
  return (
    <>
      {runsOf(parts).map(run => {
        if ('line' in run)
          return <LinePart key={run.key} part={run.line} live={live && run.key === last} />
        const words = run.words.map(part => <BubblePart key={part.key} part={part} live={live} />)
        return role === undefined ? (
          <div key={run.key} className="omne-process-reading">
            {words}
          </div>
        ) : (
          <Bubble key={run.key} role={role} live={live}>
            {words}
          </Bubble>
        )
      })}
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

const messagePart = (role: string): typeof sessionTranscriptUserMessage =>
  role === 'user' ? sessionTranscriptUserMessage : sessionTranscriptAgentMessage

function Message({ item }: { readonly item: Extract<Item, { kind: 'message' }> }) {
  const drawer = useContext(PartDrawContext)
  const part = messagePart(item.role)
  const content = <Parts parts={item.parts} live={item.live} role={item.role} />
  const builtIn = (): ReactNode => (
    <article className="omne-message" data-role={item.role} data-live={item.live} {...part.props}>
      <span className="omne-message-speaker">{SPEAKER[item.role]}</span>
      {content}
    </article>
  )
  if (drawer === null) return builtIn()
  return part.draw(drawer, builtIn, { role: item.role, live: item.live === true, content })
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
      return <Message item={item} />
    case 'note':
      return (
        <ProcessLine name={item.label} light>
          <NoteParts parts={item.parts} />
        </ProcessLine>
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
