// MCP 限界上下文：MCP 动作清单聚合（ActionCatalog）与 MCP 已知动作实体（KnownAction）。
// 清单经 CatalogStore 整份保存、按修订条件写入，所以聚合是不可变记录 + 纯转移函数，
// 不用类：一致性边界是「一份记录、一次条件写入」，不是内存里的可变对象。

import { fail, succeed, type Outcome } from '../shared.ts'
import type {
  ActionDefinition,
  ActionName,
  CatalogRevision,
  DefinitionDigest,
  Generation,
  ProtocolVersion,
} from './values.ts'

export type UnavailableReason =
  | 'no-longer-offered'
  | 'connection-unavailable'
  | 'authorization-required'
  | 'credential-unavailable'
  | 'landing-unavailable'

/** 实体：身份是（接入点 name，对端动作名）；清单内以动作名为键。 */
export type KnownAction = Readonly<{
  name: ActionName
  lastLawful: ActionDefinition
  definitionDigest: DefinitionDigest
  availability: Readonly<{ kind: 'available' }> | Readonly<{ kind: 'unavailable'; reason: UnavailableReason }>
}>

/** 采用依据：这次采用基于哪一代连接、哪个协议版本与能力。 */
export type AdoptionBasis = Readonly<{
  generation: Generation
  protocolVersion: ProtocolVersion
  capabilitiesDigest: string
}>

export type Freshness = Readonly<{
  acquiredAt: string // UTC 时刻
  ttlMs?: number
  changedNotified: boolean
}>

/** 已取得：至少一次合法取得了完整清单。actions 为空表示对端提供零个动作。 */
export type ActionCatalogRecord = Readonly<{
  revision: CatalogRevision
  basis: AdoptionBasis
  freshness: Freshness
  actions: ReadonlyMap<ActionName, KnownAction>
}>

/** 未取得与已取得是两种状态，不混同：未取得不报告零个动作。 */
export type CatalogState = Readonly<{ kind: 'not-acquired' }> | Readonly<{ kind: 'acquired'; record: ActionCatalogRecord }>

/** 一次完整、合法、无重名的取得。只能经 completeListing 构造。 */
export type CompleteListing = Readonly<{
  actions: readonly Readonly<{ definition: ActionDefinition; digest: DefinitionDigest }>[]
  basis: AdoptionBasis
  freshness: Freshness
}> & { readonly __complete: true }

export type ListingDefect = 'duplicate-action-name' | 'page-failed'

export function completeListing(
  pages: readonly Readonly<{ ok: readonly Readonly<{ definition: ActionDefinition; digest: DefinitionDigest }>[] } | { failed: true }>[],
  basis: AdoptionBasis,
  freshness: Freshness,
): Outcome<CompleteListing, ListingDefect> {
  const seen = new Set<string>()
  const actions = []
  for (const page of pages) {
    if ('failed' in page) return fail('page-failed') // 任一页失败，前面各页也不采用
    for (const item of page.ok) {
      if (seen.has(item.definition.name)) return fail('duplicate-action-name')
      seen.add(item.definition.name)
      actions.push(item)
    }
  }
  return succeed({ actions, basis, freshness, __complete: true as const })
}

/**
 * 只按清单修订做条件判断。连接代际属于一条 MCP 连接，采用修订一变就换新连接、代际重新计，
 * 跨连接比较代际没有意义；「产出清单的那一代连接仍是当前连接」在发布边界核对（ActionDiscovery 第 6 步）。
 * 见 README F4。
 */
export type MergeRefusal = 'stale-revision'

/**
 * 采用算法本体（mergeListing）。不变式：
 * 1 只有合法取得的完整清单能加入新动作；
 * 2 已知动作不静默消失：对端不再提供时标为不可用，保留最近合法定义；
 * 3 迟到的、较旧的结果被拒绝（修订不等），不覆盖较新的采用；
 * 4 整份产出新记录，修订加一。
 */
export function mergeListing(
  current: CatalogState,
  listing: CompleteListing,
  basedOn: Readonly<{ revision: CatalogRevision | 'absent' }>,
): Outcome<ActionCatalogRecord, MergeRefusal> {
  const previous = current.kind === 'acquired' ? current.record : undefined
  const currentRevision = previous?.revision ?? 'absent'
  if (currentRevision !== basedOn.revision) return fail('stale-revision')

  const next = new Map<ActionName, KnownAction>()
  for (const { definition, digest } of listing.actions)
    next.set(definition.name, { name: definition.name, lastLawful: definition, definitionDigest: digest, availability: { kind: 'available' } })
  if (previous !== undefined)
    for (const [name, known] of previous.actions)
      if (!next.has(name)) next.set(name, { ...known, availability: { kind: 'unavailable', reason: 'no-longer-offered' } })

  const revision = ((previous?.revision ?? 0) + 1) as CatalogRevision
  return succeed({ revision, basis: listing.basis, freshness: listing.freshness, actions: next })
}

/** 连接或凭据问题使全部动作暂不可用；身份与最近合法定义保留。 */
export function markUnavailable(record: ActionCatalogRecord, reason: Exclude<UnavailableReason, 'no-longer-offered'>): ActionCatalogRecord {
  const actions = new Map<ActionName, KnownAction>()
  for (const [name, known] of record.actions) actions.set(name, { ...known, availability: { kind: 'unavailable', reason } })
  return { ...record, revision: (record.revision + 1) as CatalogRevision, actions }
}

/** 逐动作权限项：只在已取得时派生；项名只由动作名决定。 */
export function actionPermissionItems(state: CatalogState): readonly string[] | 'not-acquired' {
  if (state.kind === 'not-acquired') return 'not-acquired'
  return [...state.record.actions.keys()].map(name => `execute:${name}`)
}
