// organizations 服务面：S-20 创建个人组织、S-21 创建团队组织、S-22 读组织、S-33 解除隶属、
// S-34 上级链与有共同上级、S-35 层身份。
import {
  type AccountId,
  type OrganizationId,
  type TenantId,
  ancestorChain as ancestorChainOf,
  isOk,
  parseAccountId,
  parseOpaqueIdentifier,
  parseOrganizationId,
  parseTenantId,
  shareAncestor as shareAncestorOf,
} from '@omne-harness-lite/identity-values'
import { type Duration, type Instant, addDuration } from '@omne-harness-lite/offer-expiry'
import { type Ack, type Outcome, fail, succeed } from '@omne-harness-lite/kernel-basis'
import { ReferenceViolation, UniqueViolation, type WriteTx } from '@omne-harness-lite/storage'
import {
  type Db,
  db,
  decodeInstant,
  isSuperAdministrator,
  loadParentSnapshot,
  mintIdentifier,
  readOrganization,
  readOrganizationOwnedBy,
} from './records.ts'
import { type Deps, readAccountFacts, withStorage } from './runtime.ts'
import type {
  AncestorChainFailure,
  CreatePersonalFailure,
  CreateTeamFailure,
  CreatedOrganization,
  DissolveAffiliationFailure,
  OrganizationReading,
  OrganizationsService,
  ReadOrganizationFailure,
  ScopeLayers,
  ScopeLayersFailure,
} from './types.ts'

/** 上级链里出现了环：S-7／S-32 保护的不变量已被破坏。缺陷，上抛，不折成任何契约失败值。 */
export class ParentChainCycle extends Error {
  override readonly name = 'ParentChainCycle'
  constructor(start: OrganizationId) {
    super(`organization-governance: cycle in the parent chain reachable from ${start}`)
  }
}

/** 部署级隶属写序列化（R-3b）的哨兵名：S-32 与 S-33 的写事务开头都取它。 */
export const AFFILIATION_SENTINEL = 'organization-governance/affiliation'

function created(organization: OrganizationId, account: AccountId): CreatedOrganization {
  return { organization, tenant: { organization, account } }
}

/**
 * 组织行 ＋ 创建者的成员关系记录（有效、超级管理员），同一个写事务里（S-20 ④／S-21 ④：不存在无超管的中间态）。
 * 上级组织创建时一律为空（S-7：创建链不接受上级）。
 */
async function insertOrganizationWithSuperAdministrator(
  d: Db,
  row: {
    readonly id: OrganizationId
    readonly kind: 'personal' | 'team'
    readonly ownerAccount: AccountId | null
    readonly creator: AccountId
    readonly createdAt: number
  },
): Promise<void> {
  await d
    .insertInto('organization')
    .values({
      organization_id: row.id,
      kind: row.kind,
      parent: null,
      owner_account: row.ownerAccount,
      created_at: row.createdAt,
    })
    .execute()
  await d
    .insertInto('membership')
    .values({
      organization_id: row.id,
      account_id: row.creator,
      effective: 1,
      role: 'superAdministrator',
    })
    .execute()
}

async function createPersonal(
  deps: Deps,
  accountIdInput: unknown,
): Promise<Outcome<CreatedOrganization, CreatePersonalFailure>> {
  const parsed = parseAccountId(accountIdInput)
  if (!isOk(parsed)) return fail('invalidInput')
  const account = parsed.ok

  // ② 两条账号判定（存在、未过期）；幂等那一路同样要过（⑦）。
  const facts = await readAccountFacts(deps, account)
  if ('failure' in facts) return facts
  if (facts.ok.retentionExpired) return fail('accountRecordExpired')

  return withStorage(() =>
    deps.storage.write(async tx => {
      const d = db(tx)
      const existing = await readOrganizationOwnedBy(d, account)
      if (existing !== undefined) return succeed(created(existing.id, account))
      const now = deps.clock.now()
      if (now === 'unavailable') return fail('unavailable')
      const id = mintIdentifier('OrganizationId')
      try {
        await insertOrganizationWithSuperAdministrator(d, {
          id,
          kind: 'personal',
          ownerAccount: account,
          creator: account,
          createdAt: now,
        })
      } catch (error) {
        // R-6：账号行已不在（被清除链先删）⇒ 引用约束在插入时拒绝 ⇒ 这一刻账号不存在
        if (error instanceof ReferenceViolation && error.kind === 'missing-target') {
          return fail('accountDoesNotExist')
        }
        // 至多一个个人组织：并发插入撞唯一索引 ⇒ 提交内重读返回既有的那一个（⑦ 幂等，不是拒绝）
        if (
          error instanceof UniqueViolation &&
          error.constraint === 'organization_owner_account_unique'
        ) {
          const winner = await readOrganizationOwnedBy(d, account)
          if (winner !== undefined) return succeed(created(winner.id, account))
        }
        throw error
      }
      return succeed(created(id, account))
    }),
  )
}

