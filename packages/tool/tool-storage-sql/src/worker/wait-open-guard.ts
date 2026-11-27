import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { TOOL_WAIT_OPEN_FACT, TOOL_WAIT_OPEN_GUARD, type WaitOpen } from '../wait-open.ts'
import { isObject, oneRow, packed } from './support.ts'

const conflict = (reason: string) => ({ kind: 'conflict', basis: { reason } }) as const
const OPEN: ReadonlySet<unknown> = new Set(['opening', 'open'])

function requestOf(facts: unknown): WaitOpen | undefined {
  const request = isObject(facts as never) ? (facts as { request?: unknown }).request : undefined
  if (typeof request !== 'object' || request === null) return undefined
  const { tenant, call, wait } = request as Record<string, unknown>
  return typeof tenant === 'string' && typeof call === 'string' && typeof wait === 'string'
    ? { tenant, call, wait }
    : undefined
}

export default {
  participant: TOOL_WAIT_OPEN_GUARD,
  protocol: '1',
  execute(facts, port) {
    const request = requestOf(facts)
    if (request === undefined) return { kind: 'unsupported', basis: { reason: 'wait-open-input' } }
    const row = oneRow(
      port,
      'SELECT record FROM tl_record WHERE tenant = ? AND kind = ? AND name = ? AND key = ? LIMIT 1',
      [request.tenant, 'call', request.call, `wait:${request.wait}`],
    )
    if (row === undefined) return conflict('wait-absent')
    const stored = JSON.parse(packed(row['record'])) as { wait?: { record?: { phase?: unknown } } }
    if (!OPEN.has(stored.wait?.record?.phase)) return conflict('wait-closed')
    port.provideFact(TOOL_WAIT_OPEN_FACT, request)
    return { kind: 'participated', response: request }
  },
} satisfies ParticipantModule
