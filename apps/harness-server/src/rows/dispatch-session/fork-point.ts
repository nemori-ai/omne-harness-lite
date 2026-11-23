import type { PortRead } from '@omne-harness/dispatch'
import type {
  ForkPoint,
  ForkPointRead,
  SessionAccess,
  SessionFailure,
} from '@omne-harness/session-contract'

type Answer = Readonly<{ ok: ForkPointRead }> | Readonly<{ failure: SessionFailure }>

type Asked<P> = SessionAccess<P> & Readonly<{ asking: string }>

/** The point before the asking message, as a dispatch reads it: null when the session names none;
 * a read Session refuses or cannot make is no answer, never "none". */
export async function readForkPointOf<P>(
  read: (access: Asked<P>) => Promise<Answer>,
  access: Asked<P>,
): Promise<PortRead<ForkPoint | null>> {
  const answer = await read(access)
  if (!('ok' in answer)) return { kind: 'unavailable' }
  return { kind: 'read', value: answer.ok.kind === 'point' ? answer.ok.point : null }
}