async function createTeam(
  deps: Deps,
  creatorInput: unknown,
  creationKeyInput?: unknown,
): Promise<Outcome<CreatedOrganization, CreateTeamFailure>> {
  const parsedCreator = parseAccountId(creatorInput)
  if (!isOk(parsedCreator)) return fail('invalidInput')
  const creator = parsedCreator.ok
  // 创建键：缺席 = 本次不去重（S-16 表第三行）；给了就按 IV S-31 的词法判形状
  let creationKey: string | undefined
  if (creationKeyInput !== undefined) {
    const parsedKey = parseOpaqueIdentifier(creationKeyInput, 'CreationKey')
    if (!isOk(parsedKey)) return fail('invalidInput')
    creationKey = parsedKey.ok
  }

  const facts = await readAccountFacts(deps, creator)
  if ('failure' in facts) return facts
  if (!facts.ok.activated) return fail('accountNotActivated')

  return withStorage(() =>
    deps.storage.write(async tx => {
      const d = db(tx)
      const now = deps.clock.now()
      if (now === 'unavailable') return fail('unavailable')
      const id = mintIdentifier('OrganizationId')
      if (creationKey !== undefined) {
        const replay = await registerCreationKey(d, tx, {
          creator,
          creationKey,
          organization: id,
          now,
          retention: deps.config.teamCreationKeyRetention,
        })
        // 同创建者、同键、仍在保留期内 ⇒ 首次创建的那一个，无二次效果（⑦）
        if (replay !== undefined) return succeed(created(replay, creator))
      }
      await insertOrganizationWithSuperAdministrator(d, {
        id,
        kind: 'team',
        ownerAccount: null,
        creator,
        createdAt: now,
      })
      return succeed(created(id, creator))
    }),
  )
}

/**
 * 键登记与组织行同一提交（S-21 ④）。返回已登记且仍在保留期内的 `OrganizationId`（重放），
 * 或 `undefined`（本次登记成功，调用方接着建组织）。读不到登记以异常上抛 ⇒ `unavailable`，**不得当作没见过**（⑧）。
 * 保留期边界：`now ≤ registeredAt + retention` 算在期内；过期后同键 ⇒ 新组织，登记改指新组织。
 * 先登记、后建组织：并发的同键创建撞主键 ⇒ 重读认回胜者，不留第二个组织。
 */
async function registerCreationKey(
  d: Db,
  tx: WriteTx,
  entry: {
    readonly creator: AccountId
    readonly creationKey: string
    readonly organization: OrganizationId
    readonly now: Instant
    readonly retention: Duration
  },
): Promise<OrganizationId | undefined> {
  const lookup = async () =>
    d
      .selectFrom('team_creation_key')
      .select(['organization_id', 'registered_at'])
      .where('creator_account', '=', entry.creator)
      .where('creation_key', '=', entry.creationKey)
      .executeTakeFirst()
  const withinRetention = (registeredAt: unknown) =>
    entry.now <=
    addDuration(decodeInstant('team_creation_key', 'registered_at', registeredAt), entry.retention)
  await tx.lockRow('team_creation_key', {
    creator_account: entry.creator,
    creation_key: entry.creationKey,
  })
  const hit = await lookup()
  if (hit !== undefined) {
    if (withinRetention(hit.registered_at)) {
      const organization = parseOrganizationId(hit.organization_id)
      if (!isOk(organization)) throw new Error('team_creation_key.organization_id is malformed')
      return organization.ok
    }
    await d
      .updateTable('team_creation_key')
      .set({ organization_id: entry.organization, registered_at: entry.now })
      .where('creator_account', '=', entry.creator)
      .where('creation_key', '=', entry.creationKey)
      .execute()
    return undefined
  }
  try {
    await d
      .insertInto('team_creation_key')
      .values({
        creator_account: entry.creator,
        creation_key: entry.creationKey,
        organization_id: entry.organization,
        registered_at: entry.now,
      })
      .execute()
  } catch (error) {
    if (error instanceof UniqueViolation && error.constraint === 'team_creation_key_pkey') {
      const winner = await lookup()
      const organization =
        winner === undefined ? undefined : parseOrganizationId(winner.organization_id)
      if (organization !== undefined && isOk(organization)) return organization.ok
    }
    throw error
  }
  return undefined
}

async function read(
  deps: Deps,
  organizationInput: unknown,
): Promise<Outcome<OrganizationReading, ReadOrganizationFailure>> {
  const parsed = parseOrganizationId(organizationInput)
  if (!isOk(parsed)) return fail('invalidInput')
  return withStorage(() =>
    deps.storage.read(async tx => {
      const record = await readOrganization(db(tx), parsed.ok)
      if (record === undefined) return fail('organizationDoesNotExist')
      return succeed({ id: record.id, kind: record.kind, parent: record.parent })
    }),
  )
}

