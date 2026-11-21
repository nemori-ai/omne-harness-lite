import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import {
  accountCodec,
  organizationCodec,
  tenant,
  tenantCodec,
  type TenantId,
} from '@omne-harness/legal-identity'
import type { Media } from '@omne-harness/media-contract'
import { createMediaContribution } from '../../src/contribution.ts'
import type { TargetTenantPrincipals } from '../../src/ports.ts'

const BODY = 'abcdefghjkmnpqrstvwxyz2345'

export type FixtureLogin = Readonly<{ account: string; tenant: TenantId; tenantText: string }>

export function fixtureLogin(letter: string): FixtureLogin {
  const suffix = `${letter}${BODY.slice(1)}`
  const account = accountCodec.parse(`acc_${suffix}`)
  const organization = organizationCodec.parse(`org_${suffix}`)
  if (!account.ok || !organization.ok) throw new Error('fixture identity did not parse')
  const minted = tenant(organization.value, account.value)
  const text = tenantCodec.encode(minted)
  if (!text.ok) throw new Error('fixture tenant did not encode')
  return { account: account.value.text, tenant: minted, tenantText: text.value }
}

export const loginIdentity = (login: FixtureLogin): LoginIdentity =>
  login as unknown as LoginIdentity

export type DomainCall = Readonly<{ method: string; input: unknown }>
type Answer = unknown | (() => never)

/** A stand-in domain: every method of the media face answers what the test set for it, and is recorded. */
export function createWorld() {
  let refusal: 'denied' | 'basis-unavailable' | 'throw' | undefined
  let present = true
  const answers = new Map<string, Answer>()
  const calls: DomainCall[] = []
  const asked: { account: string; tenant: string }[] = []
  const method = (name: string) => async (input: unknown) => {
    calls.push({ method: name, input })
    const answer = answers.get(name)
    if (typeof answer === 'function') return (answer as () => never)()
    if (answer === undefined) throw new Error(`no answer was set for ${name}`)
    return answer
  }
  const face = {
    uploads: {
      begin: method('begin'),
      append: method('append'),
      commit: method('commit'),
      status: method('status'),
    },
    custody: { describe: method('describe') },
    reads: { page: method('page') },
  } as unknown as Media
  const principals: TargetTenantPrincipals = {
    async actingFor(login, target) {
      const account = (login as unknown as FixtureLogin).account
      asked.push({ account, tenant: target })
      if (refusal === 'throw') throw new Error('the identity face broke')
      if (refusal !== undefined) return { refused: refusal }
      return { ok: { account, tenant: target } as unknown as Principal }
    },
  }
  return {
    refuseTargets(next: typeof refusal): void {
      refusal = next
    },
    removeFace(): void {
      present = false
    },
    answer(name: string, next: Answer): void {
      answers.set(name, next)
    },
    calls,
    asked,
    contribution: createMediaContribution({
      principals,
      media: () => (present ? face : undefined),
    }),
  }
}
export type World = ReturnType<typeof createWorld>
