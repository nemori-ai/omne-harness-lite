import { z } from 'zod'
import type { FactCommandV2 } from '@omne-harness/sql-contract'

export const SESSION_EXECUTION_GUARD = 'session-execution-guard'
export const SESSION_EXECUTION_CURRENT_FACT = {
  key: 'session.execution-current',
  protocol: '1',
} as const
const text = z.string().min(1)
export const ExecutionCurrentSchema = z.strictObject({
  tenant: text,
  session: text,
  execution: text,
  revision: z.string().regex(/^(0|[1-9][0-9]{0,17})$/),
})
export type ExecutionCurrent = z.infer<typeof ExecutionCurrentSchema>
export const ExecutionCurrentGuardSchema = z.strictObject({ request: ExecutionCurrentSchema })

/** Rechecks an original owner's observation; it does not authorize or publish an execution. */
export function executionCurrentGuardFacts(request: ExecutionCurrent): FactCommandV2 {
  return { participant: SESSION_EXECUTION_GUARD, facts: { request: { ...request } } }
}
