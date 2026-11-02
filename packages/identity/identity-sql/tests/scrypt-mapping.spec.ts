// DP3-C6 (U-10): a scrypt refusal before the computation is `basis-unavailable`, for an existing
// account and for an unknown one alike, so the answer cannot enumerate accounts. The decoy
// comparison gives an unknown account the same scrypt path as a known one.
import { afterEach, expect, it } from 'vitest'
import { gatedCompute, TEST_SCRYPT_PROFILE } from './fixtures/scrypt.ts'
import { openProvider, type OpenedProvider } from './fixtures/provider.ts'

const open: OpenedProvider[] = []
afterEach(async () => {
  for (const entry of open.splice(0)) await entry.close()
})

it('answers basis-unavailable to a known and to an unknown account while the scrypt queue is full', async () => {
  const gate = gatedCompute()
  const opened = await openProvider({ compute: gate.compute })
  open.push(opened)
  const ada = await opened.provider.operations.registerAndActivate({
    loginIdentifier: 'ada',
    credential: 'credential-ada',
  })
  if (ada.kind !== 'succeeded') throw new Error('registration failed')
  // Fill the module: one running computation and a full queue, all held at the gate.
  gate.hold()
  const occupants = []
  for (let index = 0; index <= TEST_SCRYPT_PROFILE.queue; index += 1) {
    const admitted = opened.scrypt.module.derive(`occupant-${index}`, () => ({ ok: true }))
    if (!('done' in admitted)) throw new Error(`occupant refused: ${admitted.code}`)
    occupants.push(admitted.done)
  }
  const known = await opened.provider.operations.issueLogin({
    loginIdentifier: 'ada',
    credential: 'credential-ada',
  })
  const unknown = await opened.provider.operations.issueLogin({
    loginIdentifier: 'nobody',
    credential: 'credential-ada',
  })
  expect(known.kind).toBe('basis-unavailable')
  expect(unknown.kind).toBe('basis-unavailable')
  expect(known.kind === 'basis-unavailable' && known.diagnostic).toBe(
    'credential-check-unavailable:queue_full',
  )
  expect(unknown).toEqual(known)
  const register = await opened.provider.operations.registerAndActivate({
    loginIdentifier: 'bob',
    credential: 'credential-bob',
  })
  expect(register).toEqual({ kind: 'not-loginable' })
  gate.release()
  await Promise.all(occupants)
  expect(
    (
      await opened.provider.operations.issueLogin({
        loginIdentifier: 'ada',
        credential: 'credential-ada',
      })
    ).kind,
  ).toBe('succeeded')
  expect(
    await opened.provider.operations.issueLogin({
      loginIdentifier: 'nobody',
      credential: 'credential-ada',
    }),
  ).toEqual({ kind: 'uniform-auth-failure' })
})

it('compares against the decoy material for an unknown account', async () => {
  const gate = gatedCompute()
  const opened = await openProvider({ compute: gate.compute })
  open.push(opened)
  const before = gate.calls()
  expect(
    await opened.provider.operations.issueLogin({
      loginIdentifier: 'nobody',
      credential: 'credential-x',
    }),
  ).toEqual({ kind: 'uniform-auth-failure' })
  expect(gate.calls()).toBe(before + 1)
})

it('answers basis-unavailable, not a verdict, when the scrypt module is closed', async () => {
  const opened = await openProvider()
  open.push(opened)
  const ada = await opened.provider.operations.registerAndActivate({
    loginIdentifier: 'ada',
    credential: 'credential-ada',
  })
  if (ada.kind !== 'succeeded') throw new Error('registration failed')
  await opened.scrypt.module.close()
  const issue = await opened.provider.operations.issueLogin({
    loginIdentifier: 'ada',
    credential: 'credential-ada',
  })
  expect(issue.kind).toBe('basis-unavailable')
  expect(issue.kind === 'basis-unavailable' && issue.diagnostic).toBe(
    'credential-check-unavailable:stopped',
  )
  expect(
    await opened.provider.operations.registerAndActivate({
      loginIdentifier: 'bob',
      credential: 'credential-bob',
    }),
  ).toEqual({ kind: 'not-loginable' })
})
