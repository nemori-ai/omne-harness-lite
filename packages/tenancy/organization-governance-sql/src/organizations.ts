import type { OrgWrite, OrgDataUnit } from './governance-data.ts'
import type { PolicyDeps } from './policy-deps.ts'
import type { OrganizationsParticipation } from '@omne-harness-lite/organization-governance'
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
import { ReferenceViolation, UniqueViolation } from '@omne-harness-lite/storage'
import {
  decodeInstant,
  isSuperAdministrator,
  loadParentSnapshot,
  mintIdentifier,
  readOrganization,
  readOrganizationOwnedBy,
  StoredRecordMalformed,
} from './records.ts'
import {
  type OperationContext,
  readAccountFacts,
  withOperation,
  withParticipation,
} from './runtime.ts'
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
} from '@omne-harness-lite/organization-governance'
import { parseOrganizationName } from '@omne-harness-lite/organization-governance'

/** 上级链里出现了环：S-7／S-32 保护的不变量已被破坏。缺陷，上抛，不折成任何契约失败值。 */
export class ParentChainCycle extends Error {
  override readonly name = 'ParentChainCycle'
  constructor(start: OrganizationId) {
    super(`organization-governance: cycle in the parent chain reachable from ${start}`)
  }
}

function created(organization: OrganizationId, account: AccountId): CreatedOrganization {
  return { organization, tenant: { organization, account } }
}

/**
 * 组织行 ＋ 创建者的成员关系记录（有效、超级管理员），同一个写事务里（S-20 ④／S-21 ④：不存在无超管的中间态）。
 * 上级组织创建时一律为空（S-7：创建链不接受上级）。
 */
async function insertOrganizationWithSuperAdministrator(
  d: OrgWrite,
  row: {
    readonly id: OrganizationId
    readonly kind: 'personal' | 'team'
    readonly name: string
    readonly ownerAccount: AccountId | null
    readonly creator: AccountId
    readonly createdAt: number
  },
): Promise<void> {
  await d.insertOrganization({
    organization_id: row.id,
    kind: row.kind,
    name: row.name,
    parent: null,
    owner_account: row.ownerAccount,
    created_at: row.createdAt,
  })
  await d.insertMembership({
    organization_id: row.id,
    account_id: row.creator,
    effective: 1,
    role: 'superAdministrator',
  })
}

