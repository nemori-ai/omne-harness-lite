import { fail } from '@omne-harness/operation-result'
import type { ToolRegistrationFailure } from '@omne-harness/tool-cordis-contract/cordis'
import {
  memoryToolRegistrationFixture,
  type ToolRegistrationFixture,
} from '@omne-harness/tool-cordis-contract/testing'

type Fixture = ToolRegistrationFixture<string>

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

export function generated(): Fixture {
  const base = memoryToolRegistrationFixture()
  return { ...base, service: { register: input => base.service.register(input) } }
}

export const preCheckedDouble = (): Fixture => preChecked(memoryToolRegistrationFixture())

export const tenantChecking = (): Fixture => memoryToolRegistrationFixture()

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
