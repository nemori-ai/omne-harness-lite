import type { Adoption, AgentInstanceRef, SessionId } from '@omne-harness/session-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'

const RULE = 'slot1'

export type SessionSlot = Readonly<{ session: SessionId; adoption: Adoption }>

export type SessionSlotRefFailure = Readonly<{ kind: 'malformed'; reason: string }>

export function encodeSessionSlotRef(slot: SessionSlot): AgentInstanceRef {
  const { session, adoption } = slot
  return {
    owner: 'agent',
    id: JSON.stringify([
      RULE,
      session,
      adoption.owner,
      adoption.name,
      adoption.revision,
      adoption.digest,
    ]),
  }
}

export function decodeSessionSlotRef(
  ref: AgentInstanceRef,
): Outcome<SessionSlot, SessionSlotRefFailure> {
  const malformed = (reason: string) => fail({ kind: 'malformed' as const, reason })
  let owner: unknown
  let id: unknown
  try {
    owner = ref.owner
    id = ref.id
  } catch {
    return malformed('the reference cannot be read')
  }
  if (owner !== 'agent') return malformed('the owner is not agent')
  if (typeof id !== 'string') return malformed('the id is not a text')
  let parsed: unknown
  try {
    parsed = JSON.parse(id)
  } catch {
    return malformed('the id is not JSON')
  }
  if (!Array.isArray(parsed) || parsed.length !== 6) return malformed('not six elements')
  const items: unknown[] = parsed
  if (!items.every((item): item is string => typeof item === 'string'))
    return malformed('an element is not a text')
  const [rule, session, adoptionOwner, name, revision, digest] = items as [
    string,
    string,
    string,
    string,
    string,
    string,
  ]
  if (rule !== RULE) return malformed(`the rule is not ${RULE}`)
  if (JSON.stringify(items) !== id) return malformed('the id is not the canonical text')
  return succeed({
    session: session as SessionId,
    adoption: { owner: adoptionOwner, name, revision, digest },
  })
}
