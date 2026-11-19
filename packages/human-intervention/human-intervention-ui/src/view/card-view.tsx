import type { HumanInterventionCardItem } from '@omne-harness/human-intervention-protocol'
import { Button, LoadingState, RadioGroup, RadioGroupItem, Textarea } from '@omne-harness/ui-kit'
import { useId, type JSX } from 'react'
import type { CardsDriver } from '../model/cards-driver.ts'
import type { Closed, Draft, Entry } from '../model/cards-machine.ts'
import { NoticeLine } from './notice.tsx'

export type Shown =
  | Readonly<{ kind: 'pending'; key: string; entry: Entry; draft: Draft }>
  | Readonly<{ kind: 'closed'; key: string; closed: Closed }>

export const itemOf = (card: Shown): HumanInterventionCardItem =>
  card.kind === 'pending' ? card.entry.item : card.closed.item

export const draftOfShown = (card: Shown): Draft =>
  card.kind === 'pending' ? card.draft : card.closed.draft

const WHO: Readonly<Record<string, string>> = {
  question: 'Agent 在问你',
  release: '系统要你放行这一次调用',
  extension: '拓展件在问你',
}

const ORIGIN: Readonly<Record<string, string>> = {
  tool: '工具',
  'agent-extension': '拓展件',
  admission: '系统放行',
}

const OPTION = 'option:'

function sourceOf(item: HumanInterventionCardItem): string {
  const kind = ORIGIN[item.origin.kind] ?? item.origin.kind
  return item.displayContext === '' ? `来源：${kind}` : `来源：${kind} · ${item.displayContext}`
}

type Props = Readonly<{
  card: Shown
  at: number
  of: number
  disabled: boolean
  driver: CardsDriver
  onDraft: (draft: Draft, advance: boolean) => void
}>

export function CardView({ card, at, of, disabled, driver, onDraft }: Props): JSX.Element {
  const item = itemOf(card)
  const question = item.card.question
  const state = card.kind === 'closed' ? 'closed' : card.entry.submit.kind
  return (
    <article
      className="hitl-card"
      data-kind={question.kind}
      data-state={state}
      aria-label={`第 ${at} 题`}
    >
      <div className="hitl-card-head">
        <span className="hitl-card-kind">{WHO[question.kind] ?? question.kind}</span>
        {of > 1 ? <span className="hitl-card-position">{`第 ${at} 题，共 ${of} 题`}</span> : null}
      </div>
      <p className="hitl-card-source">{sourceOf(item)}</p>
      <h3 className="hitl-card-title">{question.title}</h3>
      {question.description === '' ? null : (
        <p className="hitl-card-text">{question.description}</p>
      )}
      {question.kind === 'release' ? <ReleaseCall question={question} /> : null}
      <Answer
        item={item}
        draft={draftOfShown(card)}
        disabled={disabled || card.kind === 'closed'}
        onDraft={onDraft}
      />
      <Outcome card={card} driver={driver} />
    </article>
  )
}

function Answer({
  item,
  draft,
  disabled,
  onDraft,
}: Readonly<{
  item: HumanInterventionCardItem
  draft: Draft
  disabled: boolean
  onDraft: (draft: Draft, advance: boolean) => void
}>): JSX.Element {
  const question = item.card.question
  const group = useId()
  const words = useId()
  const picked = draft.choice.kind === 'option' ? `${OPTION}${draft.choice.optionId}` : ''
  const declined = draft.choice.kind === 'decline'
  const asking = question.kind === 'question'
  return (
    <fieldset className="hitl-card-choices" disabled={disabled}>
      {question.options.length === 0 ? null : (
        <RadioGroup
          name={group}
          value={picked}
          disabled={disabled}
          onValueChange={value =>
            onDraft(
              {
                choice: { kind: 'option', optionId: value.slice(OPTION.length) },
                text: draft.text,
              },
              true,
            )
          }
        >
          {question.kind === 'release' ? (
            <ReleaseChoices options={question.options} picked={picked} />
          ) : (
            question.options.map(option => (
              <Choice key={option.id} option={option} picked={picked} offered />
            ))
          )}
        </RadioGroup>
      )}
      <label className="hitl-card-words-label" htmlFor={words}>
        {asking ? '或者用你自己的话回答：' : '或者用你自己的话说：'}
      </label>
      <Textarea
        id={words}
        className="hitl-card-words"
        value={draft.text}
        disabled={disabled}
        onChange={event => onDraft({ choice: { kind: 'none' }, text: event.target.value }, false)}
      />
      <div className="hitl-card-decline">
        <Button
          variant={declined ? 'secondary' : 'outline'}
          size="compact"
          aria-pressed={declined}
          disabled={disabled}
          onClick={() =>
            onDraft(
              { choice: declined ? { kind: 'none' } : { kind: 'decline' }, text: draft.text },
              !declined,
            )
          }
        >
          不回答这一题
        </Button>
        {question.declineConsequence === '' ? null : (
          <span className="hitl-card-decline-text">{question.declineConsequence}</span>
        )}
      </div>
    </fieldset>
  )
}

