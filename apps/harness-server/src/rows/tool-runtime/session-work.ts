// 「经核验的本租户会话工作主体」的唯一判定（L3 评审 N3）。Tool 请求供给者（`entry/tool-requests.ts`）与 Tool 运行时
// 的身份一侧（`access.ts`）都用它，口径只有这一份，按严的写：
// - 主体经 `principalVerifier` 核验为 `verified`；
// - `kind` 是 `acting-for-tenant`，签发组件（actor）是 `sessionWorkPrincipals`，工作拥有者是 `session`；
// - 主体的租户可编码；给了租户时，它可编码且与主体的租户相同。
// 核验器缺席、抛出或答 unavailable 时答 unavailable；其余不符一律 denied。
import type { ActingForTenantPrincipal, PrincipalVerifier } from '@omne-harness/identity'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { SESSION_WORK_OWNER, classify } from '../authorization/principals.ts'

/** 会话工作主体的签发组件（`entry/principals.ts` 的 `sessionWork`）。 */
export const SESSION_WORK_COMPONENT = 'sessionWorkPrincipals'

/**
 * 结构判定：主体是会话工作主体（给了租户时还须是这个租户的）时给出它与会话文本；不核验来源。
 * 未经核验的主体只用于编码已核验过的原主体（`access.ts` 的主体编码）。
 */
export function sessionWorkOf(
  principal: unknown,
  tenant?: TenantId,
): Readonly<{ principal: ActingForTenantPrincipal; session: string }> | undefined {
  const who = classify(principal)
  if (who?.column !== 'work') return undefined
  const p = who.principal
  if (
    p.kind !== 'acting-for-tenant' ||
    p.actor.component !== SESSION_WORK_COMPONENT ||
    p.work.owner !== SESSION_WORK_OWNER ||
    !tenantCodec.encode(p.tenant).ok
  )
    return undefined
  if (tenant !== undefined && (!tenantCodec.encode(tenant).ok || !tenantEquals(p.tenant, tenant)))
    return undefined
  return { principal: p, session: p.work.work }
}

export type VerifiedSessionWork =
  | Readonly<{ kind: 'session'; principal: ActingForTenantPrincipal; session: string }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** 核验后判定。`verifier` 每次由调用方现取；缺席答 unavailable，不默认放行。 */
export async function verifySessionWork(
  verifier: PrincipalVerifier | undefined,
  principal: unknown,
  tenant?: TenantId,
): Promise<VerifiedSessionWork> {
  if (verifier === undefined)
    return { kind: 'unavailable', diagnostic: 'principal verifier absent' }
  let checked: Awaited<ReturnType<PrincipalVerifier['verify']>>
  try {
    checked = await verifier.verify(principal)
  } catch {
    return { kind: 'unavailable', diagnostic: 'principal verification threw' }
  }
  if (checked.kind === 'unavailable')
    return { kind: 'unavailable', diagnostic: 'principal verifier unavailable' }
  if (checked.kind !== 'verified') return { kind: 'denied' }
  const work = sessionWorkOf(checked.principal, tenant)
  return work === undefined ? { kind: 'denied' } : { kind: 'session', ...work }
}
