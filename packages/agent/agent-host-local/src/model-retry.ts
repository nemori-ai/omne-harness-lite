import { randomInt } from 'node:crypto'
import type { AgentModelRetrying } from '@omne-harness/agent'

const RANDOM_SPAN = 2 ** 47

export function cryptoRandom(): number {
  return randomInt(RANDOM_SPAN) / RANDOM_SPAN
}

export function modelRetryingRecord(
  event: AgentModelRetrying,
  tenantText: string | undefined,
): string {
  const tenant = tenantText ?? 'unknown'
  return (
    `agent run retries the model: tenant=${tenant} instance=${event.instance} ` +
    `execution=${event.execution} step=${event.step} attempt=${event.attempt} ` +
    `fault=${event.fault.cause} diagnostic=${event.fault.diagnostic} notBefore=${event.notBefore}`
  )
}
