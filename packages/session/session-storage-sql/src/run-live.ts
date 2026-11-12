import { z } from 'zod'
import type { FactCommandV2 } from '@omne-harness/sql-contract'

export const SESSION_RUN_LIVE_GUARD = 'session.run-live'
export const SESSION_RUN_LIVE_FACT = { key: 'session.run-live', protocol: '1' } as const
const text = z.string().min(1)
/** tenant 是 legal-identity 编码后的租户文本，与 Session 表的 tenant 列相同。 */
export const RunLiveSchema = z.strictObject({ tenant: text, session: text, run: text })
export type RunLive = z.infer<typeof RunLiveSchema>
export const RunLiveGuardSchema = z.strictObject({ request: RunLiveSchema })

/**
 * 在调用方的提交里重读 Session 的权威状态：会话未归档，并且该 Run 是会话当前进行中的 Run。
 * 它只读，不授权、不写入，也不替调用方解释为什么需要这项检查。
 */
export function runLiveGuardFacts(request: RunLive): FactCommandV2 {
  return { participant: SESSION_RUN_LIVE_GUARD, facts: { request: { ...request } } }
}
