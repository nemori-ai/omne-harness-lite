// HITL 入口主体的签发者 `hitlEntryPrincipals`（identity「持有者与关系核对位置」、server-entry SPEC「HITL 位置」），
// 以及 HITL 卡片的受众规则（human-intervention protocol「公开入口与受众」）。
//
// 签发者只交给 server-entry 行的 HITL 位置：行用它受信可见的 `principalIssuer` 建它，别处拿不到签发者。
// 关系核对分两段。server-entry 只在同一次请求的登录识别成功、且目标租户的账号等于识别出的账号之后调用它。
// 签发者自己再核对一次账号相等，不相等时不签发。
//
// 入口主体是 `{ actor: server-entry, tenant, work: { owner: 'harness.hitl', work: 'cards' } }`。`work` 是固定文本，
// 所以同一租户的入口主体引用稳定，与登录无关。受众规则用这个引用，不签发主体。
import type { Origin } from '@omne-harness/human-intervention'
import {
  standingPrincipalRef,
  type PrincipalIssuer,
  type SystemPrincipal,
} from '@omne-harness/identity'
import { accountEquals, type TenantId } from '@omne-harness/legal-identity'
import type { HitlEntryIssue, HitlEntryPrincipals } from '@omne-harness/server-entry'

/** 入口主体的 `actor` 组件名：server-entry 成员自己的系统主体（server-entry SPEC「HITL 位置」）。 */
export const HITL_ENTRY_COMPONENT = 'server-entry'
/** 入口主体的原工作。固定文本。 */
export const HITL_ENTRY_WORK = Object.freeze({ owner: 'harness.hitl', work: 'cards' })

const REFUSED: HitlEntryIssue = Object.freeze({ kind: 'refused' })

/** 建签发者。`issuer` 是 server-entry 行的受信签发者；本模块不保存它以外的状态。 */
export function createHitlEntryPrincipals(
  issuer: Pick<PrincipalIssuer, 'issueSystem' | 'issueActingForTenant'>,
): HitlEntryPrincipals {
  let actor: SystemPrincipal | undefined
  const actorOf = (): SystemPrincipal | undefined => {
    if (actor !== undefined) return actor
    const issued = issuer.issueSystem({ component: HITL_ENTRY_COMPONENT })
    if ('failure' in issued) return undefined
    actor = issued.ok
    return actor
  }
  return Object.freeze({
    issue: async ({ account, tenant }) => {
      // 目标租户的账号必须是识别出的账号。
      if (!accountEquals(tenant.account, account)) return REFUSED
      const system = actorOf()
      if (system === undefined) return REFUSED
      const issued = issuer.issueActingForTenant({ actor: system, tenant, work: HITL_ENTRY_WORK })
      return 'ok' in issued ? { kind: 'issued', principal: issued.ok } : REFUSED
    },
  })
}

/** 租户入口主体的 `standingPrincipalRef`。它是引用，不证明签发。 */
export function hitlEntryRef(tenant: TenantId): string {
  return standingPrincipalRef({
    kind: 'acting-for-tenant',
    actor: { kind: 'system', component: HITL_ENTRY_COMPONENT },
    tenant,
    work: HITL_ENTRY_WORK,
  })
}

/** 一张卡的读者与答复者。出卡方给出租户与来源。 */
export type HitlAudience = (
  input: Readonly<{ tenant: TenantId; origin: Origin }>,
) => Readonly<{ readers: readonly string[]; responders: readonly string[] }>

/**
 * 来源为 Tool 或 Agent 的卡片的受众（protocol「公开入口与受众」）。规则与来源种类无关：读者与答复者都只有
 * 该租户入口主体的引用。出卡方把自己的登记主体加进读者，不加进答复者，所以出卡方能读卡，不能代人答复。
 */
export const hitlCardAudience: HitlAudience = ({ tenant }) => {
  const entry = hitlEntryRef(tenant)
  return { readers: [entry], responders: [entry] }
}
