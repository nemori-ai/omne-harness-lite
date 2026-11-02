// DP3-C16: after `stop()`, a new call gets an answer that says nothing about credentials, logins
// or memberships. A call accepted before `stop()` runs to its end.
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
  // A malformed proof is still judged by its text alone (ID-17 recognition step 1).
  expect(await opened.provider.operations.recognizeLogin({ loginProof: '' })).toEqual({
    kind: 'invalid',
  })
  expect((await opened.provider.standing.read({ tenant: ada.tenant })).kind).toBe('unavailable')
  // Stopping twice changes nothing.
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
  // The credential comparison of this issue waits at the gate while the provider stops.
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
