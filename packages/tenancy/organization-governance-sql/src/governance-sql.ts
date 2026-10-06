import { narrow, type ReadTx, type WriteTx, type StorageUnit } from '@omne-harness-lite/storage'
import type { Kysely } from 'kysely'
import type { Deps } from './assembly-deps.ts'
import type {
  OrganizationTable,
  MembershipTable,
  InvitationTable,
  AffiliationRequestTable,
  CurrentTenantSelectionTable,
  TeamCreationKeyTable,
  OrgRead,
  OrgWrite,
  OrgDataUnit,
  OrgPersistence,
} from './governance-data.ts'
interface OgDatabase {
  organization: OrganizationTable
  membership: MembershipTable
  invitation: InvitationTable
  affiliation_request: AffiliationRequestTable
  current_tenant_selection: CurrentTenantSelectionTable
  team_creation_key: TeamCreationKeyTable
}
function db(tx: ReadTx): Kysely<OgDatabase> {
  return narrow<OgDatabase>(tx)
}
function readData(tx: ReadTx): OrgRead {
  return {
    organization: id =>
      db(tx)
        .selectFrom('organization')
        .select(['organization_id', 'kind', 'parent', 'owner_account'])
        .where('organization_id', '=', id)
        .executeTakeFirst(),
    ownedOrganization: account =>
      db(tx)
        .selectFrom('organization')
        .select(['organization_id', 'kind', 'parent', 'owner_account'])
        .where('owner_account', '=', account)
        .executeTakeFirst(),
    membership: tenant =>
      db(tx)
        .selectFrom('membership')
        .select(['organization_id', 'account_id', 'effective', 'role'])
        .where('organization_id', '=', tenant.organization)
        .where('account_id', '=', tenant.account)
        .executeTakeFirst(),
    superAdministratorCount: async org =>
      (
        await db(tx)
          .selectFrom('membership')
          .select(eb => eb.fn.countAll<number | string | bigint>().as('n'))
          .where('organization_id', '=', org)
          .where('effective', '=', 1)
          .where('role', '=', 'superAdministrator')
          .executeTakeFirstOrThrow()
      ).n,
    organizationIdsPresent: async ids =>
      (
        await db(tx)
          .selectFrom('organization')
          .select('organization_id')
          .where('organization_id', 'in', ids)
          .execute()
      ).map(r => r.organization_id),
    invitation: id =>
      db(tx)
        .selectFrom('invitation')
        .selectAll()
        .where('invitation_id', '=', id)
        .executeTakeFirst(),
    affiliation: id =>
      db(tx)
        .selectFrom('affiliation_request')
        .selectAll()
        .where('affiliation_request_id', '=', id)
        .executeTakeFirst(),
    invitationsForAccount: account =>
      db(tx)
        .selectFrom('invitation')
        .selectAll()
        .where('invited_account', '=', account)
        .orderBy('issued_at')
        .orderBy('invitation_id')
        .execute(),
    invitationsForIssuer: org =>
      db(tx)
        .selectFrom('invitation')
        .selectAll()
        .where('issuer_organization', '=', org)
        .orderBy('issued_at')
        .orderBy('invitation_id')
        .execute(),
    affiliationsFrom: org =>
      db(tx)
        .selectFrom('affiliation_request')
        .selectAll()
        .where('initiator', '=', org)
        .orderBy('issued_at')
        .orderBy('affiliation_request_id')
        .execute(),
    affiliationsTo: org =>
      db(tx)
        .selectFrom('affiliation_request')
        .selectAll()
        .where('recipient', '=', org)
        .orderBy('issued_at')
        .orderBy('affiliation_request_id')
        .execute(),
    creationKey: (creator, key) =>
      db(tx)
        .selectFrom('team_creation_key')
        .select(['organization_id', 'registered_at'])
        .where('creator_account', '=', creator)
        .where('creation_key', '=', key)
        .executeTakeFirst(),
    currentSelection: login =>
      db(tx)
        .selectFrom('current_tenant_selection')
        .select(['organization_id', 'account_id'])
        .where('login_state_id', '=', login)
        .executeTakeFirst(),
    effectiveMemberships: account =>
      db(tx)
        .selectFrom('membership')
        .select(['organization_id', 'account_id', 'effective', 'role'])
        .where('account_id', '=', account)
        .where('effective', '=', 1)
        .orderBy('organization_id')
        .execute(),
    organizationMemberships: async (org, includeIneffective) => {
      let query = db(tx)
        .selectFrom('membership')
        .select(['organization_id', 'account_id', 'effective', 'role'])
        .where('organization_id', '=', org)
      if (!includeIneffective) query = query.where('effective', '=', 1)
      return query.orderBy('account_id').execute()
    },
    selectionBatch: async (after, batch) => {
      let query = db(tx)
        .selectFrom('current_tenant_selection')
        .select('login_state_id')
        .orderBy('login_state_id')
        .limit(batch)
      if (after !== undefined) query = query.where('login_state_id', '>', after)
      return (await query.execute()).map(row => row.login_state_id)
    },
  }
}
function writeData(tx: WriteTx): OrgWrite {
  return {
    ...readData(tx),
    lockOrganization: org => tx.lockRow('organization', { organization_id: org }),
    lockInvitation: id => tx.lockRow('invitation', { invitation_id: id }),
    lockAffiliation: id => tx.lockRow('affiliation_request', { affiliation_request_id: id }),
    lockCreationKey: (creator, key) =>
      tx.lockRow('team_creation_key', { creator_account: creator, creation_key: key }),
    lockAffiliationGraph: () => tx.lockSentinel('organization-governance/affiliation'),
    insertOrganization: async row => {
      await db(tx).insertInto('organization').values(row).execute()
    },
    insertMembership: async row => {
      await db(tx).insertInto('membership').values(row).execute()
    },
    insertInvitation: async row => {
      await db(tx).insertInto('invitation').values(row).execute()
    },
    insertAffiliation: async row => {
      await db(tx).insertInto('affiliation_request').values(row).execute()
    },
    insertCreationKey: async row => {
      await db(tx).insertInto('team_creation_key').values(row).execute()
    },
    replaceCreationKey: async (creator, key, organization, registeredAt) => {
      await db(tx)
        .updateTable('team_creation_key')
        .set({ organization_id: organization, registered_at: registeredAt })
        .where('creator_account', '=', creator)
        .where('creation_key', '=', key)
        .execute()
    },
    setParent: async (child, parent) => {
      await db(tx)
        .updateTable('organization')
        .set({ parent })
        .where('organization_id', '=', child)
        .execute()
    },
    setMembershipRole: async (tenant, role) => {
      await db(tx)
        .updateTable('membership')
        .set({ role })
        .where('organization_id', '=', tenant.organization)
        .where('account_id', '=', tenant.account)
        .execute()
    },
    deactivateMembership: async tenant => {
      await db(tx)
        .updateTable('membership')
        .set({ effective: 0 })
        .where('organization_id', '=', tenant.organization)
        .where('account_id', '=', tenant.account)
        .execute()
    },
    establishMembership: async (tenant, role) => {
      await db(tx)
        .insertInto('membership')
        .values({
          organization_id: tenant.organization,
          account_id: tenant.account,
          effective: 1,
          role,
        })
        .onConflict(oc =>
          oc.columns(['organization_id', 'account_id']).doUpdateSet({ effective: 1, role }),
        )
        .execute()
    },
    settleInvitation: async (id, settled) => {
      await db(tx)
        .updateTable('invitation')
        .set({ settled })
        .where('invitation_id', '=', id)
        .execute()
    },
    settleAffiliation: async (id, settled) => {
      await db(tx)
        .updateTable('affiliation_request')
        .set({ settled })
        .where('affiliation_request_id', '=', id)
        .execute()
    },
    setCurrentSelection: async (login, tenant) => {
      await db(tx)
        .insertInto('current_tenant_selection')
        .values({
          login_state_id: login,
          organization_id: tenant.organization,
          account_id: tenant.account,
        })
        .onConflict(oc =>
          oc
            .column('login_state_id')
            .doUpdateSet({ organization_id: tenant.organization, account_id: tenant.account }),
        )
        .execute()
    },
    deleteCurrentSelection: async login => {
      await db(tx)
        .deleteFrom('current_tenant_selection')
        .where('login_state_id', '=', login)
        .execute()
    },
    deleteOrganizationMemberships: async org => {
      await db(tx).deleteFrom('membership').where('organization_id', '=', org).execute()
    },
    deleteOrganization: async org => {
      await db(tx).deleteFrom('organization').where('organization_id', '=', org).execute()
    },
  }
}
/** Bindings do not observe or finish a unit. Each run constructs AI faces at the original point. */
export function createGovernancePersistence(deps: Pick<Deps, 'storage' | 'accounts' | 'logins'>): {
  readonly persistence: OrgPersistence
  bindUnit(unit: StorageUnit): OrgDataUnit
} {
  function bindUnit(unit: StorageUnit): OrgDataUnit {
    return {
      run(work) {
        unit.assertStorage(deps.storage)
        return unit.run(() =>
          work({
            accounts: deps.accounts.participate(unit),
            logins: deps.logins.participate(unit),
          }),
        )
      },
      query: work => unit.query(tx => work(readData(tx))),
      mutate: work => unit.mutate(tx => work(writeData(tx))),
      afterCommit: work => unit.afterCommit(work),
    }
  }
  return {
    bindUnit,
    persistence: {
      read: work => deps.storage.read(tx => work(readData(tx))),
      atomic: work => deps.storage.atomic(unit => work(bindUnit(unit))),
    },
  }
}
