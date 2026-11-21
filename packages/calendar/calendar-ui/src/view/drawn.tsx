import { InlineNotice, LoadingState, RetryIcon, type Tone } from '@omne-harness/ui-kit'
import type { ReactNode } from 'react'
import { UNREADABLE_TEXT, type Reading, type Unreadable } from '../model/reading.ts'

/** The tone of the notice for each read that gave no answer, from the calendar SPEC's table of notices. */
const UNREADABLE_TONE: Readonly<Record<Unreadable, Tone>> = {
  denied: 'neutral',
  'basis-unavailable': 'caution',
  unavailable: 'caution',
  uncertain: 'neutral',
  'protocol-rejected': 'danger',
  'not-sent': 'danger',
}

type Unanswered = Extract<Reading<never>, { kind: 'refused' | 'unreadable' }>

/** A read that is not a value, said in place: the domain's refusal, or why nothing was read with a retry. */
export function ReadNotice({
  reading,
  reread,
  refused,
}: Readonly<{
  reading: Unanswered
  reread: () => void
  refused: (outcome: string, body: unknown) => string
}>): ReactNode {
  if (reading.kind === 'refused')
    return <InlineNotice tone="neutral">{refused(reading.outcome, reading.body)}</InlineNotice>
  return (
    <InlineNotice
      tone={UNREADABLE_TONE[reading.reason]}
      action={{ label: '重试', icon: RetryIcon, onClick: reread }}
    >
      {`读不出：${UNREADABLE_TEXT[reading.reason]}`}
    </InlineNotice>
  )
}

/** Draws one reading: its value, a loading state while it is out, or its `ReadNotice`. */
export function Drawn<T>({
  reading,
  reread,
  refused,
  children,
}: Readonly<{
  reading: Reading<T>
  reread: () => void
  refused: (outcome: string, body: unknown) => string
  children: (value: T) => ReactNode
}>): ReactNode {
  if (reading.kind === 'reading') return <LoadingState label="读取中" />
  if (reading.kind === 'read') return children(reading.value)
  return <ReadNotice reading={reading} reread={reread} refused={refused} />
}
