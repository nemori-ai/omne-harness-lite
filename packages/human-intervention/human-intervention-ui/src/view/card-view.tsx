import type { HumanInterventionCardItem } from '@omne-harness/human-intervention-protocol'
import {
  ChoiceList,
  ChoiceRow,
  CodeSurface,
  Disclosure,
  DisclosureContent,
  FactList,
  FactRow,
  LoadingState,
  PermissionIcon,
  QuestionIcon,
  RetryIcon,
  StateWord,
  Textarea,
} from '@omne-harness/ui-kit'
import { useId, useState, type JSX } from 'react'
import type { CardsDriver } from '../model/cards-driver.ts'
import type { Closed, Draft, Entry } from '../model/cards-machine.ts'
import { NoticeLine } from './notice.tsx'
import { ReleaseDetailView } from './release-detail.tsx'

export type Shown =
  | Readonly<{ kind: 'pending'; key: string; entry: Entry; draft: Draft }>
  | Readonly<{ kind: 'closed'; key: string; closed: Closed }>

export const itemOf = (card: Shown): HumanInterventionCardItem =>
  card.kind === 'pending' ? card.entry.item : card.closed.item

export const draftOfShown = (card: Shown): Draft =>
  card.kind === 'pending' ? card.draft : card.closed.draft

type Question = HumanInterventionCardItem['card']['question']
type ReleaseQuestion = Extract<Question, { kind: 'release' }>
type Option = Readonly<{ id: string; label: string; description: string }>
type ReleaseOption = ReleaseQuestion['options'][number]

const WHO: Readonly<Record<string, string>> = {
  question: 'Agent 在问你',
  release: '系统要你放行这一次调用',
  extension: '拓展件在问你',
}

const OPTION = 'option:'
const WORDS = 'words'
const DECLINE = 'decline'

/** Whose move it is, once at the head of the section: amber while the card waits on the person. */
function KindLine({ card, at, of }: Readonly<{ card: Shown; at: number; of: number }>) {
  const release = itemOf(card).card.question.kind === 'release'
  const Glyph = release ? PermissionIcon : QuestionIcon
  const submit = card.kind === 'pending' ? card.entry.submit : null
  const waiting = submit !== null && (submit.kind === 'none' || submit.kind === 'refused')
  const word =
    card.kind === 'closed' ? (
      <StateWord state="closed" />
    ) : submit?.kind === 'unknown' ? (
      <StateWord state="unknown" />
    ) : (
      <span>{release ? '需要你放行' : '需要你回答'}</span>
    )
  return (
    <p className="hitl-kind" data-waiting={waiting}>
      <Glyph aria-hidden="true" className="hitl-kind-mark" />
      {word}
      {submit?.kind === 'submitting' ? (
        <LoadingState label="正在提交" className="hitl-kind-trail" />
      ) : of > 1 ? (
        <span className="hitl-kind-trail">{`${at} / ${of}`}</span>
      ) : null}
    </p>
  )
}

function whoOf(item: HumanInterventionCardItem): string {
  const who = WHO[item.card.question.kind] ?? item.card.question.kind
  return item.displayContext === '' ? who : `${who} · ${item.displayContext}`
}

type Props = Readonly<{
  card: Shown
  at: number
  of: number
  disabled: boolean
  driver: CardsDriver
  onDraft: (draft: Draft) => void
}>

/** One section of the paper: the kind line, the question, the answer rows, and what came of sending it. */
export function CardView({ card, at, of, disabled, driver, onDraft }: Props): JSX.Element {
  const item = itemOf(card)
  const question = item.card.question
  const title = useId()
  const state = card.kind === 'closed' ? 'closed' : card.entry.submit.kind
  return (
    <article
      className="hitl-section"
      data-card={card.key}
      data-kind={question.kind}
      data-state={state}
      aria-labelledby={title}
    >
      <KindLine card={card} at={at} of={of} />
      <h3
        id={title}
        className="hitl-title"
        data-face={question.kind === 'release' ? 'ui' : 'reading'}
      >
        {question.title}
      </h3>
      {question.description === '' ? null : <p className="hitl-text">{question.description}</p>}
      <p className="hitl-who">{whoOf(item)}</p>
      {question.kind === 'release' ? <ReleaseCall question={question} /> : null}
      <DisclosureContent open={card.kind !== 'closed'}>
        <Answer item={item} draft={draftOfShown(card)} disabled={disabled} onDraft={onDraft} />
      </DisclosureContent>
      <Outcome card={card} driver={driver} />
    </article>
  )
}

function chosenOf(draft: Draft, words: boolean): string | undefined {
  if (draft.choice.kind === 'option') return `${OPTION}${draft.choice.optionId}`
  if (draft.choice.kind === 'decline') return DECLINE
  return words || draft.text.trim() !== '' ? WORDS : undefined
}

