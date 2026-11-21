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
import { memo, useId, useState, type ReactNode } from 'react'
import type { Item, Part } from '../model/conversation.ts'
import { isRecord, type Plain } from '../model/plain.ts'

type ToolCallPart = Extract<Part, { kind: 'tool-call' }>

/** A process line (`TraceRow` family): icon, name, state word, unfolding in place; quiet, the figure speaks. */
function ProcessLine({
  icon,
  name,
  word,
  live = false,
  light = false,
  children,
}: {
  readonly icon?: Icon
  readonly name: ReactNode
  readonly word?: ReactNode
  readonly live?: boolean
  readonly light?: boolean
  readonly children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const region = useId()
  return (
    <div className="omne-process" data-weight={light ? 'light' : undefined}>
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

function Arguments({ value }: { readonly value: Plain }) {
  if (value === null || isEmptyObject(value)) return null
  if (!isRecord(value)) return <CodeSurface name="参数" text={summary(value)} />
  const rows = Object.entries(value).filter(([, item]) => !isEmptyObject(item))
  if (rows.length === 0) return null
  return (
    <FactList aria-label="参数">
      {rows.map(([name, item]) => {
        const nested = typeof item === 'object' && item !== null
        const text = nested ? summary(item) : String(item)
        return (
          <FactRow key={name} term={<code className="omne-process-term">{name}</code>}>
            <span
              className="omne-process-value"
              data-nested={nested || undefined}
              title={nested ? text : undefined}
            >
              {text}
            </span>
          </FactRow>
        )
      })}
    </FactList>
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
      <Parts parts={others} live={false} bubble={false} />
    </>
  )
}

/** A tool result carries no outcome, so the transcript knows of no failed call. */
function toolWord(part: ToolCallPart): Readonly<{ word: ReactNode; live: boolean }> {
  if (part.result !== null) return { word: <StateWord state="completed" />, live: false }
  if (part.ended) return { word: <span className="omne-process-word">没有结果</span>, live: false }
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

function Reasoning({ text, live }: { readonly text: string; readonly live: boolean }) {
  return (
    <ProcessLine
      icon={ProcessIcon}
      name="推理"
      word={<StateWord state={live ? 'thinking' : 'completed'} />}
      live={live}
    >
      <div className="omne-process-reading">
        <Prose text={text} isAnimating={live} />
      </div>
    </ProcessLine>
  )
}

const inBubble = (part: Part): boolean =>
  part.kind === 'text' || part.kind === 'media' || part.kind === 'unknown'

function BubblePart({ part, live }: { readonly part: Part; readonly live: boolean }) {
  switch (part.kind) {
    case 'text':
      return <Prose text={part.text} isAnimating={live} />
    case 'media':
      return (
        <p className="omne-placeholder">
          〔{part.media}〕{part.detail}
        </p>
      )
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
      return <ToolCall part={part} />
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

function Parts({
  parts,
  live,
  bubble,
}: {
  readonly parts: readonly Part[]
  readonly live: boolean
  readonly bubble: boolean
}) {
  const last = parts.at(-1)?.key
  return (
    <>
      {runsOf(parts).map(run =>
        'line' in run ? (
          <LinePart key={run.key} part={run.line} live={live && run.key === last} />
        ) : (
          <div key={run.key} className={bubble ? 'omne-message-body' : 'omne-process-reading'}>
            {run.words.map(part => (
              <BubblePart key={part.key} part={part} live={live} />
            ))}
          </div>
        ),
      )}
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
          <Parts parts={item.parts} live={item.live} bubble />
        </article>
      )
    case 'note':
      return (
        <ProcessLine name={item.label} light>
          <Parts parts={item.parts} live={false} bubble={false} />
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
