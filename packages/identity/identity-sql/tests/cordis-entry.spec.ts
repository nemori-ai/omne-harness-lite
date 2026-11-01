// The `./cordis` plugin on a real Context 4.0.4: it injects `storage` only, registers the identity
// combination, provides `identityOperations` and `tenantStanding` as subclasses of the identity
// service definitions, fails the fiber on a bad configuration, and stops the provider on disposal.
// The end-to-end case runs the deployed SCRYPT_PROFILE, so it is slow.
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { StorageService } from '@omne-harness/sql-contract/cordis'
import {
  IdentityOperationsService,
  TenantStandingSourceService,
  identityOperationsKey,
  tenantStandingKey,
} from '@omne-harness/identity/cordis'
import { IDENTITY_SQL_DEFAULT_CONFIG } from '@omne-harness/identity-sql'
import { IdentitySqlPlugin } from '@omne-harness/identity-sql/cordis'
import { openSqliteStorage, type OpenedStorage } from './fixtures/storage.ts'

const FAILED = 3

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function hostContext(): Promise<{ ctx: Context; storage: OpenedStorage }> {
  const storage = await openSqliteStorage()
  cleanups.push(() => storage.close({ remove: true }))
  class TestStorage extends StorageService {
    readonly registerCombination: SqlStorage['registerCombination'] = input =>
      storage.storage.registerCombination(input)
    readonly commit: SqlStorage['commit'] = (input, options) =>
      storage.storage.commit(input, options)
    readonly query: SqlStorage['query'] = identity => storage.storage.query(identity)
    readonly read: SqlStorage['read'] = (input, options) => storage.storage.read(input, options)
  }
  const ctx = new Context()
  await ctx.plugin(TestStorage)
  return { ctx, storage }
}

describe('IdentitySqlPlugin', () => {
  it('fails the fiber on an illegal lifetime', async () => {
    const { ctx } = await hostContext()
    const fiber = ctx.plugin(IdentitySqlPlugin, { maxLifetime: 'PT0S', idlePeriod: 'PT1S' })
    await expect(fiber).rejects.toThrow()
    expect(fiber.state as number).toBe(FAILED)
    expect(ctx.get(identityOperationsKey)).toBeUndefined()
  })

  it(
    'provides both keys, registers, issues and recognizes with the system clock, then stops on disposal',
    { tags: ['slow'], timeout: 120_000 },
    async () => {
      const { ctx, storage } = await hostContext()
      const fiber = await ctx.plugin(IdentitySqlPlugin, IDENTITY_SQL_DEFAULT_CONFIG)
      const operations = ctx.get(identityOperationsKey)
      const standing = ctx.get(tenantStandingKey)
      expect(operations).toBeInstanceOf(IdentityOperationsService)
      expect(standing).toBeInstanceOf(TenantStandingSourceService)
      if (operations === undefined || standing === undefined) throw new Error('keys missing')
      // The combination is registered: a second registration is the idempotent recall.
      const { identitySqlRegistration } = await import('@omne-harness/identity-sql')
      expect((await storage.storage.registerCombination(identitySqlRegistration())).kind).toBe(
        'registered',
      )
      const registered = await operations.registerAndActivate({
        loginIdentifier: 'plugin-ada',
        credential: 'credential-ada',
      })
      expect(registered.kind).toBe('succeeded')
      if (registered.kind !== 'succeeded') return
      const issued = await operations.issueLogin({
        loginIdentifier: 'plugin-ada',
        credential: 'credential-ada',
      })
      expect(issued.kind).toBe('succeeded')
      if (issued.kind !== 'succeeded') return
      const recognized = await operations.recognizeLogin({ loginProof: issued.loginProof })
      expect(recognized.kind).toBe('recognized')
      expect((await standing.read({ tenant: registered.tenant })).kind).toBe('member')

      await fiber.dispose()
      expect(ctx.get(identityOperationsKey)).toBeUndefined()
      expect(ctx.get(tenantStandingKey)).toBeUndefined()
      // An old reference answers as a stopped provider: no verdict about the login.
      const late = await operations.recognizeLogin({ loginProof: issued.loginProof })
      expect(late.kind).toBe('basis-unavailable')
      expect((await standing.read({ tenant: registered.tenant })).kind).toBe('unavailable')
      expect(
        await operations.registerAndActivate({ loginIdentifier: 'bob', credential: 'c' }),
      ).toEqual({ kind: 'not-loginable' })
    },
  )
})
