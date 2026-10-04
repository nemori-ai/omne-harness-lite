// 入口层与运维面之间的四条通知（入口节点 design「插件边界、服务面与三处关键选择」）：都用 `emit`，不落存储、不经服务。
// 名字在 ../events.ts；这里给它们的载荷形状与 Cordis 事件表的类型。
import type { Instant } from '@omne-harness-lite/offer-expiry'

/** `serving` 的载荷：启动时载入的中心标识与所装版本，以及入口层开门那一刻读到的中心的钟。 */
export interface ServingNotice {
  readonly centerId: string
  readonly version: string
  readonly startedAt: Instant
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /** 入口层开门前发一次；运维面发 `listening` 时，开着门的入口层重发一次。 */
    'governance-center-entry/serving'(notice: ServingNotice): void
    /** 入口层关门（停收）时发一次。 */
    'governance-center-entry/stopped'(): void
    /** 入口层每记一次缺陷发一次（无载荷）。 */
    'governance-center-entry/defect'(): void
    /** 运维面每次装载、挂好监听之后发一次。 */
    'governance-center-ops/listening'(): void
  }
}