async function dissolveAffiliation(
  deps: Deps,
  initiatorInput: unknown,
  childInput: unknown,
): Promise<Ack<DissolveAffiliationFailure>> {
  const initiator = parseTenantId(initiatorInput)
  const child = parseOrganizationId(childInput)
  if (!isOk(initiator) || !isOk(child)) return fail('invalidInput')
  const outcome = await withStorage(() =>
    deps.storage.write(async tx => {
      await tx.lockSentinel(AFFILIATION_SENTINEL)
      const d = db(tx)
      const record = await readOrganization(d, child.ok)
      // ② 任一方组织的超级管理员，单方面即可（不需要一份隶属请求）
      const parties =
        record === undefined ? [] : [record.id, ...(record.parent === null ? [] : [record.parent])]
      const authorized =
        parties.includes(initiator.ok.organization) && (await isSuperAdministrator(d, initiator.ok))
      if (!authorized) return fail('notAuthorized')
      if (record === undefined || record.parent === null) return fail('noSuchAffiliation')
      await clearParent(d, record.id)
      return succeed({ child: record.id, formerParent: record.parent })
    }),
  )
  if ('failure' in outcome) return outcome
  deps.notify('affiliation.dissolved', outcome.ok)
  return 'ok'
}

/**
 * S-7：上级组织属性的两条写路径之一（解除）。另一条是 offers 里接受隶属请求的 `setParent`；
 * 除这两处外没有任何写 `organization.parent` 的语句（创建时一律写 null），tests/static.spec.ts 守。
 */
async function clearParent(d: Db, child: OrganizationId): Promise<void> {
  await d
    .updateTable('organization')
    .set({ parent: null })
    .where('organization_id', '=', child)
    .execute()
}

async function ancestorChain(
  deps: Deps,
  organizationInput: unknown,
): Promise<Outcome<readonly OrganizationId[], AncestorChainFailure>> {
  const parsed = parseOrganizationId(organizationInput)
  if (!isOk(parsed)) return fail('invalidInput')
  return withStorage(() =>
    deps.storage.read(async tx => {
      const d = db(tx)
      if ((await readOrganization(d, parsed.ok)) === undefined) {
        return fail('organizationDoesNotExist')
      }
      const chain = ancestorChainOf(parsed.ok, await loadParentSnapshot(d, [parsed.ok]))
      if ('ok' in chain) return succeed(chain.ok)
      if (chain.failure === 'cycle') throw new ParentChainCycle(parsed.ok)
      return fail('unavailable')
    }),
  )
}

async function shareAncestor(
  deps: Deps,
  aInput: unknown,
  bInput: unknown,
): Promise<Outcome<boolean, AncestorChainFailure>> {
  const a = parseOrganizationId(aInput)
  const b = parseOrganizationId(bInput)
  if (!isOk(a) || !isOk(b)) return fail('invalidInput')
  return withStorage(() =>
    deps.storage.read(async tx => {
      const d = db(tx)
      if (
        (await readOrganization(d, a.ok)) === undefined ||
        (await readOrganization(d, b.ok)) === undefined
      ) {
        return fail('organizationDoesNotExist')
      }
      // 含自身求交由 identity-values 的纯函数做，不从 ancestorChain 的返回值自己求交（S-34）
      const result = shareAncestorOf(a.ok, b.ok, await loadParentSnapshot(d, [a.ok, b.ok]))
      if ('ok' in result) return succeed(result.ok)
      if (result.failure === 'cycle') throw new ParentChainCycle(a.ok)
      return fail('unavailable')
    }),
  )
}

function scopeLayers(tenantInput: unknown): Outcome<ScopeLayers, ScopeLayersFailure> {
  const parsed = parseTenantId(tenantInput)
  if (!isOk(parsed)) return fail('invalidInput')
  const tenant: TenantId = parsed.ok
  return succeed({
    organization: { layer: 'organization', organization: tenant.organization },
    tenant: { layer: 'tenant', tenant },
  })
}

export function createOrganizationsService(deps: Deps): OrganizationsService {
  return {
    createPersonal: accountId => createPersonal(deps, accountId),
    createTeam: (creator, creationKey) => createTeam(deps, creator, creationKey),
    read: organizationId => read(deps, organizationId),
    dissolveAffiliation: (initiator, child) => dissolveAffiliation(deps, initiator, child),
    ancestorChain: organizationId => ancestorChain(deps, organizationId),
    shareAncestor: (a, b) => shareAncestor(deps, a, b),
    scopeLayers,
  }
}
