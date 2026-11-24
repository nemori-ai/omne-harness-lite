import type { HumanInterventionCardItem } from '@omne-harness/human-intervention-protocol'
import {
  Ago,
  Button,
  ChoiceList,
  ChoiceRow,
  CloseIcon,
  CodeSurface,
  Disclosure,
  DisclosureContent,
  FactList,
  FactRow,
  IconButton,
  LoadingState,
  PermissionIcon,
  QuestionIcon,
  RetryIcon,
  StateWord,
  Textarea,
} from '@omne-harness/ui-kit'
import { useId, useState, type JSX, type ReactNode } from 'react'
import type { CardsDriver } from '../model/cards-driver.ts'
import type { Choice, Closed, Draft, Entry } from '../model/cards-machine.ts'
import { exposedOf, type Exposed } from '../model/verdict.ts'
import { NoticeLine } from './notice.tsx'
import { ReleaseDetailView } from './release-detail.tsx'
import {
  humanInterventionPaperCard,
  humanInterventionPaperCardAnswer,
  humanInterventionPaperCardTitle,
} from '../parts.ts'

export type Shown =
  | Readonly<{ kind: 'pending'; key: string; entry: Entry; draft: Draft }>
  | Readonly<{ kind: 'closed'; key: string; closed: Closed }>

export const itemOf = (card: Shown): HumanInterventionCardItem =>
  card.kind === 'pending' ? card.entry.item : card.closed.item

export const draftOfShown = (card: Shown): Draft =>
  card.kind === 'pending' ? card.draft : card.closed.draft

type Question = HumanInterventionCardItem['card']['question']
type ReleaseQuestion = Extract<Question, { kind: 'release' }>
type ReleaseOption = ReleaseQuestion['options'][number]

const WHO: Readonly<Record<string, string>> = {
  question: 'Agent 在问你',
  extension: '拓展件在问你',
}

const OPTION = 'option:'
const WORDS = 'words'
const DECLINE = 'decline'

/** Whose move it is and when it was asked, once at the head of the section: amber while the card waits on the person. */
function KindLine({ card }: Readonly<{ card: Shown }>) {
  const item = itemOf(card)
  const release = item.card.question.kind === 'release'
  const Glyph = release ? PermissionIcon : QuestionIcon
  const submit = card.kind === 'pending' ? card.entry.submit : null
  const waiting = submit !== null && (submit.kind === 'none' || submit.kind === 'refused')
  const word =
    card.kind === 'closed' ? (
      <StateWord state="closed" />
    ) : submit?.kind === 'unknown' ? (
      <StateWord state="unknown" />
    ) : (
      <span>{release ? '需要你授权' : '需要你回答'}</span>
    )
  const asked = item.askedAt
  return (
    <p className="hitl-kind" data-waiting={waiting}>
      <Glyph aria-hidden="true" className="hitl-kind-mark" />
      {word}
      {submit?.kind === 'submitting' ? (
        <LoadingState label="正在提交" className="hitl-kind-trail" />
      ) : asked === undefined ? null : (
        <span className="hitl-kind-trail">
          <Ago at={asked} className="hitl-kind-time" />
        </span>
      )}
    </p>
  )
}

function whoOf(item: HumanInterventionCardItem): string {
  const who = WHO[item.card.question.kind] ?? item.card.question.kind
  return item.displayContext === '' ? who : `${who} · ${item.displayContext}`
}

type Props = Readonly<{
  card: Shown
  id: string
  shown: boolean
  optionsAsButtons: boolean
  cancels: number
  disabled: boolean
  driver: CardsDriver
  onDraft: (draft: Draft) => void
}>

/** One section of the paper: the kind line, the question, the answer rows, and what came of sending it. */
export function CardView({
  card,
  id,
  shown,
  optionsAsButtons,
  cancels,
  disabled,
  driver,
  onDraft,
}: Props): JSX.Element {
  const item = itemOf(card)
  const question = item.card.question
  const release = question.kind === 'release'
  const title = useId()
  const state = card.kind === 'closed' ? 'closed' : card.entry.submit.kind
  return (
    <article
      id={id}
      inert={!shown}
      className="hitl-section"
      {...humanInterventionPaperCard.props}
      data-card={card.key}
      data-kind={question.kind}
      data-state={state}
      aria-labelledby={title}
    >
      <KindLine card={card} />
      <h3
        id={title}
        className="hitl-title"
        {...humanInterventionPaperCardTitle.props}
        data-face={release ? 'ui' : 'reading'}
      >
        {question.title}
      </h3>
      {release || question.description === '' ? null : (
        <p className="hitl-text">{question.description}</p>
      )}
      {release ? null : <p className="hitl-who">{whoOf(item)}</p>}
      {release ? <ReleaseCall question={question} /> : null}
      <DisclosureContent open={card.kind !== 'closed'}>
        <Answer
          key={cancels}
          item={item}
          draft={draftOfShown(card)}
          buttons={optionsAsButtons}
          disabled={disabled}
          onDraft={onDraft}
        />
      </DisclosureContent>
      <Outcome card={card} driver={driver} />
    </article>
  )
}

