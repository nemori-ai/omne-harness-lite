// The caller class check of the four face properties (SPEC property 6) and the faces that answer
// when no operation may run. The class is a fact of the assembly, read from the intercept
// configuration of the caller (`inject: { session: { caller } }`). It selects which face the caller
// sees. It grants nothing: the access boundary is the access decision of each operation.
import { fail } from '@omne-harness/operation-result'
import type {
  SessionCallerClass,
  SessionFailure,
  SessionFaces,
} from '@omne-harness/session-contract'

const CLASSES: readonly SessionCallerClass[] = ['intake', 'coordinator', 'maintainer', 'reader']

/** The caller class of an intercept configuration, or null when it names none of the four. */
export function callerClassOf(intercept: unknown): SessionCallerClass | null {
  if (typeof intercept !== 'object' || intercept === null) return null
  const caller: unknown = (intercept as Readonly<Record<string, unknown>>)['caller']
  return CLASSES.find(candidate => candidate === caller) ?? null
}

/**
 * A copy of `template` in which every operation answers `refusal(action)`. The operations are those
 * of `template`, so the list lives in one place: the faces of the instance. The history operations
 * are named `history.<operation>`, as the instance names them in its own answers.
 */
function refuseAll(
  template: SessionFaces<unknown>,
  refusal: (action: string) => SessionFailure,
): SessionFaces<unknown> {
  const refused = (face: object, prefix: string): object =>
    Object.freeze(
      Object.fromEntries(
        Object.keys(face).map(operation => [
          operation,
          () => Promise.resolve(fail(refusal(`${prefix}${operation}`))),
        ]),
      ),
    )
  return Object.freeze({
    work: refused(template.work, ''),
    management: refused(template.management, ''),
    reconciliation: refused(template.reconciliation, ''),
    history: refused(template.history, 'history.'),
  }) as unknown as SessionFaces<unknown>
}

/** Every operation `denied`, for a caller whose class is unknown. */
export function deniedFaces(template: SessionFaces<unknown>): SessionFaces<unknown> {
  return refuseAll(template, action => ({ kind: 'denied', action }))
}

/** Every operation `unavailable` with owner `session`, once removal has started. */
export function removedFaces(template: SessionFaces<unknown>): SessionFaces<unknown> {
  return refuseAll(template, action => ({
    kind: 'unavailable',
    owner: 'session',
    diagnostic: `the session provider is being removed; ${action} is not served`,
  }))
}
