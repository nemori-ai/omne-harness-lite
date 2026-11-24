import {
  decideMark,
  type Instant,
  type Marks,
  type MarkOperation,
  type NotificationRef,
} from '@omne-harness/notification-contract'
import type { NotificationTxn } from '../txn.ts'

export type MarkCommand = Readonly<{ ref: NotificationRef; operation: MarkOperation; now: Instant }>

export type MarkResult =
  | Readonly<{ kind: 'applied'; marks: Marks }>
  | Readonly<{ kind: 'recalled'; marks: Marks }>
  | Readonly<{ kind: 'not-found' }>
  | Readonly<{ kind: 'refused'; reason: 'restore-first' | 'superseded' }>

/** One disposition of one notification. It changes the marks and nothing else. */
export function markNotification(txn: NotificationTxn, command: MarkCommand): MarkResult {
  const { recipient, identity } = command.ref
  const record = txn.notification(recipient, identity)
  if (record === null) return { kind: 'not-found' }
  const decision = decideMark(record.marks, command.operation, command.now)
  if (decision.kind === 'recalled') return { kind: 'recalled', marks: record.marks }
  if (decision.kind === 'refused') return { kind: 'refused', reason: decision.reason }
  txn.setMarks(recipient, identity, decision.marks)
  return { kind: 'applied', marks: decision.marks }
}
