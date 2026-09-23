// 存储记录：表行类型、行 → 领域记录的解码、事务内的读助手。
// 行来自本包自己的表，但仍按「外部未知值先校验再收窄」解码：形状不对是缺陷（StoredRecordMalformed，上抛），
// 不是「不可用」也不是「不存在」。
import type { Kysely } from 'kysely'
import {
  type AccountId,
  type MembershipStanding,
  type OpaqueIdentifier,
  type OrganizationId,
  type OrganizationKind,
  type ParentSnapshot,
  type Parsed,
  type TenantId,
  type TenantRole,
  generateOpaqueIdentifier,
  isOk,
  parseAccountId,
  parseOpaqueIdentifier,
  parseOrganizationId,
  parseOrganizationKind,
  parseTenantRole,
} from '@omne-harness-lite/identity-values'
import {
  type Instant,
  type OfferTiming,
  type SettledState,
  type TargetExistence,
  instantFromEpochMs,
  parseSettledState,
} from '@omne-harness-lite/offer-expiry'
import { narrow, type ReadTx } from '@omne-harness-lite/storage'
import { OG_TABLES } from './migrations.ts'
import {
  AFFILIATION_DIRECTIONS,
  type AffiliationDirection,
  type AffiliationRequestId,
  type InvitationId,
} from './types.ts'

// ---- 表行（Kysely 查询类型） ----

/** 整数时刻列：sqlite 返回 number，pg 的 bigint 返回 string；解码统一收成 Instant。 */
type EpochColumn = number | string | bigint

export interface OrganizationTable {
  organization_id: string
  kind: string
  parent: string | null
  owner_account: string | null
  created_at: EpochColumn
}
export interface MembershipTable {
  organization_id: string
  account_id: string
  effective: number
  role: string
}
export interface InvitationTable {
  invitation_id: string
  issuer_organization: string
  invited_account: string
  role: string
  issued_at: EpochColumn
  expires_at: EpochColumn
  settled: string | null
}
export interface AffiliationRequestTable {
  affiliation_request_id: string
  initiator: string
  recipient: string
  direction: string
  issued_at: EpochColumn
  expires_at: EpochColumn
  settled: string | null
}
export interface CurrentTenantSelectionTable {
  login_state_id: string
  organization_id: string
  account_id: string
}
export interface TeamCreationKeyTable {
  creator_account: string
  creation_key: string
  organization_id: string
  registered_at: EpochColumn
}

export interface OgDatabase {
  organization: OrganizationTable
  membership: MembershipTable
  invitation: InvitationTable
  affiliation_request: AffiliationRequestTable
  current_tenant_selection: CurrentTenantSelectionTable
  team_creation_key: TeamCreationKeyTable
}

export type Db = Kysely<OgDatabase>

export function db(tx: ReadTx): Db {
  return narrow<OgDatabase>(tx)
}

/**
 * 在持有节点的存储提交内生成一个不透明标识（IV G-04 词法候选）。唯一性由主键约束兑现，不由随机性兑现：
 * 碰撞 ⇒ 提交以 `UniqueViolation` 失败（缺陷级小概率，不折成契约失败值）。
 */
export function mintIdentifier<B extends string>(kind: B): OpaqueIdentifier<B> {
  const parsed = parseOpaqueIdentifier(generateOpaqueIdentifier(), kind)
  if (!isOk(parsed)) throw new Error(`generated ${kind} failed its own lexical check`)
  return parsed.ok
}

// ---- 解码 ----

/** 本包表里的一行不合本包自己写下的形状：缺陷，不折成任何契约失败值。 */
export class StoredRecordMalformed extends Error {
  override readonly name = 'StoredRecordMalformed'
  constructor(table: string, detail: string) {
    super(`organization-governance: malformed row in ${table}: ${detail}`)
  }
}

function field<T>(table: string, column: string, parsed: Parsed<T>): T {
  if (isOk(parsed)) return parsed.ok
  throw new StoredRecordMalformed(table, `${column}: ${parsed.invalidInput}`)
}

export function decodeInstant(table: string, column: string, value: unknown): Instant {
  const numeric = typeof value === 'string' || typeof value === 'bigint' ? Number(value) : value
  return field(table, column, instantFromEpochMs(numeric))
}

