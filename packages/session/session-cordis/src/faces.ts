import { fail } from '@omne-harness/operation-result'
import type { SessionInstance } from '@omne-harness/session'
import type { SessionCallerClass, SessionFailure } from '@omne-harness/session-contract'

export type ProviderFaces = ReturnType<SessionInstance<unknown>['facesFor']>

const CLASSES: readonly SessionCallerClass[] = ['intake', 'coordinator', 'maintainer', 'reader']

export function callerClassOf(intercept: unknown): SessionCallerClass | null {
  if (typeof intercept !== 'object' || intercept === null) return null
  const caller: unknown = (intercept as Readonly<Record<string, unknown>>)['caller']
  return CLASSES.find(candidate => candidate === caller) ?? null
}

function refuseAll(
  template: ProviderFaces,
  refusal: (action: string) => SessionFailure,
): ProviderFaces {
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
    directory: refused(template.directory, 'directory.'),
  }) as unknown as ProviderFaces
}

export function deniedFaces(template: ProviderFaces): ProviderFaces {
  return refuseAll(template, action => ({ kind: 'denied', action }))
}

export function removedFaces(template: ProviderFaces): ProviderFaces {
  return refuseAll(template, action => ({
    kind: 'unavailable',
    owner: 'session',
    diagnostic: `the session provider is being removed; ${action} is not served`,
  }))
}
