import { randomUUID } from 'node:crypto'
import { fail, succeed } from '@omne-harness/operation-result'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ToolHistoryCallSource } from '@omne-harness/tool'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { HISTORY_SCAN_HANDLER, parseHistoryScan, type HistoryScan } from './history-scan-wire.ts'
import type { SqlToolStorageOptions } from './options.ts'
import { resolveTenant, tenantText } from './tenant.ts'
import { PROTOCOL } from './worker/schema.ts'
import { isObject } from './worker/support.ts'

const invalid = () =>
  fail({ kind: 'invalid' as const, field: 'scan', reason: 'invalid-history-page' })
const unavailable = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency: 'history-inventory', diagnostic })

function requestOf(input: Parameters<ToolHistoryCallSource['scan']>[0]): HistoryScan | null {
  const tenant = tenantText(input.tenant)
  if (tenant === null) return null
  let after: unknown = null
  if (input.after !== null) {
    try {
      const cursor: unknown = JSON.parse(input.after)
      if (
        cursor === null ||
        typeof cursor !== 'object' ||
        Array.isArray(cursor) ||
        Reflect.get(cursor, 'version') !== 1 ||
        Reflect.get(cursor, 'tenant') !== tenant ||
        'failure' in decodeToolCallId(Reflect.get(cursor, 'after'))
      )
        return null
      after = Reflect.get(cursor, 'after')
    } catch {
      return null
    }
  }
  return parseHistoryScan({ tenant, after, limit: input.limit })
}

function pageOf(output: JsonValue, request: HistoryScan) {
  if (
    !isObject(output) ||
    !Array.isArray(output['calls']) ||
    output['calls'].length > request.limit ||
    typeof output['more'] !== 'boolean' ||
    (output['more'] && output['calls'].length !== request.limit)
  )
    return unavailable('invalid historical inventory page')
  const calls = []
  let last = request.after ?? ''
  for (const value of output['calls']) {
    const call = decodeToolCallId(value)
    if ('failure' in call || Buffer.compare(Buffer.from(call.ok), Buffer.from(last)) <= 0)
      return unavailable('invalid historical inventory call order')
    calls.push(call.ok)
    last = call.ok
  }
  return succeed({
    calls,
    next: output['more']
      ? JSON.stringify({ version: 1, tenant: request.tenant, after: last })
      : null,
  })
}

export function createSqlToolHistoryCallSource(
  options: SqlToolStorageOptions,
): ToolHistoryCallSource {
  return {
    async scan(input) {
      const request = requestOf(input)
      if (request === null) return invalid()
      try {
        const resolved = await resolveTenant(options, input.tenant)
        if (resolved.kind !== 'ready') return unavailable(resolved.diagnostic)
        if (resolved.at.tenant !== request.tenant) return invalid()
        const answer = await options.storage.read({
          domain: resolved.at.domain,
          handler: HISTORY_SCAN_HANDLER,
          protocol: PROTOCOL,
          requestKey: randomUUID(),
          input: request,
        })
        return answer.kind === 'read'
          ? pageOf(answer.output, request)
          : unavailable(`history scan: ${answer.kind}`)
      } catch {
        return unavailable('historical inventory read failed')
      }
    },
  }
}
