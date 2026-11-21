import type { PortRead } from '@omne-harness/dispatch'
import type {
  ForkPoint,
  ForkPointRead,
  SessionAccess,
  SessionFailure,
} from '@omne-harness/session-contract'

type Answer = Readonly<{ ok: ForkPointRead }> | Readonly<{ failure: SessionFailure }>

/** The point a session can be forked at now, as a dispatch reads it: null when the session names none;
 * a read Session refuses or cannot make is no answer, never "none". */
export async function readForkPointOf<P>(
  read: (access: SessionAccess<P>) => Promise<Answer>,
  access: SessionAccess<P>,
): Promise<PortRead<ForkPoint | null>> {
  const answer = await read(access)
  if (!('ok' in answer)) return { kind: 'unavailable' }
  return { kind: 'read', value: answer.ok.kind === 'point' ? answer.ok.point : null }
}