function nullable<T>(value: unknown, parse: (v: unknown) => Parsed<T>): Parsed<T | null> {
  if (value === null) return { ok: null }
  return parse(value)
}

export interface OrganizationRecord {
  readonly id: OrganizationId
  readonly kind: OrganizationKind
  readonly parent: OrganizationId | null
  readonly ownerAccount: AccountId | null
}

export function decodeOrganization(row: {
  organization_id: unknown
  kind: unknown
  parent: unknown
  owner_account: unknown
}): OrganizationRecord {
  const t = OG_TABLES.organization
  return {
    id: field(t, 'organization_id', parseOrganizationId(row.organization_id)),
    kind: field(t, 'kind', parseOrganizationKind(row.kind)),
    parent: field(t, 'parent', nullable(row.parent, parseOrganizationId)),
    ownerAccount: field(t, 'owner_account', nullable(row.owner_account, parseAccountId)),
  }
}

export interface MembershipRecord {
  readonly tenant: TenantId
  readonly effective: boolean
  readonly role: TenantRole
}

export function decodeMembership(row: {
  organization_id: unknown
  account_id: unknown
  effective: unknown
  role: unknown
}): MembershipRecord {
  const t = OG_TABLES.membership
  const effective = row.effective
  if (effective !== 0 && effective !== 1) throw new StoredRecordMalformed(t, 'effective: not 0/1')
  return {
    tenant: {
      organization: field(t, 'organization_id', parseOrganizationId(row.organization_id)),
      account: field(t, 'account_id', parseAccountId(row.account_id)),
    },
    effective: effective === 1,
    role: field(t, 'role', parseTenantRole(row.role)),
  }
}

export interface InvitationRecord {
  readonly id: InvitationId
  readonly issuer: OrganizationId
  readonly invitedAccount: AccountId
  readonly role: TenantRole
  readonly timing: OfferTiming
  readonly settled: SettledState | null
}

export function decodeInvitation(row: InvitationTable): InvitationRecord {
  const t = OG_TABLES.invitation
  return {
    id: field(t, 'invitation_id', parseOpaqueIdentifier(row.invitation_id, 'InvitationId')),
    issuer: field(t, 'issuer_organization', parseOrganizationId(row.issuer_organization)),
    invitedAccount: field(t, 'invited_account', parseAccountId(row.invited_account)),
    role: field(t, 'role', parseTenantRole(row.role)),
    timing: {
      issuedAt: decodeInstant(t, 'issued_at', row.issued_at),
      expiresAt: decodeInstant(t, 'expires_at', row.expires_at),
    },
    settled: field(t, 'settled', nullable(row.settled, parseSettledState)),
  }
}

/** 方向判别式集合封闭（IV S-32）：集合外一律拒绝。 */
export function parseDirection(value: unknown): Parsed<AffiliationDirection> {
  return typeof value === 'string' && (AFFILIATION_DIRECTIONS as readonly string[]).includes(value)
    ? { ok: value as AffiliationDirection }
    : { invalidInput: 'AffiliationDirection: unknown value' }
}

export interface AffiliationRequestRecord {
  readonly id: AffiliationRequestId
  readonly initiator: OrganizationId
  readonly recipient: OrganizationId
  readonly direction: AffiliationDirection
  readonly timing: OfferTiming
  readonly settled: SettledState | null
}

export function decodeAffiliationRequest(row: AffiliationRequestTable): AffiliationRequestRecord {
  const t = OG_TABLES.affiliationRequest
  return {
    id: field(
      t,
      'affiliation_request_id',
      parseOpaqueIdentifier(row.affiliation_request_id, 'AffiliationRequestId'),
    ),
    initiator: field(t, 'initiator', parseOrganizationId(row.initiator)),
    recipient: field(t, 'recipient', parseOrganizationId(row.recipient)),
    direction: field(t, 'direction', parseDirection(row.direction)),
    timing: {
      issuedAt: decodeInstant(t, 'issued_at', row.issued_at),
      expiresAt: decodeInstant(t, 'expires_at', row.expires_at),
    },
    settled: field(t, 'settled', nullable(row.settled, parseSettledState)),
  }
}

