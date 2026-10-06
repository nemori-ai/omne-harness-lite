// The original queries and locks borrow the caller's actual transaction. No policy or error conversion.
import {
  narrow,
  type AtomicStorage,
  type ReadTx,
  type StorageUnit,
  type WriteTx,
} from '@omne-harness-lite/storage'
import {
  type IdentityRead,
  type IdentityWrite,
  type IdentityDataUnit,
  type IdentityPersistence,
  FLAG_TRUE,
} from './identity-data.ts'
import { ACCOUNT_TABLE, LOGIN_STATE_TABLE, type AccountIdentityDb } from './schema.ts'

function readRecords(tx: ReadTx): IdentityRead {
  return {
    accountByIdentifier: identifier =>
      narrow<AccountIdentityDb>(tx)
        .selectFrom(ACCOUNT_TABLE)
        .selectAll()
        .where('login_identifier', '=', identifier)
        .executeTakeFirst(),
    accountById: account =>
      narrow<AccountIdentityDb>(tx)
        .selectFrom(ACCOUNT_TABLE)
        .selectAll()
        .where('account_id', '=', account)
        .executeTakeFirst(),
    loginById: login =>
      narrow<AccountIdentityDb>(tx)
        .selectFrom(LOGIN_STATE_TABLE)
        .selectAll()
        .where('login_state_id', '=', login)
        .executeTakeFirst(),
    loginsByAccount: account =>
      narrow<AccountIdentityDb>(tx)
        .selectFrom(LOGIN_STATE_TABLE)
        .selectAll()
        .where('account_id', '=', account)
        .orderBy('issued_at')
        .orderBy('login_state_id')
        .execute(),
  }
}
function writeRecords(tx: WriteTx): IdentityWrite {
  return {
    ...readRecords(tx),
    lockAccountByIdentifier: identifier =>
      tx.lockRow(ACCOUNT_TABLE, { login_identifier: identifier }),
    lockAccountById: account => tx.lockRow(ACCOUNT_TABLE, { account_id: account }),
    async insertAccount(row) {
      await narrow<AccountIdentityDb>(tx).insertInto(ACCOUNT_TABLE).values(row).execute()
    },
    async activateAccount(account) {
      await narrow<AccountIdentityDb>(tx)
        .updateTable(ACCOUNT_TABLE)
        .set({ activated: FLAG_TRUE })
        .where('account_id', '=', account)
        .execute()
    },
    async landAccountExpiry(account, observedAt) {
      await narrow<AccountIdentityDb>(tx)
        .updateTable(ACCOUNT_TABLE)
        .set({ expired_at: observedAt })
        .where('account_id', '=', account)
        .where('activated', '=', 0)
        .where('expired_at', 'is', null)
        .execute()
    },
    async deleteAccount(account) {
      await narrow<AccountIdentityDb>(tx)
        .deleteFrom(ACCOUNT_TABLE)
        .where('account_id', '=', account)
        .execute()
    },
    async insertLogin(row) {
      await narrow<AccountIdentityDb>(tx).insertInto(LOGIN_STATE_TABLE).values(row).execute()
    },
    async revokeLogin(login) {
      await narrow<AccountIdentityDb>(tx)
        .updateTable(LOGIN_STATE_TABLE)
        .set({ revoked: FLAG_TRUE })
        .where('login_state_id', '=', login)
        .execute()
    },
    async recordActivity(login, at) {
      await narrow<AccountIdentityDb>(tx)
        .updateTable(LOGIN_STATE_TABLE)
        .set({ last_activity_at: at })
        .where('login_state_id', '=', login)
        .execute()
    },
    async replaceCredential(account, material, revision) {
      await narrow<AccountIdentityDb>(tx)
        .updateTable(ACCOUNT_TABLE)
        .set({ credential_material: material, credential_revision: revision })
        .where('account_id', '=', account)
        .execute()
    },
  }
}

/** Only the assembly boundary binds public StorageUnit inputs. Binding itself performs no I/O or validation. */
export function createIdentityPersistence(storage: AtomicStorage): {
  readonly persistence: IdentityPersistence
  bindUnit(unit: StorageUnit): IdentityDataUnit
} {
  function bindUnit(unit: StorageUnit): IdentityDataUnit {
    return {
      run: work => {
        unit.assertStorage(storage)
        return unit.run(work)
      },
      query: work => unit.query(tx => work(readRecords(tx))),
      mutate: work => unit.mutate(tx => work(writeRecords(tx))),
      afterCommit: work => unit.afterCommit(work),
    }
  }
  return {
    bindUnit,
    persistence: {
      read: work => storage.read(tx => work(readRecords(tx))),
      write: work => storage.write(tx => work(writeRecords(tx))),
      atomic: work => storage.atomic(unit => work(bindUnit(unit))),
    },
  }
}
