// Tool 与 HITL 的组合（`rows/tool-hitl`）按运行共享的状态。Tool 的 Ask 等待由 HITL 保管，组合承担者是
// 本目录的决策方（`bridge.ts`）。它没有自己的行：`tool-records` 行在受信存储子树里建 HITL 宿主（`host.ts`），
// 入口对象 `toolClock` 交来 Identity 的保留读口、登记主体的签发与卡片的受众，`governance` 行的封口目的端按 destination
// 把 HITL 的保留转给这里的宿主。按 Cordis 根（`ctx.root`）各存一份，不留进程级状态。
import type { Context } from '@deepseek-ai/cordis'
import type { ActingForTenantPrincipal, StandingReservations } from '@omne-harness/identity'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ToolDecisionBridge } from '@omne-harness/tool-contract/provider'
import type { HitlAudience } from '../../entry/hitl-entry-principals.ts'
import type { ToolHitlHost } from './host.ts'

export type { HitlAudience }

export type ToolHitlHolder = {
  /** Identity 的保留读口，入口逐次现取；入口没有交来时为 undefined。 */
  reservations: () => StandingReservations | undefined
  /** 为租户签发决策方的登记主体；入口没有交来时为 undefined。 */
  registrar: (tenant: TenantId) => ActingForTenantPrincipal | undefined
  /**
   * 卡片的读者与答复者。本组合不定默认值：入口对象 `toolClock` 注入发行的规则 `hitlCardAudience`，没有注入时
   * 登记答 unavailable。答复者必须都是读者。
   */
  audience: HitlAudience | undefined
  /** `tool-records` 行建的 HITL 宿主；行不在时为 null。 */
  host: ToolHitlHost | null
  /** 同一行建的决策方；Tool 运行时组逐次读它，缺席时等待遇到缺席端口。 */
  bridge: ToolDecisionBridge<unknown> | null
}

const holders = new WeakMap<Context, ToolHitlHolder>()

/** 本次运行（Cordis 根）的共享状态；第一次取时建立。 */
export function toolHitlHolder(ctx: Context): ToolHitlHolder {
  const root = ctx.root
  const found = holders.get(root)
  if (found !== undefined) return found
  const created: ToolHitlHolder = {
    reservations: () => undefined,
    registrar: () => undefined,
    audience: undefined,
    host: null,
    bridge: null,
  }
  holders.set(root, created)
  return created
}
