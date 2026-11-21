import { InlineNotice, LoadingState, RetryIcon, type Tone } from '@omne-harness/ui-kit'
import type { ReactNode } from 'react'
import { UNREADABLE_TEXT, type Reading, type Unreadable } from '../model/reading.ts'

/** The tone of each reason nothing could be read: a known trouble is a caution or a failure, an unknown one neutral. */
const UNREADABLE_TONE: Readonly<Record<Unreadable, Tone>> = {
  denied: 'neutral',
  'basis-unavailable': 'caution',
  'protocol-rejected': 'danger',
  unavailable: 'caution',
  uncertain: 'neutral',
  'not-sent': 'danger',
}

/** Draws one reading: its value, the domain's refusal, or why nothing could be read with 重试, in the block it is for. */
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
  switch (reading.kind) {
    case 'reading':
      return (
        <p>
          <LoadingState label="读取中" />
        </p>
      )
    case 'read':
      return children(reading.value)
    case 'refused':
      return <InlineNotice tone="neutral">{refused(reading.outcome, reading.body)}</InlineNotice>
    case 'unreadable':
      return (
        <InlineNotice
          tone={UNREADABLE_TONE[reading.reason]}
          action={{ label: '重试', icon: RetryIcon, onClick: reread }}
        >
          {`读不出：${UNREADABLE_TEXT[reading.reason]}`}
        </InlineNotice>
      )
  }
}
