import { Button, EmptyState, LoadingState } from '@omne-harness/ui-kit'
import type { ReactNode } from 'react'
import { UNREADABLE_TEXT, type Reading } from '../model/reading.ts'

/** Draws one reading: its value, the domain's refusal, or why nothing could be read, with a retry. */
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
      return <LoadingState label="读取中" />
    case 'read':
      return children(reading.value)
    case 'refused':
      return <EmptyState role="status" title={refused(reading.outcome, reading.body)} />
    case 'unreadable':
      return (
        <EmptyState
          role="alert"
          title={`读不出：${UNREADABLE_TEXT[reading.reason]}`}
          action={<Button onClick={reread}>重读</Button>}
        />
      )
  }
}
