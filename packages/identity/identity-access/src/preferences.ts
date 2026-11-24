import type { IdentityGovernance } from '@omne-harness/identity'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import type { IdentityProtocol } from '@omne-harness/identity-protocol'
import { callerOf } from './caller.ts'

type Handlers = AccessContribution<IdentityProtocol>['operations']
type Names = 'read-account-preference' | 'write-account-preference'
type Governed = <A>(
  work: (governance: IdentityGovernance) => Promise<A>,
) => Promise<A | Readonly<{ outcome: 'basis-unavailable' }>>

/** The preferences of the calling account; the account is always the caller's, never named in the body. */
export function withPreferences(governed: Governed, rest: Omit<Handlers, Names>): Handlers {
  return {
    ...rest,
    'read-account-preference': (call, body) =>
      governed(async governance => {
        const login = callerOf(call.principal).login
        const outcome = await governance.readAccountPreference({ login, name: body.name })
        if (outcome.kind !== 'succeeded') return { outcome: outcome.kind }
        return { outcome: 'succeeded', body: { value: outcome.value, revision: outcome.revision } }
      }),
    'write-account-preference': (call, body) =>
      governed(async governance => {
        const login = callerOf(call.principal).login
        const { name, value, expected } = body
        const outcome = await governance.writeAccountPreference({ login, name, value, expected })
        if (outcome.kind === 'succeeded' || outcome.kind === 'conflict')
          return { outcome: outcome.kind, body: { revision: outcome.revision } }
        return { outcome: outcome.kind }
      }),
  }
}
