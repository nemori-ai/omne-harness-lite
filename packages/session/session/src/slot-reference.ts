// The session slot reference that C2 gives as `AdvanceRef.instance` (XC-AGINST 第 2.1 节). The
// format belongs to the Agent trusted adaptation AD-14 in session-adapters, which also parses it;
// this member computes it by the same public rule and does not import session-adapters.
import type { Adoption, AgentInstanceRef, SessionId } from '@omne-harness/session-contract'

/**
 * `{ owner: 'agent', id: JSON.stringify(["slot1", session, adoption.owner, adoption.name,
 * adoption.revision, adoption.digest]) }`. The tenant is not in the text: the reference lives in
 * the tenant's own session log, and AD-14 takes the tenant from `DriveTarget.tenant`.
 */
export function sessionSlotReference(session: SessionId, adoption: Adoption): AgentInstanceRef {
  return {
    owner: 'agent',
    id: JSON.stringify([
      'slot1',
      session,
      adoption.owner,
      adoption.name,
      adoption.revision,
      adoption.digest,
    ]),
  }
}
