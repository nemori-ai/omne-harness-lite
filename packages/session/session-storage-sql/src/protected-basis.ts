import type { Outcome } from '@omne-harness/operation-result'
import type {
  SessionAccess,
  SessionCommand,
  SessionFailure,
  SessionPermissionWriteQualification,
} from '@omne-harness/session-contract'
import type { FactCommandV2 } from '@omne-harness/sql-contract'

export type SessionProtectedCommit<P> = Readonly<{
  access: SessionAccess<P>
  command: Extract<SessionCommand, { kind: 'change' }>
  qualification: SessionPermissionWriteQualification
  session: FactCommandV2
}>

export type SessionProtectedBasis = Readonly<{
  combination: Readonly<{ combinationVersion: string; manifestDigest: string }>
  commands: readonly FactCommandV2[]
}>

export type SessionProtectedBasisSource<P> = (
  commit: SessionProtectedCommit<P>,
) => Promise<Outcome<SessionProtectedBasis, SessionFailure>>