type Question = HumanInterventionCardItem['card']['question']
type ReleaseQuestion = Extract<Question, { kind: 'release' }>
type Option = Readonly<{ id: string; label: string; description: string }>

function Choice({
  option,
  picked,
  offered,
}: Readonly<{ option: Option; picked: string; offered: boolean }>): JSX.Element {
  return (
    <label
      className="hitl-card-choice"
      data-state={picked === `${OPTION}${option.id}` ? 'checked' : 'unchecked'}
      data-offered={offered}
    >
      <RadioGroupItem value={`${OPTION}${option.id}`} disabled={!offered} />
      <span className="hitl-card-choice-label">{option.label}</span>
      {option.description === '' ? null : (
        <span className="hitl-card-choice-text">{option.description}</span>
      )}
    </label>
  )
}

// The release card's body: the call as a summary line, its arguments on demand, where it comes from.
function ReleaseCall({ question }: Readonly<{ question: ReleaseQuestion }>): JSX.Element {
  const { target, arguments: given, origin } = question
  const call = [target.tool, target.command, target.preview]
    .filter(part => part !== null && part !== '')
    .join(' ')
  return (
    <div className="hitl-release-call">
      <code className="hitl-release-summary">{call}</code>
      <p className="hitl-release-gate">{`归「${target.tool}：${question.gateTitle}」这一类动作`}</p>
      <details className="hitl-release-arguments">
        <summary>参数</summary>
        <pre>{given.text}</pre>
        {given.truncated ? (
          <p className="hitl-release-cut">{`参数太长，只显示开头。全文摘要 ${given.digest}`}</p>
        ) : null}
      </details>
      <p className="hitl-release-origin">{`会话 ${origin.session} · Agent ${origin.agent}`}</p>
    </div>
  )
}

// One-time options and lasting ones sit apart; an option the issuer does not offer now is shown, not choosable.
function ReleaseChoices({
  options,
  picked,
}: Readonly<{ options: ReleaseQuestion['options']; picked: string }>): JSX.Element {
  return (
    <div className="hitl-release-options">
      {[false, true].map(lasting => (
        <div key={String(lasting)} className="hitl-release-group" data-lasting={lasting}>
          {options
            .filter(option => option.lasting === lasting)
            .map(option => (
              <Choice key={option.id} option={option} picked={picked} offered={option.offered} />
            ))}
        </div>
      ))}
    </div>
  )
}

function Outcome({ card, driver }: Readonly<{ card: Shown; driver: CardsDriver }>) {
  if (card.kind === 'closed')
    return (
      <NoticeLine
        notice={card.closed.notice}
        action={{ label: '知道了', onClick: () => driver.dismiss(card.key) }}
      />
    )
  const submit = card.entry.submit
  switch (submit.kind) {
    case 'none':
      return null
    case 'submitting':
      return <LoadingState label="正在提交这一题……" />
    case 'refused':
      return <NoticeLine notice={submit.notice} />
    case 'unknown':
      return (
        <NoticeLine
          notice={submit.notice}
          action={
            submit.confirming
              ? undefined
              : { label: '再确认一次', onClick: () => driver.confirm(card.key) }
          }
        />
      )
  }
}
