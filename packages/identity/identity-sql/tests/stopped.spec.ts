import { afterEach, expect, it } from 'vitest'
import { gatedCompute } from './fixtures/scrypt.ts'
import { openProvider, type OpenedProvider } from './fixtures/provider.ts'

const open: OpenedProvider[] = []
afterEach(async () => {
  for (const entry of open.splice(0)) await entry.close()
})

it('answers not-loginable, basis-unavailable and unavailable after stop', async () => {
  const opened = await openProvider()
  open.push(opened)
  const ada = await opened.provider.operations.registerAndActivate({
    loginIdentifier: 'ada',
    credential: 'credential-ada',
  })
  if (ada.kind !== 'succeeded') throw new Error('registration failed')
  const issued = await opened.provider.operations.issueLogin({
    loginIdentifier: 'ada',
    credential: 'credential-ada',
  })
  if (issued.kind !== 'succeeded') throw new Error('issue failed')

  opened.provider.stop()

  expect(
    await opened.provider.operations.registerAndActivate({
      loginIdentifier: 'bob',
      credential: 'credential-bob',
    }),
  ).toEqual({ kind: 'not-loginable' })
  const issue = await opened.provider.operations.issueLogin({
    loginIdentifier: 'ada',
    credential: 'credential-ada',
  })
  expect(issue.kind).toBe('basis-unavailable')
  expect(issue.kind === 'basis-unavailable' && issue.diagnostic).toBe('provider-stopped')
  const recognize = await opened.provider.operations.recognizeLogin({
    loginProof: issued.loginProof,
  })
  expect(recognize.kind).toBe('basis-unavailable')
  expect(recognize.kind === 'basis-unavailable' && recognize.diagnostic).toBe('provider-stopped')
  expect(await opened.provider.operations.recognizeLogin({ loginProof: '' })).toEqual({
    kind: 'invalid',
  })
  expect((await opened.provider.standing.read({ tenant: ada.tenant })).kind).toBe('unavailable')
  const { governance } = opened.provider
  for (const outcome of [
    await governance.createOrganization({
      login: issued.login,
      actingTenant: ada.tenant,
      createCallId: 'call-1',
      name: 'Team',
      governanceModelId: 'default-team',
    }),
    await governance.revokeLogin({ login: issued.login, target: issued.login }),
    await governance.queryOwnMemberships({ login: issued.login }),
    await governance.queryCurrentTenant({ login: issued.login }),
    await governance.reportBusinessAccess({ login: issued.login }),
  ])
    expect(outcome).toEqual({ kind: 'basis-unavailable', diagnostic: 'provider-stopped' })
  opened.provider.stop()
  expect((await opened.provider.standing.read({ tenant: ada.tenant })).kind).toBe('unavailable')
})

it('lets a call that was accepted before stop run to its end', async () => {
  const gate = gatedCompute()
  const opened = await openProvider({ compute: gate.compute })
  open.push(opened)
  const ada = await opened.provider.operations.registerAndActivate({
    loginIdentifier: 'ada',
    credential: 'credential-ada',
  })
  if (ada.kind !== 'succeeded') throw new Error('registration failed')
  gate.hold()
  const inFlight = opened.provider.operations.issueLogin({
    loginIdentifier: 'ada',
    credential: 'credential-ada',
  })
  await new Promise(resolve => setTimeout(resolve, 50))
  opened.provider.stop()
  const late = await opened.provider.operations.issueLogin({
    loginIdentifier: 'ada',
    credential: 'credential-ada',
  })
  expect(late.kind).toBe('basis-unavailable')
  gate.release()
  expect((await inFlight).kind).toBe('succeeded')
})
