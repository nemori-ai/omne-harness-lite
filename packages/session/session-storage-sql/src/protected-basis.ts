// The commit basis of a permission assignment. The ordinary producer does not support that command
// (docs/commit-basis.md), so its basis comes from another combination. This package states what it
// needs from that combination; the application that assembles the combination supplies it.
import type { Outcome } from '@omne-harness/operation-result'
import type {
  SessionAccess,
  SessionCommand,
  SessionFailure,
  SessionPermissionWriteQualification,
} from '@omne-harness/session-contract'
import type { FactCommandV2 } from '@omne-harness/sql-contract'

/** A permission assignment that passed access, as the Session writer will receive it. */
export type SessionProtectedCommit<P> = Readonly<{
  access: SessionAccess<P>
  command: Extract<SessionCommand, { kind: 'change' }>
  qualification: SessionPermissionWriteQualification
  /** The final Session fact-command. The basis binds its digest (`sessionCommitDigest`). */
  session: FactCommandV2
}>

export type SessionProtectedBasis = Readonly<{
  /** A combination registered in the tenant domain. It holds the Session writer and the producers. */
  combination: Readonly<{ combinationVersion: string; manifestDigest: string }>
  /** The commands of the members that produce `session.commit-basis`. None is a Session command. */
  commands: readonly FactCommandV2[]
}>

/**
 * Forms the basis of one delivery from the current facts. The commit asks it only when no earlier
 * delivery of the operation is committed. A failure is the answer of that delivery and keeps
 * nothing: the next delivery asks again.
 */
export type SessionProtectedBasisSource<P> = (
  commit: SessionProtectedCommit<P>,
) => Promise<Outcome<SessionProtectedBasis, SessionFailure>>
