import type { Authority, DurableEvidence } from '@omne-harness/agent-contract'
import type { SessionAttemptRecord } from '@omne-harness/session-contract'
import { canonical } from '../testing/canonical.ts'

export type GrantedAttachment = Readonly<{ authority: Authority; grant: DurableEvidence | null }>

export function attachmentOf<A extends GrantedAttachment>(
  attachments: readonly A[],
  authority: Authority,
): A | undefined {
  const text = canonical(authority)
  return attachments.find(item => canonical(item.authority) === text)
}

export function attemptOfGrant(
  attempts: readonly SessionAttemptRecord[] | undefined,
  execution: string,
  grant: DurableEvidence | null,
): SessionAttemptRecord | undefined {
  if (attempts === undefined || grant === null) return undefined
  const text = canonical(grant)
  return attempts.find(
    item =>
      item.execution === execution && item.grant !== undefined && canonical(item.grant) === text,
  )
}

export function attemptOfAuthority(
  attachments: readonly GrantedAttachment[],
  attempts: readonly SessionAttemptRecord[] | undefined,
  authority: Authority,
): SessionAttemptRecord | undefined {
  const attachment = attachmentOf(attachments, authority)
  return attachment === undefined
    ? undefined
    : attemptOfGrant(attempts, authority.execution, attachment.grant)
}
