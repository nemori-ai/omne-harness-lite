import type { OrganizationId, TenantId } from './values.ts'

/**
 * S-13：同一账号的两个租户身份。纯值判定，不读任何记录。
 */
export function sameAccountDistinctTenants(a: TenantId, b: TenantId): boolean {
  return a.account === b.account && a.organization !== b.organization
}

/**
 * 上级组织属性的一次快照：`parentOf(o)` 返回 o 的上级、`null`（无上级）或 `'unavailable'`（该行读不到）。
 *
 * S-14／S-15 是读时求值的派生视图，会失败：任何一跳读不到都必须明确失败（S-19），
 * 不得返回截断的短链。本模块只给定义式的纯函数形式；快照与写入同提交那一半归治理节点。
 */
export type ParentSnapshot = (organization: OrganizationId) => OrganizationId | null | 'unavailable'

export type ChainResult =
  | { readonly ok: readonly OrganizationId[] }
  | { readonly failure: 'unavailable' }
  | { readonly failure: 'cycle' }

/**
 * S-14：从 o 出发沿上级组织属性一路往上得到的组织序列，不含 o 自身。
 * 遇到环返回 `cycle`（契约不变量已被破坏，不得静默截断）。
 */
export function ancestorChain(organization: OrganizationId, parentOf: ParentSnapshot): ChainResult {
  const chain: OrganizationId[] = []
  const seen = new Set<OrganizationId>([organization])
  let current: OrganizationId = organization
  for (;;) {
    const parent = parentOf(current)
    if (parent === 'unavailable') return { failure: 'unavailable' }
    if (parent === null) return { ok: chain }
    if (seen.has(parent)) return { failure: 'cycle' }
    seen.add(parent)
    chain.push(parent)
    current = parent
  }
}

export type ShareAncestorResult =
  { readonly ok: boolean } | { readonly failure: 'unavailable' } | { readonly failure: 'cycle' }

/**
 * S-15：把各自算进自己的上级链之后求交。等价于「同一棵隶属树（根相同）」。
 * `shareAncestor(o, o)` 恒为真，但那不是一次跨组织放行依据。
 */
export function shareAncestor(
  a: OrganizationId,
  b: OrganizationId,
  parentOf: ParentSnapshot,
): ShareAncestorResult {
  const chainA = ancestorChain(a, parentOf)
  if ('failure' in chainA) return chainA
  const chainB = ancestorChain(b, parentOf)
  if ('failure' in chainB) return chainB
  const setA = new Set<OrganizationId>([a, ...chainA.ok])
  return { ok: [b, ...chainB.ok].some(o => setA.has(o)) }
}
