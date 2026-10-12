import { afterEach, expect, it } from 'vitest'
import {
  bootCenter,
  bodyOf,
  envelopeOf,
  OG,
  registerAndLogin,
  type Center,
} from './support/composition.ts'

const centers: Center[] = []
afterEach(async () => {
  for (const center of centers.splice(0).reverse()) await center.dispose()
})
function result(reply: unknown): unknown {
  if (typeof reply !== 'object' || reply === null || !('result' in reply)) {
    throw new Error('expected a governance result')
  }
  return reply.result
}
function tenantResult(value: unknown): { organization: string; account: string } {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('organization' in value) ||
    !('account' in value) ||
    typeof value.organization !== 'string' ||
    typeof value.account !== 'string'
  ) {
    throw new Error('expected a tenant result')
  }
  return { organization: value.organization, account: value.account }
}

it('two authorized clients read the same center-owned name through real TLS', async () => {
  const c = await bootCenter()
  centers.push(c)
  await c.open()
  const owner = await registerAndLogin(c, 'names-owner@example.invalid')
  const colleague = await registerAndLogin(c, 'names-member@example.invalid')
  const call = async (operation: string, payload: Record<string, unknown>, presentation: string) =>
    bodyOf(await c.call(envelopeOf(operation, payload, presentation)))
  const ownerIdentity = tenantResult(result(await call(OG(36), {}, owner.presentation)))
  const colleagueIdentity = tenantResult(result(await call(OG(36), {}, colleague.presentation)))
  const team = result(
    await call(OG(21), { name: '共同研发组', creationKey: 'names-1' }, owner.presentation),
  )
  const tenant = { organization: team, account: ownerIdentity.account }
  await call(OG(37), { expectedTenant: ownerIdentity, targetTenant: tenant }, owner.presentation)
  const invitation = result(
    await call(
      OG(23),
      { invitedAccount: colleagueIdentity.account, expectedTenant: tenant },
      owner.presentation,
    ),
  )
  expect(await call(OG(25), { invitation }, colleague.presentation)).toHaveProperty('result')
  const expected = { result: { organization: team, organizationKind: 'team', name: '共同研发组' } }
  expect(await call(OG(22), { organization: team }, owner.presentation)).toEqual(expected)
  expect(await call(OG(22), { organization: team }, colleague.presentation)).toEqual(expected)
  expect(
    await call(OG(21), { name: '共同研发组', creationKey: 'names-1' }, owner.presentation),
  ).toEqual({ result: team })
  expect(
    await call(OG(21), { name: 'different name', creationKey: 'names-1' }, owner.presentation),
  ).toBe('invalid-input')
  expect(await call(OG(22), { organization: team }, colleague.presentation)).toEqual(expected)
  expect(await call(OG(21), {}, owner.presentation)).toBe('invalid-input')
  const legacy = envelopeOf(OG(21), {}, owner.presentation)
  legacy['protocolVersion'] = '2'
  expect(bodyOf(await c.call(legacy))).toBe('version-mismatch')
})
