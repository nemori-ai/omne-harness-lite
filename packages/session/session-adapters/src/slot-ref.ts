// The session slot reference (SPEC AD-14「会话槽引用」, XC-AGINST 第 2.1 节). The format belongs
// to AD-14, the trusted Agent adaptation: `AdvanceRef.instance` names no live instance, it names the
// slot that AD-14 asks the Agent host for. The session coordinator C2 computes the same text by the
// same rule without importing this member. Both functions are pure and do not throw.
import type { Adoption, AgentInstanceRef, SessionId } from '@omne-harness/session-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'

/** The first element of the text: the version of the rule. */
const RULE = 'slot1'

/** What a slot reference names. The tenant is not in it: AD-14 takes it from `DriveTarget.tenant`. */
export type SessionSlot = Readonly<{ session: SessionId; adoption: Adoption }>

/** Why a value is not a session slot reference. The reason is for the defect report only. */
export type SessionSlotRefFailure = Readonly<{ kind: 'malformed'; reason: string }>

/**
 * `{ owner: 'agent', id: JSON.stringify(["slot1", session, adoption.owner, adoption.name,
 * adoption.revision, adoption.digest]) }`. `adoption` is the adoption of the Run: the `candidate`
 * of `startRun` and `reload`, `RunState.active.adoption` for `claim`.
 */
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

/**
 * Parses a reference back into its slot. The text must be a JSON array of exactly six strings whose
 * first element is `"slot1"`, and it must equal its own re-encoding, so one slot has one text.
 */
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
    // The text came out of a session slot reference; the session log is its only writer.
    session: session as SessionId,
    adoption: { owner: adoptionOwner, name, revision, digest },
  })
}
