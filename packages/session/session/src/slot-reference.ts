import type { Adoption, AgentInstanceRef, SessionId } from '@omne-harness/session-contract'

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
