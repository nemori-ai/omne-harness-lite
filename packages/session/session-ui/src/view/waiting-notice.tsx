import { Button, InlineNotice } from '@omne-harness/ui-kit'
import type { Item } from '../model/conversation.ts'
import type { SessionDriver } from '../model/session-driver.ts'
import { causeSentence, type Retry, type Waiting } from '../model/waiting.ts'

export const NOTHING_PENDING = '没有没处理的消息，发一条新消息让它接着做。'

export function waitingAnchor(items: readonly Item[], waiting: Waiting | null): string | null {
  const fact = waiting?.fact
  if (fact?.kind !== 'waiting') return null
  return items.findLast(item => item.kind === 'marker' && item.failedRun === fact.run)?.key ?? null
}

export function WaitingNotice({
  waiting,
  driver,
}: {
  readonly waiting: Waiting | null
  readonly driver: SessionDriver
}) {
  const fact = waiting?.fact
  if (waiting === null || fact?.kind !== 'waiting') return null
  return (
    <section className="omne-waiting" role="status" aria-label="这一轮失败了">
      <InlineNotice tone="caution" role="status" title={causeSentence(fact.cause)}>
        <PendingLine pending={fact.pending} retry={waiting.retry} onRetry={() => driver.retry()} />
      </InlineNotice>
    </section>
  )
}

function PendingLine({
  pending,
  retry,
  onRetry,
}: {
  readonly pending: number
  readonly retry: Retry
  readonly onRetry: () => void
}) {
  if (pending === 0 || retry.kind === 'no-change') return <p>{NOTHING_PENDING}</p>
  return (
    <>
      <p>
        还有 {pending}{' '}
        条消息没有处理，它们没有丢。按「重试」让它带着这些消息接着做，也可以发一条新消息。
      </p>
      {retry.kind === 'unknown' ? <p>重试的结果不知道。可以再问一次，用的是同一次重试。</p> : null}
      {retry.kind === 'idle' && retry.notice !== null ? <p>{retry.notice.text}</p> : null}
      <Button
        variant="outline"
        size="compact"
        disabled={retry.kind === 'sending'}
        onClick={onRetry}
      >
        {retry.kind === 'unknown' ? '再问一次' : '重试'}
      </Button>
    </>
  )
}