async function createPersonal(
  deps: OperationContext,
  accountIdInput: unknown,
): Promise<Outcome<CreatedOrganization, CreatePersonalFailure>> {
  const parsed = parseAccountId(accountIdInput)
  if (!isOk(parsed)) return fail('invalidInput')
  const account = parsed.ok

  // ② 两条账号判定（存在、未过期）；幂等那一路同样要过（⑦）。
  const facts = await readAccountFacts(deps, account)
  if ('failure' in facts) return facts
  if (facts.ok.retentionExpired) return fail('accountRecordExpired')

  return deps.mutate(async tx => {
    const d = tx
    const existing = await readOrganizationOwnedBy(d, account)
    if (existing !== undefined) return succeed(created(existing.id, account))
    const now = deps.clock.now()
    if (now === 'unavailable') return fail('unavailable')
    const id = mintIdentifier('OrganizationId')
    try {
      await insertOrganizationWithSuperAdministrator(d, {
        id,
        kind: 'personal',
        name: '个人组织',
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
  })
}

async function createTeam(
  deps: OperationContext,
  creatorInput: unknown,
  nameInput: unknown,
  creationKeyInput?: unknown,
): Promise<Outcome<CreatedOrganization, CreateTeamFailure>> {
  const input = parseTeamInput(creatorInput, nameInput, creationKeyInput)
  if ('failure' in input) return input
  const { creator, name, creationKey } = input.ok

  const facts = await readAccountFacts(deps, creator)
  if ('failure' in facts) return facts
  if (!facts.ok.activated) return fail('accountNotActivated')

  return deps.mutate(async tx => {
    const d = tx
    const now = deps.clock.now()
    if (now === 'unavailable') return fail('unavailable')
    const id = mintIdentifier('OrganizationId')
    if (creationKey !== undefined) {
      const replay = await registerCreationKey(d, {
        creator,
        creationKey,
        organization: id,
        now,
        retention: deps.config.teamCreationKeyRetention,
      })
      // 同创建者、同键、仍在保留期内：核原名称后认回，不产生二次效果。
      if (replay !== undefined) return replayTeam(d, replay, creator, name)
    }
    await insertOrganizationWithSuperAdministrator(d, {
      id,
      kind: 'team',
      name,
      ownerAccount: null,
      creator,
      createdAt: now,
    })
    return succeed(created(id, creator))
  })
}

function parseTeamInput(
  creatorInput: unknown,
  nameInput: unknown,
  creationKeyInput: unknown,
): Outcome<
  { readonly creator: AccountId; readonly name: string; readonly creationKey: string | undefined },
  'invalidInput'
> {
  const parsedCreator = parseAccountId(creatorInput)
  const parsedName = parseOrganizationName(nameInput)
  if (!isOk(parsedCreator) || !isOk(parsedName)) return fail('invalidInput')
  const creator = parsedCreator.ok
  // 创建键：缺席 = 本次不去重（S-16 表第三行）；给了就按 IV S-31 的词法判形状
  let creationKey: string | undefined
  if (creationKeyInput !== undefined) {
    const parsedKey = parseOpaqueIdentifier(creationKeyInput, 'CreationKey')
    if (!isOk(parsedKey)) return fail('invalidInput')
    creationKey = parsedKey.ok
  }

  return succeed({ creator, name: parsedName.ok, creationKey })
}

async function replayTeam(
  d: OrgWrite,
  organization: OrganizationId,
  creator: AccountId,
  name: string,
): Promise<Outcome<CreatedOrganization, 'invalidInput'>> {
  const original = await readOrganization(d, organization)
  if (original === undefined || original.kind !== 'team')
    throw new StoredRecordMalformed('team_creation_key', 'missing team organization')
  return original.name === name ? succeed(created(organization, creator)) : fail('invalidInput')
}

/**
 * 键登记与组织行同一提交（S-21 ④）。返回已登记且仍在保留期内的 `OrganizationId`（重放），
 * 或 `undefined`（本次登记成功，调用方接着建组织）。读不到登记以异常上抛 ⇒ `unavailable`，**不得当作没见过**（⑧）。
 * 保留期边界：`now ≤ registeredAt + retention` 算在期内；过期后同键 ⇒ 新组织，登记改指新组织。
 * 先登记、后建组织：并发的同键创建撞主键 ⇒ 重读认回胜者，不留第二个组织。
 */
async function registerCreationKey(
  d: OrgWrite,
  entry: {
    readonly creator: AccountId
    readonly creationKey: string
    readonly organization: OrganizationId
    readonly now: Instant
    readonly retention: Duration
  },
): Promise<OrganizationId | undefined> {
  const lookup = async () => d.creationKey(entry.creator, entry.creationKey)
  const withinRetention = (registeredAt: unknown) =>
    entry.now <=
    addDuration(decodeInstant('team_creation_key', 'registered_at', registeredAt), entry.retention)
  await d.lockCreationKey(entry.creator, entry.creationKey)
  const hit = await lookup()
  if (hit !== undefined) {
    if (withinRetention(hit.registered_at)) {
      const organization = parseOrganizationId(hit.organization_id)
      if (!isOk(organization)) throw new Error('team_creation_key.organization_id is malformed')
      return organization.ok
    }
    await d.replaceCreationKey(entry.creator, entry.creationKey, entry.organization, entry.now)
    return undefined
  }
  try {
    await d.insertCreationKey({
      creator_account: entry.creator,
      creation_key: entry.creationKey,
      organization_id: entry.organization,
      registered_at: entry.now,
    })
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
  deps: OperationContext,
  organizationInput: unknown,
): Promise<Outcome<OrganizationReading, ReadOrganizationFailure>> {
  const parsed = parseOrganizationId(organizationInput)
  if (!isOk(parsed)) return fail('invalidInput')
  return deps.query(async tx => {
    const record = await readOrganization(tx, parsed.ok)
    if (record === undefined) return fail('organizationDoesNotExist')
    return succeed({ id: record.id, kind: record.kind, parent: record.parent, name: record.name })
  })
}

async function dissolveAffiliation(
  deps: OperationContext,
  initiatorInput: unknown,
  childInput: unknown,
): Promise<Ack<DissolveAffiliationFailure>> {
  const initiator = parseTenantId(initiatorInput)
  const child = parseOrganizationId(childInput)
  if (!isOk(initiator) || !isOk(child)) return fail('invalidInput')
  const outcome = await deps.mutate(async tx => {
    await tx.lockAffiliationGraph()
    const d = tx
    const record = await readOrganization(d, child.ok)
    // ② 任一方组织的超级管理员，单方面即可（不需要一份隶属请求）
    const parties =
      record === undefined ? [] : [record.id, ...(record.parent === null ? [] : [record.parent])]
    const authorized =
      parties.includes(initiator.ok.organization) && (await isSuperAdministrator(d, initiator.ok))
    if (!authorized) return fail('notAuthorized')
    if (record === undefined || record.parent === null) return fail('noSuchAffiliation')
    await d.setParent(record.id, null)
    return succeed({ child: record.id, formerParent: record.parent })
  })
  if ('failure' in outcome) return outcome
  deps.notify('organization-governance/affiliation-dissolved', outcome.ok)
  return 'ok'
}

async function ancestorChain(
  deps: OperationContext,
  organizationInput: unknown,
): Promise<Outcome<readonly OrganizationId[], AncestorChainFailure>> {
  const parsed = parseOrganizationId(organizationInput)
  if (!isOk(parsed)) return fail('invalidInput')
  return deps.query(async tx => {
    const d = tx
    if ((await readOrganization(d, parsed.ok)) === undefined) {
      return fail('organizationDoesNotExist')
    }
    const chain = ancestorChainOf(parsed.ok, await loadParentSnapshot(d, [parsed.ok]))
    if ('ok' in chain) return succeed(chain.ok)
    if (chain.failure === 'cycle') throw new ParentChainCycle(parsed.ok)
    return fail('unavailable')
  })
}

async function shareAncestor(
  deps: OperationContext,
  aInput: unknown,
  bInput: unknown,
): Promise<Outcome<boolean, AncestorChainFailure>> {
  const a = parseOrganizationId(aInput)
  const b = parseOrganizationId(bInput)
  if (!isOk(a) || !isOk(b)) return fail('invalidInput')
  return deps.query(async tx => {
    const d = tx
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
  })
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

export function createOrganizationsPolicy(deps: PolicyDeps): Omit<
  OrganizationsService,
  'participate'
> & {
  participate(unit: OrgDataUnit): OrganizationsParticipation
} {
  return {
    createPersonal: accountId => withOperation(deps, context => createPersonal(context, accountId)),
    createTeam: (creator, name, creationKey) =>
      withOperation(deps, context => createTeam(context, creator, name, creationKey)),
    read: organizationId => withOperation(deps, context => read(context, organizationId)),
    dissolveAffiliation: (initiator, child) =>
      withOperation(deps, context => dissolveAffiliation(context, initiator, child)),
    ancestorChain: organizationId =>
      withOperation(deps, context => ancestorChain(context, organizationId)),
    shareAncestor: (a, b) => withOperation(deps, context => shareAncestor(context, a, b)),
    scopeLayers,
    participate: unit => ({
      createTeam: (creator, name, creationKey) =>
        withParticipation(deps, unit, context => createTeam(context, creator, name, creationKey)),
      read: organizationId =>
        withParticipation(deps, unit, context => read(context, organizationId)),
      dissolveAffiliation: (initiator, child) =>
        withParticipation(deps, unit, context => dissolveAffiliation(context, initiator, child)),
      ancestorChain: organizationId =>
        withParticipation(deps, unit, context => ancestorChain(context, organizationId)),
      shareAncestor: (a, b) =>
        withParticipation(deps, unit, context => shareAncestor(context, a, b)),
      scopeLayers: tenant => withParticipation(deps, unit, async () => scopeLayers(tenant)),
    }),
  }
}
