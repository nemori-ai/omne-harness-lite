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

const ORIGIN: Readonly<Record<string, string>> = {
  tool: '工具',
  'agent-extension': '扩展',
  admission: '准入',
  independent: '独立',
}

function originLabel(entry: Entry): string {
  const session = entry.item.origin.sessionRef
  if (session === undefined) return ORIGIN[entry.item.origin.kind] ?? entry.item.origin.kind
  return session.length > SHOWN_SESSION ? `${session.slice(0, SHOWN_SESSION)}…` : session
}

function replyOf(pick: string, text: string): Reply | null {
  if (pick === DECLINE) return { kind: 'decline' }
  if (pick === TEXT) return text.trim() === '' ? null : { kind: 'text', text }
  if (pick.startsWith(OPTION)) return { kind: 'selection', optionId: pick.slice(OPTION.length) }
  return null
}

export function CardView({ entry, driver }: Props): JSX.Element {
  const question = entry.item.card.question
  const asks = question.kind === 'question' || question.kind === 'extension'
  return (
    <li className="hitl-card" data-kind={question.kind}>
      <div className="hitl-card-head">
        <h3 className="hitl-card-title">{question.title}</h3>
        <ValuePill mono>{originLabel(entry)}</ValuePill>
      </div>
      {question.description === '' ? null : (
        <p className="hitl-card-text">{question.description}</p>
      )}
      {entry.item.displayContext === '' ? null : (
        <p className="hitl-card-context">{entry.item.displayContext}</p>
      )}
      <Answer key={entry.item.card.revision} entry={entry} driver={driver} asks={asks} />
      <SubmitLine entry={entry} driver={driver} />
    </li>
  )
}

function Answer({ entry, driver, asks }: Props & { readonly asks: boolean }): JSX.Element {
  const question = entry.item.card.question
  const group = useId()
  const [pick, setPick] = useState('')
  const [text, setText] = useState('')
  const busy = entry.submit.kind === 'submitting' || entry.submit.kind === 'unknown'
  const reply = replyOf(pick, text)
  return (
    <div className="hitl-card-answer">
      <fieldset className="hitl-card-choices" disabled={busy}>
        <legend>{asks ? '选一个，或用自己的话回答' : '选一个'}</legend>
        <RadioGroup name={group} value={pick} onValueChange={setPick} disabled={busy}>
          {question.options.map(option => (
            <label key={option.id} className="hitl-card-choice">
              <RadioGroupItem value={`${OPTION}${option.id}`} />
              <span className="hitl-card-choice-label">{option.label}</span>
              {option.description === '' ? null : (
                <span className="hitl-card-choice-text">{option.description}</span>
              )}
            </label>
          ))}
          {asks ? (
            <label className="hitl-card-choice">
              <RadioGroupItem value={TEXT} />
              <span className="hitl-card-choice-label">用自己的话回答</span>
            </label>
          ) : null}
          {asks ? (
            <label className="hitl-card-choice">
              <RadioGroupItem value={DECLINE} />
              <span className="hitl-card-choice-label">跳过</span>
              {question.declineConsequence === '' ? null : (
                <span className="hitl-card-choice-text">{question.declineConsequence}</span>
              )}
            </label>
          ) : null}
        </RadioGroup>
        {asks && pick === TEXT ? (
          <Textarea
            aria-label="你的回答"
            value={text}
            onChange={event => setText(event.target.value)}
            disabled={busy}
          />
        ) : null}
      </fieldset>
      <div className="hitl-card-actions">
        <Button
          disabled={busy || reply === null}
          onClick={() => {
            if (reply !== null) driver.submit(entry.key, reply)
          }}
        >
          提交
        </Button>
      </div>
    </div>
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