// The person's own words are a draft with no option chosen; choosing a row keeps the words and sends only that row.
function Answer({
  item,
  draft,
  disabled,
  onDraft,
}: Readonly<{
  item: HumanInterventionCardItem
  draft: Draft
  disabled: boolean
  onDraft: (draft: Draft) => void
}>): JSX.Element {
  const question = item.card.question
  const [words, setWords] = useState(false)
  const chosen = chosenOf(draft, words)
  const choose = (value: string) => {
    setWords(value === WORDS)
    if (value === WORDS) onDraft({ choice: { kind: 'none' }, text: draft.text })
    else if (value === DECLINE) onDraft({ choice: { kind: 'decline' }, text: draft.text })
    else
      onDraft({
        choice: { kind: 'option', optionId: value.slice(OPTION.length) },
        text: draft.text,
      })
  }
  const field = (
    <div className="hitl-field">
      <Textarea
        aria-label="用自己的话回答"
        value={draft.text}
        disabled={disabled}
        onChange={event => onDraft({ choice: { kind: 'none' }, text: event.target.value })}
      />
    </div>
  )
  const offered = question.options.length > 0
  return (
    <div className="hitl-answer">
      {offered ? null : field}
      <ChoiceList
        label="作答"
        value={chosen}
        onValueChange={choose}
        disabled={disabled}
        className="hitl-options"
      >
        {question.kind === 'release' ? (
          <ReleaseChoices options={question.options} chosen={chosen} />
        ) : (
          question.options.map(option => <Row key={option.id} option={option} />)
        )}
        {offered ? (
          <ChoiceRow value={WORDS} label="用自己的话回答">
            {field}
          </ChoiceRow>
        ) : null}
        <ChoiceRow value={DECLINE} label="不回答这一题">
          {question.declineConsequence === '' ? null : (
            <p className="hitl-decline-text">{question.declineConsequence}</p>
          )}
        </ChoiceRow>
      </ChoiceList>
    </div>
  )
}

function Row({ option, disabled = false }: Readonly<{ option: Option; disabled?: boolean }>) {
  return (
    <ChoiceRow
      value={`${OPTION}${option.id}`}
      label={option.label}
      {...(option.description === '' ? {} : { description: option.description })}
      disabled={disabled}
    />
  )
}

export function lastingChosen(options: readonly ReleaseOption[], choice: Draft['choice']): boolean {
  return (
    choice.kind === 'option' &&
    options.some(option => option.lasting && option.id === choice.optionId)
  )
}

// The one-time options are rows of the answer; the lasting ones wait in a quiet fold that stays open while one is chosen.
function ReleaseChoices({
  options,
  chosen,
}: Readonly<{ options: ReleaseQuestion['options']; chosen: string | undefined }>) {
  const [open, setOpen] = useState(false)
  const lasting = options.filter(option => option.lasting)
  const held = lasting.some(option => `${OPTION}${option.id}` === chosen)
  return (
    <>
      {options
        .filter(option => !option.lasting)
        .map(option => (
          <Row key={option.id} option={option} disabled={!option.offered} />
        ))}
      {lasting.length === 0 ? null : (
        <Disclosure
          label="这一类动作"
          open={open || held}
          onOpenChange={setOpen}
          className="hitl-lasting"
          contentClassName="hitl-lasting-rows"
        >
          {lasting.map(option => (
            <Row key={option.id} option={option} disabled={!option.offered} />
          ))}
        </Disclosure>
      )}
    </>
  )
}

// The call as a fact table, then what the tool said it would do, or the arguments behind 详情.
function ReleaseCall({ question }: Readonly<{ question: ReleaseQuestion }>): JSX.Element {
  const { target, arguments: given, origin, detail } = question
  const call = [target.tool, target.command, target.preview]
    .filter(part => part !== null && part !== '')
    .join(' ')
  return (
    <>
      <FactList className="hitl-facts">
        <FactRow term="工具">
          <code className="hitl-call">{call}</code>
        </FactRow>
        <FactRow term="动作类别">{`${target.tool}：${question.gateTitle}`}</FactRow>
        <FactRow term="会话">{origin.session}</FactRow>
        <FactRow term="Agent">{origin.agent}</FactRow>
      </FactList>
      {detail?.state === 'given' ? <ReleaseDetailView detail={detail} /> : null}
      {detail?.state === 'unavailable' ? (
        <p className="hitl-quiet-line">工具没能给出这次调用的详情</p>
      ) : null}
      {detail?.state === 'given' ? null : (
        <Disclosure label="详情" className="hitl-fold" contentClassName="hitl-fold-body">
          <CodeSurface name="参数" text={given.text} />
          {given.truncated ? (
            <p className="hitl-quiet-line">{`参数太长，只显示开头。全文摘要 ${given.digest}`}</p>
          ) : null}
        </Disclosure>
      )}
    </>
  )
}

function Outcome({ card, driver }: Readonly<{ card: Shown; driver: CardsDriver }>) {
  if (card.kind === 'closed')
    return (
      <div className="hitl-outcome">
        <NoticeLine
          notice={card.closed.notice}
          action={{ label: '知道了', onClick: () => driver.dismiss(card.key) }}
        />
      </div>
    )
  const submit = card.entry.submit
  if (submit.kind === 'refused')
    return (
      <div className="hitl-outcome">
        <NoticeLine notice={submit.notice} />
      </div>
    )
  if (submit.kind !== 'unknown') return null
  return (
    <div className="hitl-outcome">
      <NoticeLine
        notice={submit.notice}
        action={
          submit.confirming
            ? undefined
            : { label: '再确认一次', icon: RetryIcon, onClick: () => driver.confirm(card.key) }
        }
      />
    </div>
  )
}
