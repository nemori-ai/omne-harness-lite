import { createHash } from 'node:crypto'
import {
  deriveSessionOperation,
  type SessionCommand,
  type SessionRevision,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { afterSessionCommit } from '@omne-harness/session-storage-sql/participants'
import type { DomainRef, SqlIdentity, SqlStorage } from '@omne-harness/sql-contract'
import type { JournalCommitResult } from '../journal-commit.ts'
import { reminderOutcome } from './model-reminder-commit.ts'
import type { Book, Told } from './model-telling.ts'

const item = 'workspace-guidance-submission'
type RecoveryMarker = Readonly<{ operation: string; expected: SessionRevision; digest: string }>
type Candidate = Extract<SessionCommand, { kind: 'change' | 'commitDerived' }>

export function guidanceReservation(command: Candidate) {
  const at = command.input.expected
  if (at === undefined) throw new Error('guidance submission needs a Session revision')
  const expected = String(BigInt(at) + 1n) as SessionRevision
  const marker = {
    operation: command.input.operation,
    expected,
    digest: markerDigest(command.input.session, command.input.operation, expected),
  }
  return {
    marker,
    reserve: recordMarker(command.input, at, marker, 'reserved'),
    candidate: { ...command, input: { ...command.input, expected } } as Candidate,
  }
}

function markerDigest(session: Book['session'], operation: string, expected: string) {
  return (
    'sha256:' +
    createHash('sha256')
      .update(JSON.stringify([session, operation, expected]))
      .digest('hex')
  )
}

function lastGuidanceReservation(snapshot: WorkSnapshot): RecoveryMarker | 'invalid' | undefined {
  const change = snapshot.changes?.findLast(
    change => change.kind === 'recovery-input' && change.item === item,
  )
  if (change?.kind !== 'recovery-input') return undefined
  const { owner, revision, record, digest } = change.value
  if (
    change.basis.owner !== 'session-log-journal' ||
    !/^[1-9][0-9]*$/u.test(revision) ||
    digest !== markerDigest(snapshot.session, record, revision)
  )
    return 'invalid'
  if (owner === 'fenced') return undefined
  if (owner !== 'reserved') return 'invalid'
  return {
    operation: change.value.record,
    expected: change.value.revision as SessionRevision,
    digest: change.value.digest,
  }
}

export function guidanceStorageOperation(
  session: Book['session'],
  logical: string,
  at: SessionRevision,
) {
  return deriveSessionOperation({
    kind: 'context-step',
    session,
    scope: item + '/original',
    at,
    value: logical,
  })
}

function originalGuidanceIdentity(
  domain: DomainRef,
  session: Book['session'],
  marker: RecoveryMarker,
): SqlIdentity {
  const operation = guidanceStorageOperation(session, marker.operation, marker.expected)
  return {
    scope: domain.scope,
    transactionDomain: domain.transactionDomain,
    protocolVersion: '2',
    operation,
    operationKey: operation + '#1',
  }
}

export async function reconcileGuidanceSubmission(
  book: Book,
  domain: DomainRef,
  snapshot: WorkSnapshot,
  storage: SqlStorage,
  resolved: WeakMap<Book, string>,
  fence: (command: Extract<SessionCommand, { kind: 'change' }>) => Promise<JournalCommitResult>,
): Promise<Told> {
  const marker = lastGuidanceReservation(snapshot)
  if (!marker) return null
  const unavailable = (diagnostic: string): Told => ({
    kind: 'answer',
    value: { failure: { kind: 'unavailable', owner: 'session-log-journal', diagnostic } },
  })
  if (marker === 'invalid') return unavailable('invalid stored workspace guidance submission')
  const identity = originalGuidanceIdentity(domain, book.session, marker)
  if (resolved.get(book) === identity.operation) return null
  const receipt = await storage.query(identity).catch(() => null)
  if (receipt === null) return unavailable('workspace guidance receipt lookup failed')
  if (receipt.kind === 'committed') {
    await afterSessionCommit({
      storage,
      domain,
      tenant: book.tenantText,
      session: book.session,
      answer: { receipt, recalled: true },
      journal: { published: book.published === null ? null : String(book.published) },
    })
  } else if (snapshot.revision === marker.expected) {
    // Fence and original share a precondition: the first commit excludes the other.
    const result = reminderOutcome(
      await fence(recordMarker(book, marker.expected, marker, 'fenced')),
    )
    return typeof result === 'string'
      ? { kind: 'again' }
      : { kind: 'answer', value: { failure: result } }
  } else if (receipt.kind === 'unknown' || receipt.kind === 'settled') {
    return unavailable('the original workspace guidance submission is still unknown')
  }
  resolved.set(book, identity.operation)
  return null
}

function recordMarker(
  book: Pick<Book, 'tenant' | 'session'>,
  at: SessionRevision,
  marker: RecoveryMarker,
  state: 'reserved' | 'fenced',
): Extract<SessionCommand, { kind: 'change' }> {
  const value = {
    owner: state,
    record: marker.operation,
    revision: marker.expected,
    digest: marker.digest,
  }
  return {
    kind: 'change',
    input: {
      tenant: book.tenant,
      session: book.session,
      expected: at,
      operation: deriveSessionOperation({
        kind: 'context-step',
        session: book.session,
        scope: item,
        at: String(at),
        value: state + '/' + marker.operation,
      }),
      declaration: {
        kind: 'recovery-input',
        item,
        value,
        basis: { ...value, owner: 'session-log-journal' },
      },
    },
  }
}
