import { afterEach, describe, expect, it } from 'vitest'
import { StorageDefect, StorageUnavailable, composeMigrations } from '@omne-harness-lite/storage'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { accountIdentityMigrations } from '../src/schema.ts'
import {
  type Harness,
  HOUR_MS,
  START,
  gate,
  loginOk,
  openHarness,
  registerActivated,
  rows,
  tempSqliteFile,
} from './support.ts'

const open: Harness[] = []
async function fixture() {
  const h = await openHarness({ label: 'bounded' })
  open.push(h)
  const account = await registerActivated(h, 'alice', 'original-password')
  const login = await loginOk(h, 'alice', 'original-password')
  return { h, account, login }
}
afterEach(async () => {
  for (const h of open.splice(0)) await h.dispose()
})

async function activity(h: Harness, caller: Parameters<Harness['logins']['verify']>[0]) {
  return h.storage.atomic(unit => h.logins.participate(unit).finalizeActivity(caller))
}

describe('AI v3 bounded login and credential revision', () => {
  it('owns DDL and legacy revocation atomically when the SQLite Migrator has no outer transaction', async () => {
    const file = tempSqliteFile('bounded-migration-interruption')
    const legacy = await openStorage({
      dialect: 'sqlite',
      file,
      migrations: composeMigrations(accountIdentityMigrations.slice(0, 1)),
      upgrade: false,
    })
    await legacy.write(tx =>
      tx.db
        .insertInto('login_state')
        .values({
          login_state_id: 'legacy-id',
          account_id: 'legacy-account',
          issued_at: START,
          revoked: 0,
        })
        .execute(),
    )
    await legacy.close()
    let ddlStatements = 0
    const interrupted = {
      ...accountIdentityMigrations[1]!,
      migration: {
        up: (db: Parameters<(typeof accountIdentityMigrations)[0]['migration']['up']>[0]) =>
          accountIdentityMigrations[1]!.migration.up(
            db.withPlugin({
              transformQuery(args) {
                if (args.node.kind === 'AlterTableNode') ddlStatements++
                if (args.node.kind === 'UpdateQueryNode')
                  throw new Error('interrupt-before-legacy-revocation')
                return args.node
              },
              async transformResult(args) {
                return args.result
              },
            }),
          ),
      },
    }
    await expect(
      openStorage({
        dialect: 'sqlite',
        file,
        migrations: composeMigrations([accountIdentityMigrations[0]!, interrupted]),
        upgrade: false,
      }),
    ).rejects.toThrow()
    expect(ddlStatements).toBe(3)
    const inspect = await openStorage({ dialect: 'sqlite', file, upgrade: false })
    try {
      const tables = await inspect.read(tx => tx.db.introspection.getTables())
      expect(
        tables
          .find(table => table.name === 'account')
          ?.columns.some(column => column.name === 'credential_revision'),
      ).toBe(false)
      expect(
        tables.find(table => table.name === 'login_state')?.columns.map(column => column.name),
      ).not.toContain('last_activity_at')
      expect(
        await inspect.read(tx => tx.db.selectFrom('login_state').selectAll().execute()),
      ).toEqual([
        { login_state_id: 'legacy-id', account_id: 'legacy-account', issued_at: START, revoked: 0 },
      ])
    } finally {
      await inspect.close()
    }
    const finished = await openStorage({
      dialect: 'sqlite',
      file,
      migrations: composeMigrations(accountIdentityMigrations),
      upgrade: false,
    })
    try {
      expect(
        await finished.read(tx => tx.db.selectFrom('login_state').selectAll().execute()),
      ).toEqual([
        {
          login_state_id: 'legacy-id',
          account_id: 'legacy-account',
          issued_at: START,
          revoked: 1,
          last_activity_at: START,
          credential_revision: 0,
        },
      ])
    } finally {
      await finished.close()
    }
  })

  it('repeating the bounded migration preserves current logins and their activity', async () => {
    const { h, account, login } = await fixture()
    h.clock.advance(100)
    await activity(h, login.loginStateId)
    const accounts = await rows(h, 'account'),
      logins = await rows(h, 'login_state')
    await h.storage.write(tx => accountIdentityMigrations[1]!.migration.up(tx.db))
    expect(await rows(h, 'account')).toEqual(accounts)
    expect(await rows(h, 'login_state')).toEqual(logins)
    expect(await h.logins.verify(login.loginStateId)).toEqual({ ok: account })
  })

  it('rejects a partially present bounded schema instead of applying an ambiguous migration', async () => {
    const { h } = await fixture()
    await h.storage.write(tx =>
      tx.db.schema.alterTable('login_state').dropColumn('last_activity_at').execute(),
    )
    const before = await rows(h, 'login_state')
    await expect(
      h.storage.write(tx => accountIdentityMigrations[1]!.migration.up(tx.db)),
    ).rejects.toBeInstanceOf(StorageDefect)
    expect(await rows(h, 'login_state')).toEqual(before)
  })

  it('idle equality rejects; verify/exchange/list do not extend activity', async () => {
    const { h, account, login } = await fixture()
    h.clock.advance(HOUR_MS - 1)
    expect(await h.logins.verify(login.loginStateId)).toEqual({ ok: account })
    expect(await h.logins.exchange(login.presentation)).toHaveProperty('ok')
    expect(await h.logins.listEffective(login.loginStateId)).toHaveProperty('ok')
    h.clock.advance(1)
    expect(await h.logins.verify(login.loginStateId)).toEqual({ failure: 'login-state-rejected' })
    expect((await rows(h, 'login_state'))[0]?.['last_activity_at']).toBe(START)
  })

  it('successful activity extends idle time but never the eight-hour absolute limit', async () => {
    const { h, login } = await fixture()
    for (let n = 0; n < 15; n++) {
      h.clock.advance(HOUR_MS / 2)
      expect(await activity(h, login.loginStateId)).toBe('ok')
    }
    const listed = await h.logins.listEffective(login.loginStateId)
    expect(listed).toEqual({
      ok: [
        {
          loginStateId: login.loginStateId,
          issuedAt: START,
          lastActivityAt: START + 7.5 * HOUR_MS,
          absoluteExpiresAt: START + 8 * HOUR_MS,
          idleExpiresAt: START + 8.5 * HOUR_MS,
        },
      ],
    })
    h.clock.advance(HOUR_MS / 2)
    expect(await h.logins.verify(login.loginStateId)).toEqual({ failure: 'login-state-rejected' })
    expect(await activity(h, login.loginStateId)).toBe('ok')
    expect((await rows(h, 'login_state'))[0]?.['last_activity_at']).toBe(START + 7.5 * HOUR_MS)
  })

  it('late completion can commit its business but does not revive the expired login', async () => {
    const { h, account, login } = await fixture()
    await h.storage.write(tx =>
      tx.db.schema.createTable('business').addColumn('id', 'integer').execute(),
    )
    await h.storage.atomic(async unit => {
      const scope = h.logins.participate(unit)
      expect(await scope.verify(login.loginStateId)).toEqual({ ok: account })
      await unit.mutate(tx => tx.db.insertInto('business').values({ id: 1 }).execute())
      h.clock.advance(HOUR_MS)
      expect(await scope.finalizeActivity(login.loginStateId)).toBe('ok')
    })
    expect(
      await h.storage.read(tx => tx.db.selectFrom('business').selectAll().execute()),
    ).toHaveLength(1)
    expect(await h.logins.verify(login.loginStateId)).toEqual({ failure: 'login-state-rejected' })
    expect((await rows(h, 'login_state'))[0]?.['last_activity_at']).toBe(START)
  })

  it('final clock failure rolls back business and queued notification even after self revocation', async () => {
    const { h, login } = await fixture()
    await expect(
      h.storage.atomic(async unit => {
        const scope = h.logins.participate(unit)
        expect(await scope.revoke(login.loginStateId, login.loginStateId)).toBe('ok')
        h.clock.setUnavailable(true)
        await scope.finalizeActivity(login.loginStateId)
      }),
    ).rejects.toBeInstanceOf(StorageUnavailable)
    h.clock.setUnavailable(false)
    expect(await h.logins.verify(login.loginStateId)).toHaveProperty('ok')
    expect(h.events.filter(e => e.name === 'login.revoked')).toEqual([])
  })

  it.each(['verify', 'exchange', 'listEffective'] as const)(
    '%s waits for staged activity before judging expiry',
    async method => {
      const { h, login } = await fixture()
      h.clock.advance(HOUR_MS - 100)
      const pause = gate()
      const writer = h.storage.atomic(async unit => {
        await h.logins.participate(unit).finalizeActivity(login.loginStateId)
        await pause.wait()
      })
      await pause.reached
      h.clock.advance(200)
      // Negative control: an unprotected reader really sees the old, expired snapshot.
      const stale = await rows(h, 'login_state')
      expect(Number(stale[0]?.['last_activity_at']) + HOUR_MS).toBeLessThan(h.clock.current)
      let settled = false
      const observation = (
        method === 'exchange'
          ? h.logins.exchange(login.presentation)
          : method === 'verify'
            ? h.logins.verify(login.loginStateId)
            : h.logins.listEffective(login.loginStateId)
      ).finally(() => {
        settled = true
      })
      await new Promise(resolve => setImmediate(resolve))
      expect(settled).toBe(false)
      pause.release()
      await writer
      expect(await observation).toHaveProperty('ok')
    },
  )

  it('change invalidates every old login, preserves the account, emits no fake revocation, and runs scrypt outside writes', async () => {
    const { h, account, login } = await fixture()
    const other = await loginOk(h, 'alice', 'original-password')
    expect(
      await h.logins.changeCredential(
        login.loginStateId,
        'original-password',
        'replacement-password',
      ),
    ).toBe('ok')
    for (const id of [login.loginStateId, other.loginStateId])
      expect(await h.logins.verify(id)).toEqual({ failure: 'login-state-rejected' })
    expect(await h.logins.issue('alice', 'original-password')).toEqual({
      failure: 'identifier-or-credential-rejected',
    })
    const fresh = await loginOk(h, 'alice', 'replacement-password')
    expect(await h.logins.verify(fresh.loginStateId)).toEqual({ ok: account })
    expect(h.probe.callsInsideWrite).toEqual([])
    expect(h.events.filter(e => e.name === 'login.revoked')).toEqual([])
  })

  it('an old issue snapshot cannot borrow the generation committed by a concurrent change', async () => {
    const { h, login } = await fixture()
    const pause = gate()
    h.probe.pauseVerify = pause.wait
    const issue = h.logins.issue('alice', 'original-password')
    await pause.reached
    try {
      expect(
        await h.logins.changeCredential(
          login.loginStateId,
          'original-password',
          'replacement-password',
        ),
      ).toBe('ok')
    } finally {
      pause.release()
    }
    expect(await issue).toEqual({ failure: 'identifier-or-credential-rejected' })
    expect(await rows(h, 'login_state')).toHaveLength(1)
  })

  it('stale preparation checks G before login validity; preparation is single-use', async () => {
    const { h, login } = await fixture()
    const prepared = await h.logins.prepareCredentialChange(
      login.loginStateId,
      'original-password',
      'second-password',
    )
    if (!('ok' in prepared)) throw new Error('preparation failed')
    expect(
      await h.logins.changeCredential(login.loginStateId, 'original-password', 'first-password'),
    ).toBe('ok')
    expect(
      await h.storage.atomic(unit =>
        h.logins.participate(unit).commitCredentialChange(prepared.ok),
      ),
    ).toEqual({ failure: 'current-credential-rejected' })
    await expect(
      h.storage.atomic(unit => h.logins.participate(unit).commitCredentialChange(prepared.ok)),
    ).rejects.toBeInstanceOf(StorageDefect)
  })

  it('revocation during preparation rejects when G has not changed; failed proof does not alter credentials', async () => {
    const { h, login } = await fixture()
    expect(
      await h.logins.changeCredential(login.loginStateId, 'wrong-password', 'replacement-password'),
    ).toEqual({ failure: 'current-credential-rejected' })
    const prepared = await h.logins.prepareCredentialChange(
      login.loginStateId,
      'original-password',
      'replacement-password',
    )
    if (!('ok' in prepared)) throw new Error('preparation failed')
    expect(await h.logins.revoke(login.loginStateId, login.loginStateId)).toBe('ok')
    expect(
      await h.storage.atomic(unit =>
        h.logins.participate(unit).commitCredentialChange(prepared.ok),
      ),
    ).toEqual({ failure: 'login-state-rejected' })
    expect(await h.logins.issue('alice', 'original-password')).toHaveProperty('ok')
  })

  it('rejects foreign preparation and closed participation; same-password change still invalidates old logins', async () => {
    const { h, login } = await fixture()
    const other = await fixture()
    const prepared = await h.logins.prepareCredentialChange(
      login.loginStateId,
      'original-password',
      'original-password',
    )
    if (!('ok' in prepared)) throw new Error('preparation failed')
    await expect(
      other.h.storage.atomic(unit =>
        other.h.logins.participate(unit).commitCredentialChange(prepared.ok),
      ),
    ).rejects.toBeInstanceOf(StorageDefect)
    const staleScope = await h.storage.atomic(async unit => h.logins.participate(unit))
    expect(() => staleScope.verify(login.loginStateId)).toThrow(StorageDefect)
    expect(
      await h.storage.atomic(unit =>
        h.logins.participate(unit).commitCredentialChange(prepared.ok),
      ),
    ).toBe('ok')
    expect(await h.logins.verify(login.loginStateId)).toEqual({ failure: 'login-state-rejected' })
    expect(await h.logins.issue('alice', 'original-password')).toHaveProperty('ok')
  })

  it('normal restart preserves times and revision rather than granting a fresh idle hour', async () => {
    const { h, login } = await fixture()
    h.clock.advance(1000)
    await activity(h, login.loginStateId)
    const before = await rows(h, 'login_state')
    await h.dispose()
    open.splice(open.indexOf(h), 1)
    const reopened = await openHarness({ file: h.file, keys: h.keys })
    open.push(reopened)
    reopened.clock.advance(HOUR_MS + 1000)
    expect(await rows(reopened, 'login_state')).toEqual(before)
    expect(await reopened.logins.verify(login.loginStateId)).toEqual({
      failure: 'login-state-rejected',
    })
  })

  it('first bounded migration revokes legacy logins and preserves old issuance/account material', async () => {
    const file = tempSqliteFile('legacy-migration')
    const legacy = await openStorage({
      dialect: 'sqlite',
      file,
      synchronous: 'full',
      migrations: composeMigrations(accountIdentityMigrations.slice(0, 1)),
      upgrade: false,
    })
    await legacy.write(async tx => {
      await tx.db
        .insertInto('account')
        .values({
          account_id: 'account-old',
          login_identifier: 'legacy',
          credential_material: 'synthetic-material',
          activated: 1,
          produced_at: START,
          retention_deadline: START + HOUR_MS,
          expired_at: null,
        })
        .execute()
      await tx.db
        .insertInto('login_state')
        .values({
          login_state_id: 'login-old',
          account_id: 'account-old',
          issued_at: START,
          revoked: 0,
        })
        .execute()
    })
    await legacy.close()
    for (let n = 0; n < 2; n++) {
      const current = await openStorage({
        dialect: 'sqlite',
        file,
        synchronous: 'full',
        migrations: composeMigrations(accountIdentityMigrations),
        upgrade: false,
      })
      try {
        const state = await current.read(tx =>
          tx.db.selectFrom('login_state').selectAll().executeTakeFirstOrThrow(),
        )
        expect(state).toMatchObject({
          revoked: 1,
          issued_at: START,
          last_activity_at: START,
          credential_revision: 0,
        })
        const account = await current.read(tx =>
          tx.db.selectFrom('account').selectAll().executeTakeFirstOrThrow(),
        )
        expect(account).toMatchObject({
          account_id: 'account-old',
          credential_material: 'synthetic-material',
          credential_revision: 0,
        })
      } finally {
        await current.close()
      }
    }
  })
})
