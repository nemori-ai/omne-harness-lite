import type { LoginIdentity } from '@omne-harness/access-cordis-contract'
import {
  accountCodec,
  organizationCodec,
  tenant,
  tenantCodec,
  type TenantId,
} from '@omne-harness/legal-identity'
import { createHitlContribution } from '../../src/contribution.ts'
import type { HitlEntryPrincipals, HitlFaces, LoginTenants } from '../../src/ports.ts'
import {
  HITL_LOCATION,
  createEntryPrincipalsDouble,
  createHitlDouble,
  type EntryPrincipalsDouble,
  type HitlDouble,
} from './hitl-double.ts'

const BODY = 'abcdefghjkmnpqrstvwxyz2345'
export const SESSION_REF = 'c'.repeat(64)

export type FixtureLogin = Readonly<{
  account: string
  tenant: TenantId
  tenantText: string
  proof: string
}>

export function fixtureLogin(letter: string, proof = `proof-${letter}`): FixtureLogin {
  const suffix = `${letter}${BODY.slice(1)}`
  const account = accountCodec.parse(`acc_${suffix}`)
  const organization = organizationCodec.parse(`org_${suffix}`)
  if (!account.ok || !organization.ok) throw new Error('fixture identity did not parse')
  const minted = tenant(organization.value, account.value)
  const text = tenantCodec.encode(minted)
  if (!text.ok) throw new Error('fixture tenant did not encode')
  return { account: account.value.text, tenant: minted, tenantText: text.value, proof }
}

export const loginIdentity = (login: FixtureLogin): LoginIdentity =>
  login as unknown as LoginIdentity

export type World = Readonly<{
  hitl: HitlDouble
  holder: EntryPrincipalsDouble
  logins: Readonly<{ calls: string[]; down: { value: 'throw' | 'basis-unavailable' | undefined } }>
  faces: { current: HitlFaces | undefined }
  contribution: ReturnType<typeof createHitlContribution>
}>

export function createWorld(
  options: Readonly<{ holder?: HitlEntryPrincipals | undefined; faces?: boolean }> = {},
): World {
  const hitl = createHitlDouble()
  const holder = createEntryPrincipalsDouble()
  const calls: string[] = []
  const down: { value: 'throw' | 'basis-unavailable' | undefined } = { value: undefined }
  const faces: { current: HitlFaces | undefined } = {
    current: options.faces === false ? undefined : hitl.faces,
  }
  const logins: LoginTenants = {
    async admits(login, tenantText) {
      calls.push(tenantText)
      if (down.value === 'throw') throw new Error('identity is down')
      if (down.value !== undefined) return down.value
      const caller = login as unknown as FixtureLogin
      const target = tenantCodec.parse(tenantText)
      return target.ok && target.value.account.text === caller.account ? 'admitted' : 'denied'
    },
  }
  const contribution = createHitlContribution({
    faces: () => faces.current,
    entryPrincipals: options.holder ?? holder.holder,
    logins,
    settings: { locationRef: HITL_LOCATION },
  })
  return { hitl, holder, logins: { calls, down }, faces, contribution }
}
