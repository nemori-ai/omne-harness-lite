// The model credential port of the row, taken from the tree on every call. The assembly page lists
// `modelCredentialCustody` as a trusted name this row reads per call, not a name it injects, so a
// reloaded `model-credential` row is seen by the next request and a missing one never blocks the
// entry. With the service absent every method answers `basis-unavailable`: nothing was written.
import type { Context } from '@deepseek-ai/cordis'
import type { ModelCredentialCustody } from '@omne-harness/server-entry'
import {
  modelCredentialCustodyKey,
  type ModelCredentialCustodyService,
} from '../model-credential/custody-service.ts'

const ABSENT = Object.freeze({ kind: 'basis-unavailable' as const })

export function modelCredentialsOfCall(ctx: Context): ModelCredentialCustody {
  const current = (): ModelCredentialCustodyService | undefined =>
    ctx.get(modelCredentialCustodyKey)
  return Object.freeze({
    async bind(input) {
      const custody = current()
      return custody === undefined ? ABSENT : custody.bind(input)
    },
    async unbind(input) {
      const custody = current()
      return custody === undefined ? ABSENT : custody.unbind(input)
    },
    async describe(input) {
      const custody = current()
      return custody === undefined ? ABSENT : custody.describe(input)
    },
  } satisfies ModelCredentialCustody)
}
