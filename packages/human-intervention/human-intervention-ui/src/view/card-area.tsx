import { Button, LoadingState } from '@omne-harness/ui-kit'
import { useState, type JSX, type KeyboardEvent } from 'react'
import type { CardsDriver } from '../model/cards-driver.ts'
import {
  EMPTY_DRAFT,
  busy,
  replyOf,
  sheetOf,
  type Draft,
  type Sheet,
  type State,
} from '../model/cards-machine.ts'
import { CardView, draftOfShown, itemOf, type Shown } from './card-view.tsx'

type Props = Readonly<{ driver: CardsDriver; state: State; group: string }>

const SHORT = 8

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

function answerText(card: Shown): string {
  const draft = draftOfShown(card)
  if (draft.choice.kind === 'decline') return '不回答'
  if (draft.choice.kind === 'option') {
    const id = draft.choice.optionId
    return itemOf(card).card.question.options.find(option => option.id === id)?.label ?? id
  }
  const text = draft.text.trim()
  return text.length > SHORT ? `${text.slice(0, SHORT)}…` : text
}

/** What the number strip says about one card. */
export function markOf(card: Shown): Readonly<{ state: string; text: string }> {
  if (card.kind === 'closed') return { state: 'closed', text: '被关掉' }
  const submit = card.entry.submit
  if (submit.kind === 'submitting') return { state: 'busy', text: '提交中' }
  if (submit.kind === 'unknown') return { state: 'busy', text: '结果不知道' }
  if (submit.kind === 'refused') return { state: 'refused', text: '没记上' }
  return replyOf(card.draft) === null
    ? { state: 'open', text: '未答' }
    : { state: 'answered', text: `已答：${answerText(card)}` }
}

const switchesCards = (event: KeyboardEvent<HTMLElement>): boolean => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false
  const target = event.target as HTMLElement
  return (
    target.closest('textarea, input, [role="radiogroup"]') === null && !target.isContentEditable
  )
}

/** One group of cards: one card at a time, a number strip, and one submit for all of them. */
export function CardArea({ driver, state, group }: Props): JSX.Element | null {
  const [viewing, setViewing] = useState<string | null>(null)
  const sheet = sheetOf(state, group)
  const shown = shownOf(state, sheet)
  if (shown.length === 0) return null
  const found = shown.findIndex(card => card.key === viewing)
  const index = found === -1 ? 0 : found
  const current = shown[index]!
  const many = shown.length > 1
  const go = (to: number) => setViewing(shown[(to + shown.length) % shown.length]!.key)
  const firstMissing = sheet.missing[0]
  const draft = (key: string, value: Draft, advance: boolean) => {
    driver.draft(key, value)
    if (!advance) return
    const missing = new Set(sheetOf(driver.getState(), group).missing)
    const order = [...shown.slice(index + 1), ...shown.slice(0, index)]
    const next = order.find(card => missing.has(card.key))
    if (next !== undefined) setViewing(next.key)
  }
  const disabled = sheet.running || (current.kind === 'pending' && busy(current.entry.submit))
  return (
    <div
      className="hitl-area"
      onKeyDown={event => {
        if (!many || !switchesCards(event)) return
        event.preventDefault()
        go(event.key === 'ArrowLeft' ? index - 1 : index + 1)
      }}
    >
      {many ? (
        <div className="hitl-strip" role="tablist" aria-label="题号">
          {shown.map((card, at) => {
            const mark = markOf(card)
            return (
              <Button
                key={card.key}
                variant="ghost"
                size="compact"
                role="tab"
                className="hitl-strip-item"
                data-mark={mark.state}
                aria-selected={at === index}
                onClick={() => setViewing(card.key)}
              >
                <span className="hitl-strip-number">{at + 1}</span>
                <span className="hitl-strip-mark">{mark.text}</span>
              </Button>
            )
          })}
        </div>
      ) : null}
      <div className="hitl-area-stage">
        {many ? (
          <Button variant="ghost" size="icon" aria-label="上一题" onClick={() => go(index - 1)}>
            ‹
          </Button>
        ) : null}
        <CardView
          key={current.key}
          card={current}
          at={index + 1}
          of={shown.length}
          disabled={disabled}
          driver={driver}
          onDraft={(value, advance) => draft(current.key, value, advance)}
        />
        {many ? (
          <Button variant="ghost" size="icon" aria-label="下一题" onClick={() => go(index + 1)}>
            ›
          </Button>
        ) : null}
      </div>
      {sheet.entries.length === 0 ? null : (
        <div className="hitl-area-foot">
          {sheet.running ? (
            <LoadingState label="正在提交……" />
          ) : firstMissing === undefined ? null : (
            <Button variant="link" onClick={() => setViewing(firstMissing)}>
              {`还差 ${sheet.missing.length} 题`}
            </Button>
          )}
          <Button
            className="hitl-area-submit"
            disabled={!sheet.ready}
            onClick={() => driver.submitGroup(group)}
          >
            提交
          </Button>
        </div>
      )}
    </div>
  )
}
