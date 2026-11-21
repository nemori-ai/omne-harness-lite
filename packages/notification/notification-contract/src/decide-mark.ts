import type { Instant, Marks, SendIdentity } from './values.ts'

export type MarkOperation = 'seen' | 'done' | 'dismiss' | 'restore'

export type MarkDecision =
  | Readonly<{ kind: 'apply'; marks: Marks }>
  | Readonly<{ kind: 'recalled' }>
  | Readonly<{ kind: 'refused'; reason: 'restore-first' }>
  | Readonly<{ kind: 'refused'; reason: 'superseded'; by: SendIdentity }>

type Resolution = 'unresolved' | 'done' | 'dismissed'
type Answer = 'recalled' | 'restore-first' | 'done' | 'dismissed' | 'reopen'

const RESOLVING: Record<Exclude<MarkOperation, 'seen'>, Record<Resolution, Answer>> = {
  done: { unresolved: 'done', done: 'recalled', dismissed: 'restore-first' },
  dismiss: { unresolved: 'dismissed', done: 'restore-first', dismissed: 'recalled' },
  restore: { unresolved: 'recalled', done: 'reopen', dismissed: 'reopen' },
}

/** One disposition of one notification under its current marks. */
export function decideMark(marks: Marks, operation: MarkOperation, now: Instant): MarkDecision {
  if (operation === 'seen')
    return marks.seenAt === null
      ? { kind: 'apply', marks: { ...marks, seenAt: now } }
      : { kind: 'recalled' }
  if (marks.supersededBy !== null)
    return { kind: 'refused', reason: 'superseded', by: marks.supersededBy }
  const answer = RESOLVING[operation][marks.resolved?.how ?? 'unresolved']
  if (answer === 'recalled') return { kind: 'recalled' }
  if (answer === 'restore-first') return { kind: 'refused', reason: 'restore-first' }
  return {
    kind: 'apply',
    marks: { ...marks, resolved: answer === 'reopen' ? null : { how: answer, at: now } },
  }
}
