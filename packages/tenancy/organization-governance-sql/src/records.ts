// 原观察位置的记录解码与纯治理判定。具名记录面不承担授权或提交。
// 行来自本包自己的表，但仍按「外部未知值先校验再收窄」解码：形状不对是缺陷（StoredRecordMalformed，上抛），
// 不是「不可用」也不是「不存在」。
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
import {
  OG_TABLES,
  type OrgRead,
  type InvitationTable,
  type AffiliationRequestTable,
} from './governance-data.ts'
import {
  AFFILIATION_DIRECTIONS,
  parseOrganizationName,
  type AffiliationDirection,
  type AffiliationRequestId,
  type InvitationId,
} from '@omne-harness-lite/organization-governance'

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
  readonly name: string
  readonly parent: OrganizationId | null
  readonly ownerAccount: AccountId | null
}

export function decodeOrganization(row: {
  organization_id: unknown
  kind: unknown
  parent: unknown
  owner_account: unknown
  name: unknown
}): OrganizationRecord {
  const t = OG_TABLES.organization
  return {
    id: field(t, 'organization_id', parseOrganizationId(row.organization_id)),
    kind: field(t, 'kind', parseOrganizationKind(row.kind)),
    name: field(t, 'name', parseOrganizationName(row.name)),
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
  d: OrgRead,
  id: OrganizationId,
): Promise<OrganizationRecord | undefined> {
  const row = await d.organization(id)
  return row === undefined ? undefined : decodeOrganization(row)
}

/** 由 `ownerAccount` 定位个人组织（「每个账号至多一个」由唯一索引兑现）。 */
export async function readOrganizationOwnedBy(
  d: OrgRead,
  account: AccountId,
): Promise<OrganizationRecord | undefined> {
  const row = await d.ownedOrganization(account)
  return row === undefined ? undefined : decodeOrganization(row)
}

export async function readMembership(
  d: OrgRead,
  tenant: TenantId,
): Promise<MembershipRecord | undefined> {
  const row = await d.membership(tenant)
  return row === undefined ? undefined : decodeMembership(row)
}

/**
 * S-26 的判定式，**本包唯一的一份**：公开读面 `memberships.standing` 与各写操作在自己事务里的准入判定都走它
 * （写操作的准入要与写入同一事务，不能调另开一次读事务的公开面）。无记录或无效 ⇒ `ineffective`。
 */
export async function standingIn(d: OrgRead, tenant: TenantId): Promise<MembershipStanding> {
  const membership = await readMembership(d, tenant)
  if (membership === undefined || !membership.effective) return { standing: 'ineffective' }
  return { standing: 'effective', role: membership.role }
}

export async function isSuperAdministrator(d: OrgRead, tenant: TenantId): Promise<boolean> {
  const standing = await standingIn(d, tenant)
  return standing.standing === 'effective' && standing.role === 'superAdministrator'
}

export async function countEffectiveSuperAdministrators(
  d: OrgRead,
  organization: OrganizationId,
): Promise<number> {
  return Number(await d.superAdministratorCount(organization))
}

/** 指向对象的存在性（OE S-19/S-20）：读得到才答 exists／absent；读不到以异常上抛，由操作收成 `unavailable`。 */
export async function existenceOf(
  d: OrgRead,
  ids: readonly OrganizationId[],
): Promise<ReadonlyMap<OrganizationId, TargetExistence>> {
  const unique = [...new Set(ids)]
  const result = new Map<OrganizationId, TargetExistence>()
  if (unique.length === 0) return result
  const rows = await d.organizationIdsPresent(unique)
  const present = new Set(rows)
  for (const id of unique) result.set(id, present.has(id) ? 'exists' : 'absent')
  return result
}

/**
 * 沿 `parent` 逐行读出一份上级快照，交给 identity-values 的纯函数求值。
 * 读到的行都进快照；链上某一行不存在 ⇒ 快照对它答 `'unavailable'`（不返回截断链，S-34 ⑧／S-32 ⑧）；
 * 存储读失败以异常上抛。
 */
export async function loadParentSnapshot(
  d: OrgRead,
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
