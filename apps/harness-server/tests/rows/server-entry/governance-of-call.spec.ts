// `governanceOfCall`: the row reads `identityGovernance` from the tree on every call. Absent, every
// one of the nineteen methods answers `basis-unavailable` and none throws; present, each method is
// handed to the provider with the same input; a provider that comes later is seen by the next call.
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { IdentityGovernance } from '@omne-harness/identity'
import { identityGovernanceKey } from '@omne-harness/identity/cordis'
import { governanceOfCall } from '../../../src/rows/server-entry/identity.ts'

const METHODS = [
  'createOrganization',
  'queryCreateOrganization',
  'issueMemberInvitation',
  'acceptMemberInvitation',
  'rejectMemberInvitation',
  'withdrawMemberInvitation',
  'queryInvitation',
  'queryReceivedInvitations',
  'queryIssuedInvitations',
  'queryOwnMemberships',
  'queryOrganizationMembers',
  'leaveOrganization',
  'removeMember',
  'changeMemberRole',
  'switchCurrentTenant',
  'queryCurrentTenant',
  'revokeLogin',
  'queryOwnValidLogins',
  'reportBusinessAccess',
] as const satisfies readonly (keyof IdentityGovernance)[]

type Method = (typeof METHODS)[number]
type Untyped = Record<Method, (input: unknown) => Promise<unknown>>

/** A provider whose every method answers with its own name and the input it got. */
function echoProvider(): IdentityGovernance {
  return Object.fromEntries(
    METHODS.map(method => [method, (input: unknown) => Promise.resolve({ method, input })]),
  ) as unknown as IdentityGovernance
}

describe('governanceOfCall', () => {
  it('has the nineteen methods of the governance port', () => {
    expect(Object.keys(governanceOfCall(new Context())).sort()).toEqual([...METHODS].sort())
  })

  it('answers basis-unavailable from every method while the provider is absent, and throws for none', async () => {
    const port = governanceOfCall(new Context()) as unknown as Untyped
    for (const method of METHODS)
      await expect(port[method]({ login: 'x' }), method).resolves.toEqual({
        kind: 'basis-unavailable',
        diagnostic: 'identity governance is not provided by the tree',
      })
  })

  it('hands each call to the provider with its input, and sees a provider that came later', async () => {
    const ctx = new Context()
    const port = governanceOfCall(ctx) as unknown as Untyped
    await expect(port.revokeLogin({ login: 'a' })).resolves.toMatchObject({
      kind: 'basis-unavailable',
    })
    ctx.provide(identityGovernanceKey, echoProvider())
    for (const method of METHODS) {
      const input = { login: `login-of-${method}` }
      await expect(port[method](input), method).resolves.toEqual({ method, input })
    }
  })
})
