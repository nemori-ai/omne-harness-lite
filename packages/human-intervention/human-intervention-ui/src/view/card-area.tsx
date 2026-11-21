import { Button, DoneIcon, LoadingIndicator, WarningIcon } from '@omne-harness/ui-kit'
import { useId, useRef, type JSX } from 'react'
import type { CardsDriver } from '../model/cards-driver.ts'
import { EMPTY_DRAFT, busy, sheetOf, type Sheet, type State } from '../model/cards-machine.ts'
import { CardView, lastingChosen, type Shown } from './card-view.tsx'

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

function Foot({
  sheet,
  armed,
  go,
  submit,
}: {
  readonly sheet: Sheet
  readonly armed: boolean
  readonly go: (key: string) => void
  readonly submit: () => void
}): JSX.Element {
  const quiet = useId()
  const firstMissing = sheet.missing[0]
  const firstOpen = sheet.open[0]
  const said = sheet.running || armed
  return (
    <div className="hitl-foot">
      {sheet.running ? null : firstMissing !== undefined ? (
        <Button variant="link" className="hitl-missing" onClick={() => go(firstMissing)}>
          {`还差 ${sheet.missing.length} 题`}
        </Button>
      ) : firstOpen === undefined ? null : (
        <Button variant="link" className="hitl-missing" onClick={() => go(firstOpen)}>
          {`另有 ${sheet.open.length} 张放行卡没答，可以先提交已答的`}
        </Button>
      )}
      <div className="hitl-actions">
        <Button
          variant={armed ? 'destructive' : 'default'}
          disabled={!sheet.ready}
          aria-busy={sheet.running || undefined}
          {...(said && { 'aria-describedby': quiet })}
          onClick={submit}
        >
          {sheet.running ? <LoadingIndicator /> : <DoneIcon aria-hidden="true" />}
          提交
        </Button>
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
  return (
    <div className="hitl-paper" ref={paper}>
      {shown.map((card, at) => (
        <CardView
          key={card.key}
          card={card}
          at={at + 1}
          of={shown.length}
          disabled={card.kind === 'closed' || sheet.running || busy(card.entry.submit)}
          driver={driver}
          onDraft={value => driver.draft(card.key, value)}
        />
      ))}
      {sheet.entries.length === 0 ? null : (
        <Foot
          sheet={sheet}
          armed={armedOf(state, sheet)}
          go={go}
          submit={() => driver.submitGroup(group)}
        />
      )}
    </div>
  )
}
