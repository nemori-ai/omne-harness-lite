import { InlineNotice, RetryIcon } from '@omne-harness/ui-kit'
import type { Item } from '../model/conversation.ts'
import type { SessionDriver } from '../model/session-driver.ts'
import { causeSentence, type Retry, type Waiting } from '../model/waiting.ts'
import { sessionTranscriptFailure } from '../parts.ts'

export const NOTHING_PENDING = '没有没处理的消息，发一条新消息让它接着做。'

export function waitingAnchor(items: readonly Item[], waiting: Waiting | null): string | null {
  const fact = waiting?.fact
  if (fact?.kind !== 'waiting') return null
  return items.findLast(item => item.kind === 'marker' && item.failedRun === fact.run)?.key ?? null
}

/** A failed run: the reason in the failure's tone, then in body ink what is left; 详情, and 重试 while inputs are left. */
export function WaitingNotice({
  waiting,
  driver,
}: {
  readonly waiting: Waiting | null
  readonly driver: SessionDriver
}) {
  const fact = waiting?.fact
  if (waiting === null || fact?.kind !== 'waiting') return null
  const retry = waiting.retry
  const left = fact.pending > 0 && retry.kind !== 'no-change'
  const detail = fact.cause?.detail ?? null
  return (
    <section
      className="omne-waiting"
      {...sessionTranscriptFailure.props}
      role="status"
      aria-label="这一轮失败了"
    >
      <InlineNotice
        tone="danger"
        role="status"
        title={causeSentence(fact.cause)}
        {...(detail === null ? {} : { detail })}
        {...(left
          ? {
              action: {
                label: retry.kind === 'unknown' ? '再问一次' : '重试',
                onClick: () => driver.retry(),
                icon: RetryIcon,
              },
            }
          : {})}
      >
        {left ? (
          <Left pending={fact.pending} retry={retry} />
        ) : (
          <p className="omne-waiting-body">{NOTHING_PENDING}</p>
        )}
      </InlineNotice>
    </section>
  )
}

function Left({ pending, retry }: { readonly pending: number; readonly retry: Retry }) {
  return (
    <>
      <p className="omne-waiting-body">
        还有 {pending}{' '}
        条消息没有处理，它们没有丢。按「重试」让它带着这些消息接着做，也可以发一条新消息。
      </p>
      {retry.kind === 'unknown' ? (
        <p className="omne-waiting-note">重试的结果不知道。可以再问一次，用的是同一次重试。</p>
      ) : null}
      {retry.kind === 'idle' && retry.notice !== null ? (
        <p className="omne-waiting-note">{retry.notice.text}</p>
      ) : null}
    </>
  )
}
