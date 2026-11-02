// R4-5: the standing read does not tell an unknown tenant from a non-member. Three kinds of
// non-member get the same reading shape, with evidence computed from the input alone. A read that
// cannot reach the rows answers `unavailable`.
import { tenant, type TenantId } from '@omne-harness/legal-identity'
import { afterEach, expect, it } from 'vitest'
import { randomIdentifiers } from '@omne-harness/identity-sql'
import { withFailingRead } from './fixtures/faults.ts'
import { openProvider, type OpenedProvider } from './fixtures/provider.ts'

const open: OpenedProvider[] = []
afterEach(async () => {
  for (const entry of open.splice(0)) await entry.close()
})

async function registeredPair(opened: OpenedProvider) {
  const ada = await opened.provider.operations.registerAndActivate({
    loginIdentifier: 'ada',
    credential: 'credential-ada',
  })
  const bob = await opened.provider.operations.registerAndActivate({
    loginIdentifier: 'bob',
    credential: 'credential-bob',
  })
  if (ada.kind !== 'succeeded' || bob.kind !== 'succeeded') throw new Error('registration failed')
  return { ada, bob }
}

it('answers member for the personal tenant, with the default team super administrator role', async () => {
  const opened = await openProvider()
  open.push(opened)
  const { ada } = await registeredPair(opened)
  const reading = await opened.provider.standing.read({ tenant: ada.tenant })
  expect(reading.kind).toBe('member')
  if (reading.kind !== 'member') return
  expect(reading.role).toEqual({
    model: { model: 'default-team', revision: '1' },
    role: 'super-admin',
  })
  expect(reading.qualifications).toEqual(['organization-cost-ledger-read'])
  expect(reading.evidence.revision).toBe('1')
  expect(reading.evidence.record).toMatch(/^identity-sql\/membership\/[0-9a-f]{64}$/u)
})

it('gives an unknown tenant, a non-member of a known organization and an unmintable input the same not-member shape', async () => {
  const opened = await openProvider()
  open.push(opened)
  const { ada, bob } = await registeredPair(opened)
  const ids = randomIdentifiers()
  const unknown = tenant(ids.organization(), ids.account())
  const nonMember = tenant(bob.organization, ada.account)
  const unmintable = {
    name: 'TenantId',
    organization: bob.organization,
    account: ada.account,
  } as unknown as TenantId
  const readings = await Promise.all(
    [unknown, nonMember, unmintable].map(target =>
      opened.provider.standing.read({ tenant: target }),
    ),
  )
  for (const reading of readings) {
    expect(reading.kind).toBe('not-member')
    if (reading.kind !== 'not-member') return
    expect(Object.keys(reading).sort()).toEqual(['evidence', 'kind'])
    expect(Object.keys(reading.evidence).sort()).toEqual(['record', 'revision'])
    expect(reading.evidence.revision).toBe('0')
    expect(reading.evidence.record).toMatch(/^identity-sql\/membership\/[0-9a-f]{64}$/u)
  }
  // The evidence of a non-member comes from the input alone: reading it again gives the same value.
  const again = await opened.provider.standing.read({ tenant: nonMember })
  expect(again).toEqual(readings[1])
  expect((await opened.provider.standing.read({ tenant: ada.tenant })).kind).toBe('member')
})

it('answers unavailable when the membership rows cannot be read', async () => {
  const opened = await openProvider({
    wrap: storage => withFailingRead(storage, 'identity.standing'),
  })
  open.push(opened)
  const { ada } = await registeredPair(opened)
  const reading = await opened.provider.standing.read({ tenant: ada.tenant })
  expect(reading.kind).toBe('unavailable')
})
