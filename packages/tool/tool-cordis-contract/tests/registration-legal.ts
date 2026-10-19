// The providers of the registration suite that the contract allows, and the preliminary check
// that the violating variants of the spec lay over a flawed service as well. Each is built at the
// boundary of the register service: it wraps `register` and the handles that it defines itself,
// and it never takes a flaw of flawed-registrations.ts or a control of a double.
import { fail } from '@omne-harness/operation-result'
import type { ToolRegistrationFailure } from '@omne-harness/tool-cordis-contract/cordis'
import {
  memoryToolRegistrationFixture,
  type ToolRegistrationFixture,
} from '@omne-harness/tool-cordis-contract/testing'

type Fixture = ToolRegistrationFixture<string>

/**
 * A provider that checks twice (IC-3 allows it): a preliminary check refuses early and writes
 * nothing, and `base` makes the final check in the same synchronous step as the write. Its
 * `refuseCheck` is its own: it refuses at the preliminary check and passes the refusal on to the
 * final one.
 */
export function preChecked(base: Fixture): Fixture {
  let refusal: ToolRegistrationFailure | null = null
  const mine: (readonly string[])[] = []
  return {
    ...base,
    refuseCheck: failure => {
      refusal = failure
      base.refuseCheck?.(failure)
    },
    checkedAgainst: () => [...mine, ...(base.checkedAgainst?.() ?? [])],
    service: {
      register: async input => {
        mine.push(base.listing?.() ?? [])
        if (refusal !== null) return fail(refusal)
        await Promise.resolve()
        return base.service.register(input)
      },
    },
  }
}

/**
 * The generated boundary provider of the table. The table of `register` has no progress kind and
 * no lost reply (IC-3: the synchronous check decides, a call that cannot be decided is refused as
 * `unavailable`), so the generated provider has nothing to mask: it is the boundary of the double
 * that passes every call through, and a case that read once is complete.
 */
export function generated(): Fixture {
  const base = memoryToolRegistrationFixture()
  return { ...base, service: { register: input => base.service.register(input) } }
}

/** IC-3 allows a check before the final one, over the conforming double. */
export const preCheckedDouble = (): Fixture => preChecked(memoryToolRegistrationFixture())

/**
 * The conforming double checks each tenant by its own authority: a publication under the
 * authority of another tenant is refused, and the tenants register apart.
 */
export const tenantChecking = (): Fixture => memoryToolRegistrationFixture()

/**
 * IC-3 keys a registration by tenant, and its authority names a tenant. A provider that knows one
 * tenant only refuses the publication of another: the fixture then offers no second tenant.
 */
export function oneTenantChecking(): Fixture {
  const {
    otherTenant: _tenant,
    otherAuthority: _authority,
    ...base
  } = memoryToolRegistrationFixture()
  return {
    ...base,
    service: {
      register: input =>
        JSON.stringify(input.publication[0].tenant) === JSON.stringify(base.tenant)
          ? base.service.register(input)
          : Promise.resolve(fail({ kind: 'denied' })),
    },
  }
}