// ---- 事务内的读助手（调用方在自己的 read／write 事务里调；存储失败以异常上抛） ----

export async function readOrganization(
  d: Db,
  id: OrganizationId,
): Promise<OrganizationRecord | undefined> {
  const row = await d
    .selectFrom('organization')
    .select(['organization_id', 'kind', 'parent', 'owner_account'])
    .where('organization_id', '=', id)
    .executeTakeFirst()
  return row === undefined ? undefined : decodeOrganization(row)
}

/** 由 `ownerAccount` 定位个人组织（「每个账号至多一个」由唯一索引兑现）。 */
export async function readOrganizationOwnedBy(
  d: Db,
  account: AccountId,
): Promise<OrganizationRecord | undefined> {
  const row = await d
    .selectFrom('organization')
    .select(['organization_id', 'kind', 'parent', 'owner_account'])
    .where('owner_account', '=', account)
    .executeTakeFirst()
  return row === undefined ? undefined : decodeOrganization(row)
}

export async function readMembership(
  d: Db,
  tenant: TenantId,
): Promise<MembershipRecord | undefined> {
  const row = await d
    .selectFrom('membership')
    .select(['organization_id', 'account_id', 'effective', 'role'])
    .where('organization_id', '=', tenant.organization)
    .where('account_id', '=', tenant.account)
    .executeTakeFirst()
  return row === undefined ? undefined : decodeMembership(row)
}

/**
 * S-26 的判定式，**本包唯一的一份**：公开读面 `memberships.standing` 与各写操作在自己事务里的准入判定都走它
 * （写操作的准入要与写入同一事务，不能调另开一次读事务的公开面）。无记录或无效 ⇒ `ineffective`。
 */
export async function standingIn(d: Db, tenant: TenantId): Promise<MembershipStanding> {
  const membership = await readMembership(d, tenant)
  if (membership === undefined || !membership.effective) return { standing: 'ineffective' }
  return { standing: 'effective', role: membership.role }
}

export async function isSuperAdministrator(d: Db, tenant: TenantId): Promise<boolean> {
  const standing = await standingIn(d, tenant)
  return standing.standing === 'effective' && standing.role === 'superAdministrator'
}

export async function countEffectiveSuperAdministrators(
  d: Db,
  organization: OrganizationId,
): Promise<number> {
  const row = await d
    .selectFrom('membership')
    .select(eb => eb.fn.countAll<number | string | bigint>().as('n'))
    .where('organization_id', '=', organization)
    .where('effective', '=', 1)
    .where('role', '=', 'superAdministrator')
    .executeTakeFirstOrThrow()
  return Number(row.n)
}

/** 指向对象的存在性（OE S-19/S-20）：读得到才答 exists／absent；读不到以异常上抛，由操作收成 `unavailable`。 */
export async function existenceOf(
  d: Db,
  ids: readonly OrganizationId[],
): Promise<ReadonlyMap<OrganizationId, TargetExistence>> {
  const unique = [...new Set(ids)]
  const result = new Map<OrganizationId, TargetExistence>()
  if (unique.length === 0) return result
  const rows = await d
    .selectFrom('organization')
    .select('organization_id')
    .where('organization_id', 'in', unique)
    .execute()
  const present = new Set(rows.map(r => r.organization_id))
  for (const id of unique) result.set(id, present.has(id) ? 'exists' : 'absent')
  return result
}

/**
 * 沿 `parent` 逐行读出一份上级快照，交给 identity-values 的纯函数求值。
 * 读到的行都进快照；链上某一行不存在 ⇒ 快照对它答 `'unavailable'`（不返回截断链，S-34 ⑧／S-32 ⑧）；
 * 存储读失败以异常上抛。
 */
export async function loadParentSnapshot(
  d: Db,
  starts: readonly OrganizationId[],
): Promise<ParentSnapshot> {
  const known = new Map<OrganizationId, OrganizationId | null>()
  for (const start of starts) {
    let current: OrganizationId | null = start
    while (current !== null && !known.has(current)) {
      const record = await readOrganization(d, current)
      if (record === undefined) break
      known.set(current, record.parent)
      current = record.parent
    }
  }
  return organization => {
    const parent = known.get(organization)
    return parent === undefined ? 'unavailable' : parent
  }
}
