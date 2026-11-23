import {
  ActionTooltip,
  Button,
  CloseIcon,
  DoneIcon,
  LoadingIndicator,
  WarningIcon,
} from '@omne-harness/ui-kit'
import { useId, useRef, useState, type JSX } from 'react'
import type { CardsDriver } from '../model/cards-driver.ts'
import {
  EMPTY_DRAFT,
  busy,
  sheetOf,
  type Draft,
  type Entry,
  type Sheet,
  type State,
} from '../model/cards-machine.ts'
import { verdictOf, type Exposed } from '../model/verdict.ts'
import { CardView, itemOf, lastingChosen, type Shown } from './card-view.tsx'
import {
  humanInterventionPaper,
  humanInterventionPaperFoot,
  humanInterventionPaperFootSubmit,
  humanInterventionPaperFootActions,
} from '../parts.ts'

type Props = Readonly<{ driver: CardsDriver; state: State; group: string }>

function shownOf(state: State, sheet: Sheet): Shown[] {
  return [
    ...sheet.entries.map(entry => ({
      kind: 'pending' as const,
      key: entry.key,
      entry,
      draft: state.drafts[entry.key] ?? EMPTY_DRAFT,
    })),
    ...sheet.closed.map(closed => ({ kind: 'closed' as const, key: closed.key, closed })),
  ]
}

/** A section keeps the place it had on the paper (a closed one stays where it stood); new ones come last. */
function inPlace(shown: readonly Shown[], before: readonly string[]): Shown[] {
  const at = new Map(before.map((key, index) => [key, index]))
  return shown
    .map((card, index) => ({ card, rank: at.get(card.key) ?? before.length + index }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ card }) => card)
}

/** A lasting release option is chosen somewhere on the paper: its one submit arms (D8). */
function armedOf(state: State, sheet: Sheet): boolean {
  return sheet.entries.some(entry => {
    const question = entry.item.card.question
    const draft = state.drafts[entry.key]
    return (
      question.kind === 'release' &&
      draft !== undefined &&
      lastingChosen(question.options, draft.choice)
    )
  })
}

type Verdict = Readonly<{
  options: readonly Exposed[]
  entry: Entry
  draft: Draft
  pick: (option: Exposed) => void
  cancel: () => void
}>

/** A row in a fold is chosen (a lasting option, the person's own words, no answer): 取消 and 提交 stand in. */
function foldChosen({ options, draft }: Verdict): boolean {
  const choice = draft.choice
  if (choice.kind === 'option') return !options.some(option => option.id === choice.optionId)
  return choice.kind !== 'none'
}

function RoleGlyph({ role, waiting }: Readonly<{ role: Exposed['role']; waiting: boolean }>) {
  if (waiting) return <LoadingIndicator />
  if (role === 'approve') return <DoneIcon aria-hidden="true" />
  if (role === 'reject') return <CloseIcon aria-hidden="true" />
  return null
}

function OptionButton({
  option,
  main,
  waiting,
  disabled,
  quiet,
  onPress,
}: Readonly<{
  option: Exposed
  main: boolean
  waiting: boolean
  disabled: boolean
  quiet: string | undefined
  onPress: () => void
}>): JSX.Element {
  const face = (
    <Button
      variant={main ? 'default' : 'outline'}
      disabled={disabled}
      aria-busy={waiting || undefined}
      {...(quiet !== undefined && { 'aria-describedby': quiet })}
      onClick={onPress}
    >
      <RoleGlyph role={option.role} waiting={waiting} />
      {option.label}
    </Button>
  )
  return option.description === '' ? (
    face
  ) : (
    <ActionTooltip label={option.description}>{face}</ActionTooltip>
  )
}

