import { z } from 'zod'
import type { FactCommandV2 } from '@omne-harness/sql-contract'

export const SESSION_RUN_LIVE_GUARD = 'session.run-live'
export const SESSION_RUN_LIVE_FACT = { key: 'session.run-live', protocol: '1' } as const
const text = z.string().min(1)
export const RunLiveSchema = z.strictObject({ tenant: text, session: text, run: text })
export type RunLive = z.infer<typeof RunLiveSchema>
export const RunLiveGuardSchema = z.strictObject({ request: RunLiveSchema })

export function runLiveGuardFacts(request: RunLive): FactCommandV2 {
  return { participant: SESSION_RUN_LIVE_GUARD, facts: { request: { ...request } } }
}
