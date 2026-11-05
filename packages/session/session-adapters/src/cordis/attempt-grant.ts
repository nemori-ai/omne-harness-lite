// How an Authority is resolved to the Session attempt it was granted under (R2-D348, R2-D349).
// The Agent records only the grant of each attachment (`exec.attached.grant`): the evidence the
// Session handed it at the invoke or resume of the attempt, held opaque and given back. The Session
// records, for each attempt, the grant it gave out (`SessionAttemptRecord.grant`). A consumer that
// must know whether an Authority is the current advance takes the grant of the attachment the
// Authority names from the Agent's records, finds the attempt the Session issued that grant for,
// and compares it with the advance of the active Run. Nothing is guessed from the current advance:
// an attachment without a grant, or a grant the Session issued no attempt for, names no attempt.
import type { Authority, DurableEvidence } from '@omne-harness/agent-contract'
import type { SessionAttemptRecord } from '@omne-harness/session-contract'
import { canonical } from '../testing/canonical.ts'

/** The attachment the Authority names, as the Agent records it. */
export type GrantedAttachment = Readonly<{ authority: Authority; grant: DurableEvidence | null }>

/**
 * The attachment of `execution` that `authority` is: the one with the same identity (execution,
 * attachment, instance, generation and source), whatever its status now.
 */
export function attachmentOf<A extends GrantedAttachment>(
  attachments: readonly A[],
  authority: Authority,
): A | undefined {
  const text = canonical(authority)
  return attachments.find(item => canonical(item.authority) === text)
}

/** The attempt of `execution` the Session issued `grant` for, by the grant it recorded. */
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

/** The attempt the Authority was granted under: through its attachment's grant, by the Session. */
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
