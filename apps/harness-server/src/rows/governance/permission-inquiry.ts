import { canonicalText } from '@omne-harness/authorization'
import type { SessionInquiryView } from '@omne-harness/session-adapters'
import { sessionInquiryBinding } from '@omne-harness/session-adapters/cordis'
import type { SessionPermissionCurrent } from '@omne-harness/session-storage-sql/participants'

export const capturedInquirySchema = sessionInquiryBinding.need.shape.nullable()

/** The trusted publication is preserved; unrelated Session work revisions do not invalidate it. */
export function matchesCapturedInquiry(
  inquiry: SessionInquiryView | null,
  session: SessionPermissionCurrent,
): boolean {
  if (inquiry === null) return true
  const { basis } = inquiry
  return (
    basis.tenant === session.tenant &&
    basis.session === session.session &&
    basis.permissionRevision === session.revision &&
    canonicalText(basis.permissionSource) === canonicalText(session.source)
  )
}
