import {
  Button,
  LoadingState,
  RadioGroup,
  RadioGroupItem,
  Textarea,
  ValuePill,
} from '@omne-harness/ui-kit'
import { useId, useState, type JSX } from 'react'
import type { CardsDriver } from '../model/cards-driver.ts'
import type { Entry, Reply } from '../model/cards-machine.ts'
import { NoticeLine } from './notice.tsx'

type Props = { readonly entry: Entry; readonly driver: CardsDriver }

const SHOWN_SESSION = 12
const TEXT = 'text'
const DECLINE = 'decline'
const OPTION = 'option:'

const KIND: Readonly<Record<string, string>> = {
  question: '问询',
  approval: '请示',
  admission: '放行',
  extension: '扩展',
}

const ORIGIN: Readonly<Record<string, string>> = {
  tool: '工具',
  'agent-extension': '扩展',
  admission: '准入',
  independent: '独立',
}

function Origin({ entry }: { readonly entry: Entry }): JSX.Element {
  const origin = entry.item.origin
  const session = origin.sessionRef
  if (session === undefined)
    return <span className="hitl-card-origin">{ORIGIN[origin.kind] ?? origin.kind}</span>
  return (
    <span className="hitl-card-origin">
      会话
      <ValuePill mono>
        {session.length > SHOWN_SESSION ? `${session.slice(0, SHOWN_SESSION)}…` : session}
      </ValuePill>
    </span>
  )
}

function replyOf(pick: string, text: string): Reply | null {
  if (pick === DECLINE) return { kind: 'decline' }
  if (pick === TEXT) return text.trim() === '' ? null : { kind: 'text', text }
  if (pick.startsWith(OPTION)) return { kind: 'selection', optionId: pick.slice(OPTION.length) }
  return null
}

export function CardView({
  entry,
  driver,
  origin,
}: Props & { readonly origin: boolean }): JSX.Element {
  const question = entry.item.card.question
  return (
    <li className="hitl-card" data-kind={question.kind} data-state={entry.submit.kind}>
      <div className="hitl-card-head">
        <span className="hitl-card-kind">{KIND[question.kind] ?? question.kind}</span>
        {origin ? <Origin entry={entry} /> : null}
      </div>
      <h3 className="hitl-card-title">{question.title}</h3>
      {question.description === '' ? null : (
        <p className="hitl-card-text">{question.description}</p>
      )}
      {entry.item.displayContext === '' ? null : (
        <p className="hitl-card-context">{entry.item.displayContext}</p>
      )}
      <Answer key={entry.item.card.revision} entry={entry} driver={driver} />
    </li>
  )
}

function Answer({ entry, driver }: Props): JSX.Element {
  const question = entry.item.card.question
  const group = useId()
  const [pick, setPick] = useState('')
  const [text, setText] = useState('')
  const busy = entry.submit.kind === 'submitting' || entry.submit.kind === 'unknown'
  const reply = replyOf(pick, text)
  return (
    <>
      <fieldset className="hitl-card-choices" disabled={busy}>
        <legend>选一个，或用自己的话回答</legend>
        <RadioGroup name={group} value={pick} onValueChange={setPick} disabled={busy}>
          {question.options.map(option => (
            <Choice
              key={option.id}
              value={`${OPTION}${option.id}`}
              pick={pick}
              label={option.label}
              text={option.description}
            />
          ))}
          <Choice value={TEXT} pick={pick} label="用自己的话回答" text="" />
          <Choice value={DECLINE} pick={pick} label="跳过" text={question.declineConsequence} />
        </RadioGroup>
        {pick === TEXT ? (
          <Textarea
            className="hitl-card-words"
            aria-label="你的回答"
            value={text}
            onChange={event => setText(event.target.value)}
            disabled={busy}
          />
        ) : null}
      </fieldset>
      <div className="hitl-card-foot">
        <SubmitLine entry={entry} driver={driver} />
        <Button
          className="hitl-card-submit"
          disabled={busy || reply === null}
          onClick={() => {
            if (reply !== null) driver.submit(entry.key, reply)
          }}
        >
          提交
        </Button>
      </div>
    </>
  )
}

function Choice({
  value,
  pick,
  label,
  text,
}: {
  readonly value: string
  readonly pick: string
  readonly label: string
  readonly text: string
}): JSX.Element {
  return (
    <label className="hitl-card-choice" data-state={pick === value ? 'checked' : 'unchecked'}>
      <RadioGroupItem value={value} />
      <span className="hitl-card-choice-label">{label}</span>
      {text === '' ? null : <span className="hitl-card-choice-text">{text}</span>}
    </label>
  )
}

function SubmitLine({ entry, driver }: Props): JSX.Element | null {
  const submit = entry.submit
  switch (submit.kind) {
    case 'none':
      return null
    case 'submitting':
      return <LoadingState label="正在提交……" />
    case 'refused':
      return <NoticeLine notice={submit.notice} />
    case 'unknown':
      return (
        <NoticeLine
          notice={submit.notice}
          action={
            submit.confirming
              ? undefined
              : { label: '再确认一次', onClick: () => driver.confirm(entry.key) }
          }
        />
      )
  }
}
