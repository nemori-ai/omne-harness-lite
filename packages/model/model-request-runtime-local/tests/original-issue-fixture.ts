import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  generateHandoffKeyPair,
  loadSigningKey,
  parseTenantId,
  unwrap,
} from '@omne-harness-lite/identity-values'
import { parseOfferTtl, type Instant } from '@omne-harness-lite/offer-expiry'
import {
  composeMigrations,
  type AtomicStorage,
  type MigrationFragment,
} from '@omne-harness-lite/storage'
import { openStorage } from '@omne-harness-lite/storage-sql'
import {
  createOrganizationGovernance,
  organizationGovernanceMigrations,
  type OrganizationGovernanceDependencies,
} from '@omne-harness-lite/organization-governance-sql'
import {
  checkAppendInput,
  checkSourceToken,
  type AppendRequest,
  type LogAuthorityOperations,
} from '@omne-harness-lite/session-log'
import type { RecoveryAccess } from '@omne-harness-lite/execution-environments'
import type { SessionAccess } from '@omne-harness-lite/session-tenancy'
import { originalIssueMigrations } from '@omne-harness-lite/model-request-runtime-local'
import { openSqlSessionLog, sessionLogMigrations } from '@omne-harness-lite/session-log-sql'

export const tenant = unwrap(parseTenantId({ organization: 'team-a', account: 'account-a' }))
export const administrator = unwrap(parseTenantId({ organization: 'team-a', account: 'owner-a' }))
export const scope = Object.freeze({ tenant, session: source(0).session })
export function source(tail: number, session = 'session-a', journalGeneration = 'scope-only') {
  const checked = checkSourceToken({ tenant, session, journalGeneration, tail })
  if ('failure' in checked) throw new Error('bad test scope')
  return checked.ok
}
export function request(
  key = 'key-a',
  payload: unknown = { format: 'test/1', category: 'fact' },
): AppendRequest {
  const checked = checkAppendInput(
    scope.session,
    [{ tenant, dedupeKey: key, readKeys: ['all', key], payload }],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  if ('failure' in checked) throw new Error('bad test request')
  return checked.ok
}
const accounts: MigrationFragment = {
  name: 'log_test_accounts',
  migration: {
    async up(db) {
      await db.schema
        .createTable('account')
        .addColumn('account_id', 'text', c => c.notNull())
        .addPrimaryKeyConstraint('account_pkey', ['account_id'])
        .execute()
    },
  },
}
/** Real governance standing, with trusted ingress grants. This does not simulate user login. */
export async function boot(wrap: (storage: AtomicStorage) => AtomicStorage = storage => storage) {
  const dir = mkdtempSync(join(tmpdir(), 'omne-log-sql-'))
  const storage = await openStorage({
    dialect: 'sqlite',
    file: join(dir, 'db.sqlite'),
    synchronous: 'full',
    upgrade: false,
    migrations: composeMigrations([
      accounts,
      ...organizationGovernanceMigrations({
        ownerAccountReference: { table: 'account', column: 'account_id' },
        ownerAccountForeignKey: 'organization_owner_account_fk',
      }),
      ...sessionLogMigrations,
      ...originalIssueMigrations,
    ]),
  })
  await storage.write(async tx => {
    await tx.db
      .insertInto('account')
      .values([{ account_id: 'owner-a' }, { account_id: 'account-a' }])
      .execute()
    await tx.db
      .insertInto('organization')
      .values({
        organization_id: 'team-a',
        kind: 'team',
        parent: null,
        owner_account: 'owner-a',
        created_at: 0,
      })
      .execute()
    await tx.db
      .insertInto('membership')
      .values([
        {
          organization_id: 'team-a',
          account_id: 'owner-a',
          effective: 1,
          role: 'superAdministrator',
        },
        { organization_id: 'team-a', account_id: 'account-a', effective: 1, role: 'member' },
      ])
      .execute()
  })
  const unexpected = (): never => {
    throw new Error('unused login/account port called')
  }
  const unusedAccounts = new Proxy({}, { get: () => unexpected }) as ReturnType<
    OrganizationGovernanceDependencies['accounts']['participate']
  >
  const unusedLogins = new Proxy({}, { get: () => unexpected }) as ReturnType<
    OrganizationGovernanceDependencies['logins']['participate']
  >
  const governance = createOrganizationGovernance({
    storage,
    accounts: { participate: () => unusedAccounts },
    logins: { participate: () => unusedLogins },
    clock: { now: async () => 0 as Instant },
    config: {
      invitationTtlDefault: unwrap(parseOfferTtl(1)),
      affiliationRequestTtlDefault: unwrap(parseOfferTtl(1)),
      teamCreationKeyRetention: unwrap(parseOfferTtl(1)),
      purgeSigningKey: unwrap(loadSigningKey(generateHandoffKeyPair().privateKeyPem)),
    },
    logger: { error: unexpected, info() {} },
    notify() {},
  })
  const bound = wrap(storage)
  const access = Object.freeze(Object.create(null)) as SessionAccess
  const recovery = Object.freeze(Object.create(null)) as RecoveryAccess
  const authority: LogAuthorityOperations = {
    storage: bound,
    async authorize(unit, candidate, requested) {
      if (candidate !== access && candidate !== recovery) return { kind: 'denied' }
      if (
        requested.session !== scope.session ||
        requested.tenant.organization !== tenant.organization ||
        requested.tenant.account !== tenant.account
      )
        return { kind: 'denied' }
      const standing = await governance.memberships.participate(unit).standing(tenant)
      if ('failure' in standing) return { kind: 'unavailable' }
      return { kind: standing.standing === 'effective' ? 'authorized' : 'denied' }
    },
    async authorizeEnumeration(_unit, candidate) {
      return { kind: candidate === recovery ? 'authorized' : 'denied' }
    },
  }
  const log = openSqlSessionLog({ storage: bound, authority, operationLimit: 8 })
  return {
    storage,
    bound,
    log,
    access,
    recovery,
    governance,
    authority,
    async close() {
      await log.close()
      await governance.close()
      await storage.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
