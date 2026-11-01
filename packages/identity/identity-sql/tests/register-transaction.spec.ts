// R4-4: a registration writes its five rows in one commit, so a failure after the first rows
// leaves no account, no organization, no tenant and no membership. An unknown commit result is a
// rejected promise, not `not-loginable`. DP3-C8: the stricter input rules of this provider.
import { tenant, type AccountId, type OrganizationId } from '@omne-harness/legal-identity'
import { afterEach, describe, expect, it } from 'vitest'
import { randomIdentifiers, type IdentifierSource } from '@omne-harness/identity-sql'
import { withLostReplies } from './fixtures/faults.ts'
import { openProvider, type OpenedProvider } from './fixtures/provider.ts'

const open: OpenedProvider[] = []
afterEach(async () => {
  for (const entry of open.splice(0)) await entry.close()
})

async function provider(options: Parameters<typeof openProvider>[0] = {}) {
  const opened = await openProvider(options)
  open.push(opened)
  return opened
}

describe('registration is one transaction', () => {
  it('rolls back the account and the credential when the organization row cannot be written', async () => {
    const real = randomIdentifiers()
    let collideWith: OrganizationId | undefined
    const handed: { account?: AccountId } = {}
    const identifiers: IdentifierSource = {
      account: () => {
        const account = real.account()
        handed.account = account
        return account
      },
      organization: () => collideWith ?? real.organization(),
      login: () => real.login(),
    }
    const { provider: sql, storage } = await provider({ identifiers })
    const ada = await sql.operations.registerAndActivate({
      loginIdentifier: 'ada',
      credential: 'credential-ada',
    })
    if (ada.kind !== 'succeeded') throw new Error('ada did not register')
    // Bob's organization identity is Ada's: the third row of the transaction violates the key.
    collideWith = ada.organization
    const bob = await sql.operations.registerAndActivate({
      loginIdentifier: 'bob',
      credential: 'credential-bob',
    })
    expect(bob).toEqual({ kind: 'not-loginable' })
    expect(
      (await sql.operations.issueLogin({ loginIdentifier: 'bob', credential: 'credential-bob' }))
        .kind,
    ).toBe('uniform-auth-failure')
    if (handed.account === undefined) throw new Error('no account was handed out')
    const rejectedTenant = tenant(ada.organization, handed.account)
    expect((await sql.standing.read({ tenant: rejectedTenant })).kind).toBe('not-member')
    // The identifier is free: with ordinary identities the same registration succeeds.
    collideWith = undefined
    const again = await sql.operations.registerAndActivate({
      loginIdentifier: 'bob',
      credential: 'credential-bob',
    })
    expect(again.kind).toBe('succeeded')
    expect(
      (await sql.operations.issueLogin({ loginIdentifier: 'bob', credential: 'credential-bob' }))
        .kind,
    ).toBe('succeeded')
    void storage
  })

  it('rejects the promise when the commit and the recall query stay unknown', async () => {
    let lost: ReturnType<typeof withLostReplies> | undefined
    const { provider: sql } = await provider({
      wrap: storage => {
        lost = withLostReplies(storage, { commit: 'lost', query: 'unknown' })
        return lost
      },
    })
    await expect(
      sql.operations.registerAndActivate({ loginIdentifier: 'ada', credential: 'credential-ada' }),
    ).rejects.toThrow()
    expect(lost?.queries()).toBe(3)
  })

  it('answers succeeded when the recall query finds the committed receipt', async () => {
    const { provider: sql } = await provider({
      wrap: storage => withLostReplies(storage, { commit: 'lost', query: 'through' }),
    })
    const outcome = await sql.operations.registerAndActivate({
      loginIdentifier: 'ada',
      credential: 'credential-ada',
    })
    expect(outcome.kind).toBe('succeeded')
    expect(
      (await sql.operations.issueLogin({ loginIdentifier: 'ada', credential: 'credential-ada' }))
        .kind,
    ).toBe('succeeded')
  })
})

describe('the stricter input rules (DP3-C8)', () => {
  it('refuses a login identifier over 1024 UTF-8 bytes and a credential over 4096 bytes', async () => {
    const { provider: sql, scrypt } = await provider()
    const longIdentifier = 'é'.repeat(513)
    const longCredential = 'c'.repeat(4097)
    expect(
      await sql.operations.registerAndActivate({
        loginIdentifier: longIdentifier,
        credential: 'credential',
      }),
    ).toEqual({ kind: 'not-loginable' })
    expect(
      await sql.operations.registerAndActivate({
        loginIdentifier: 'ada',
        credential: longCredential,
      }),
    ).toEqual({ kind: 'not-loginable' })
    // The bounds are inclusive.
    expect(
      (
        await sql.operations.registerAndActivate({
          loginIdentifier: 'a'.repeat(1024),
          credential: 'c'.repeat(4096),
        })
      ).kind,
    ).toBe('succeeded')
    // An over-long credential cannot belong to any account, so issue answers without scrypt.
    await scrypt.module.close()
    expect(
      await sql.operations.issueLogin({ loginIdentifier: 'ada', credential: longCredential }),
    ).toEqual({ kind: 'uniform-auth-failure' })
  })
})