function Foot({
  sheet,
  armed,
  verdict,
  go,
  submit,
}: {
  readonly sheet: Sheet
  readonly armed: boolean
  readonly verdict: Verdict | null
  readonly go: (key: string) => void
  readonly submit: () => void
}): JSX.Element {
  const quiet = useId()
  const unanswered = sheet.missing.length > 0 ? sheet.missing : sheet.ready ? [] : sheet.open
  const first = unanswered[0]
  const firstOpen = sheet.open[0]
  const said = sheet.running || armed
  const linked = !sheet.running && sheet.entries.length > 1
  const held = verdict !== null && (sheet.running || busy(verdict.entry.submit))
  const choice = verdict?.draft.choice
  const options = verdict !== null && !foldChosen(verdict) ? verdict.options : null
  return (
    <div className="hitl-foot" {...humanInterventionPaperFoot.props}>
      {!linked ? null : first !== undefined ? (
        <Button variant="link" className="hitl-missing" onClick={() => go(first)}>
          {`还差 ${unanswered.length} 题`}
        </Button>
      ) : firstOpen === undefined ? null : (
        <Button variant="link" className="hitl-missing" onClick={() => go(firstOpen)}>
          {`另有 ${sheet.open.length} 张放行卡没答，可以先提交已答的`}
        </Button>
      )}
      <div className="hitl-actions" {...humanInterventionPaperFootActions.props}>
        {options !== null ? (
          options.map((option, at) => {
            const waiting =
              sheet.running && choice?.kind === 'option' && choice.optionId === option.id
            return (
              <OptionButton
                key={option.id}
                option={option}
                main={at === options.length - 1}
                waiting={waiting}
                disabled={held || !option.offered}
                quiet={waiting ? quiet : undefined}
                onPress={() => verdict?.pick(option)}
              />
            )
          })
        ) : (
          <>
            {verdict === null ? null : (
              <Button variant="outline" disabled={held} onClick={verdict.cancel}>
                取消
              </Button>
            )}
            <Button
              variant={armed ? 'destructive' : 'default'}
              {...humanInterventionPaperFootSubmit.props}
              disabled={!sheet.ready}
              aria-busy={sheet.running || undefined}
              {...(said && { 'aria-describedby': quiet })}
              onClick={submit}
            >
              {sheet.running ? <LoadingIndicator /> : <DoneIcon aria-hidden="true" />}
              提交
            </Button>
          </>
        )}
      </div>
      {sheet.running ? (
        <p id={quiet} className="hitl-quiet" role="status">
          正在提交……
        </p>
      ) : armed ? (
        <p id={quiet} className="hitl-quiet" role="status">
          <span className="hitl-arming">
            <WarningIcon aria-hidden="true" />
            <strong>选了有持续效果的一档：以后同一类动作照它处理。</strong>
          </span>
        </p>
      ) : null}
    </div>
  )
}

/** One group of cards is one paper: its questions stacked as sections, one hairline apart, and one submit at its foot. */
export function CardArea({ driver, state, group }: Props): JSX.Element | null {
  const paper = useRef<HTMLDivElement>(null)
  const order = useRef<readonly string[]>([])
  const [cancels, setCancels] = useState(0)
  const sheet = sheetOf(state, group)
  const shown = inPlace(shownOf(state, sheet), order.current)
  order.current = shown.map(card => card.key)
  if (shown.length === 0) return null
  // "还差 n 题" brings the first unanswered section into view and puts focus on its first answer row.
  const go = (key: string) => {
    const section = [...(paper.current?.querySelectorAll<HTMLElement>('[data-card]') ?? [])].find(
      candidate => candidate.dataset['card'] === key,
    )
    section?.scrollIntoView({ block: 'nearest' })
    section
      ?.querySelector<HTMLElement>('textarea:not(:disabled), [role="radio"]:not(:disabled)')
      ?.focus({ preventScroll: true })
  }
  const buttons = verdictOf(shown.map(itemOf))
  const [only] = sheet.entries
  const draft = only === undefined ? EMPTY_DRAFT : (state.drafts[only.key] ?? EMPTY_DRAFT)
  const verdict: Verdict | null =
    buttons === null || only === undefined
      ? null
      : {
          options: buttons,
          entry: only,
          draft,
          pick: option => {
            driver.draft(only.key, {
              choice: { kind: 'option', optionId: option.id },
              text: draft.text,
            })
            driver.submitGroup(group)
          },
          cancel: () => {
            driver.draft(only.key, { choice: { kind: 'none' }, text: draft.text })
            setCancels(count => count + 1)
          },
        }
  return (
    <div className="hitl-paper" ref={paper} {...humanInterventionPaper.props}>
      {shown.map((card, at) => (
        <CardView
          key={card.key}
          card={card}
          at={at + 1}
          of={shown.length}
          optionsAsButtons={buttons !== null}
          cancels={cancels}
          disabled={card.kind === 'closed' || sheet.running || busy(card.entry.submit)}
          driver={driver}
          onDraft={value => driver.draft(card.key, value)}
        />
      ))}
      {sheet.entries.length === 0 ? null : (
        <Foot
          sheet={sheet}
          armed={armedOf(state, sheet)}
          verdict={verdict}
          go={go}
          submit={() => driver.submitGroup(group)}
        />
      )}
    </div>
  )
}
