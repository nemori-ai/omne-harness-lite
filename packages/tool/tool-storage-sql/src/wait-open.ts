import type { FactCommandV2 } from '@omne-harness/sql-contract'

export const TOOL_WAIT_OPEN_GUARD = 'tool.wait-open'
export const TOOL_WAIT_OPEN_FACT = { key: 'tool.wait-open', protocol: '1' } as const

/** One wait of one call of a tenant, by the identities the ledger keeps it under. */
export type WaitOpen = Readonly<{ tenant: string; call: string; wait: string }>

/** Holds a commit to the wait being open: a card of it is registered and answered only while the call still waits. */
export function toolWaitOpenGuardFacts(request: WaitOpen): FactCommandV2 {
  return { participant: TOOL_WAIT_OPEN_GUARD, facts: { request: { ...request } } }
}