const optionValue = (id: string) => `${OPTION}${id}`

function valueOf(choice: Choice): string | undefined {
  if (choice.kind === 'option') return optionValue(choice.optionId)
  if (choice.kind === 'none') return undefined
  return choice.kind === 'words' ? WORDS : DECLINE
}

function choiceOf(value: string): Choice {
  if (value === WORDS) return { kind: 'words' }
  if (value === DECLINE) return { kind: 'decline' }
  return { kind: 'option', optionId: value.slice(OPTION.length) }
}

// Choosing a row keeps the words and sends only that row; 取消 on the paper remounts this, folding the folds.
function Answer({
  item,
  draft,
  buttons,
  disabled,
  onDraft,
}: Readonly<{
  item: HumanInterventionCardItem
  draft: Draft
  buttons: boolean
  disabled: boolean
  onDraft: (draft: Draft) => void
}>): JSX.Element {
  const question = item.card.question
  const choose = (choice: Choice) => onDraft({ choice, text: draft.text })
  const field = (
    <div className="hitl-field">
      <Textarea
        aria-label="用自己的话回答"
        value={draft.text}
        disabled={disabled}
        onChange={event => onDraft({ choice: { kind: 'words' }, text: event.target.value })}
      />
    </div>
  )
  const consequence =
    question.declineConsequence === '' ? null : (
      <p className="hitl-decline-text">{question.declineConsequence}</p>
    )
  if (question.options.length === 0) {
    const declined = draft.choice.kind === 'decline'
    return (
      <div className="hitl-answer" {...humanInterventionPaperCardAnswer.props}>
        {field}
        <div className="hitl-decline">
          <Button
            variant="link"
            className="hitl-decline-link"
            aria-pressed={declined}
            disabled={disabled}
            onClick={() => choose(declined ? { kind: 'words' } : { kind: 'decline' })}
          >
            不回答这一题
          </Button>
          {consequence === null ? null : (
            <DisclosureContent open={declined}>{consequence}</DisclosureContent>
          )}
        </div>
      </div>
    )
  }
  const chosen = valueOf(draft.choice)
  const lasting =
    question.kind === 'release' ? question.options.filter(option => option.lasting) : []
  return (
    <div
      className="hitl-answer"
      {...humanInterventionPaperCardAnswer.props}
      data-verdict={buttons ? 'buttons' : 'rows'}
    >
      <ChoiceList
        label="作答"
        value={chosen}
        onValueChange={value => choose(choiceOf(value))}
        disabled={disabled}
        className="hitl-options"
      >
        {buttons
          ? null
          : exposedOf(question).map(option => <Row key={option.id} option={option} />)}
        {lasting.length === 0 ? null : (
          <Fold label="这一类动作" held={lasting.some(option => optionValue(option.id) === chosen)}>
            {lasting.map(option => (
              <Row key={option.id} option={option} />
            ))}
          </Fold>
        )}
        <Fold label="自己写，或不回答" held={chosen === WORDS || chosen === DECLINE}>
          <ChoiceRow value={WORDS} label="用自己的话回答">
            {field}
          </ChoiceRow>
          <ChoiceRow value={DECLINE} label="不回答这一题">
            {consequence}
          </ChoiceRow>
        </Fold>
      </ChoiceList>
    </div>
  )
}

function Row({ option }: Readonly<{ option: Exposed }>) {
  return (
    <ChoiceRow
      value={optionValue(option.id)}
      label={option.label}
      {...(option.description === '' ? {} : { description: option.description })}
      disabled={!option.offered}
    />
  )
}

export function lastingChosen(options: readonly ReleaseOption[], choice: Draft['choice']): boolean {
  return (
    choice.kind === 'option' &&
    options.some(option => option.lasting && option.id === choice.optionId)
  )
}

/** A quiet fold of answer rows; it stays open while one of its rows is chosen. */
function Fold({
  label,
  held,
  children,
}: Readonly<{ label: string; held: boolean; children: ReactNode }>) {
  const [open, setOpen] = useState(false)
  return (
    <Disclosure
      label={label}
      open={open || held}
      onOpenChange={setOpen}
      className="hitl-choice-fold"
      contentClassName="hitl-choice-fold-rows"
    >
      {children}
    </Disclosure>
  )
}

// The call as a fact table, then what the tool said it would do, or the arguments behind 详情.
function ReleaseCall({ question }: Readonly<{ question: ReleaseQuestion }>): JSX.Element {
  const { target, arguments: given, detail } = question
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
      <div className="hitl-outcome hitl-closed">
        <p className="hitl-closed-line">{card.closed.notice.text}</p>
        <IconButton label="知道了" size="icon-compact" onClick={() => driver.dismiss(card.key)}>
          <CloseIcon aria-hidden="true" />
        </IconButton>
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
