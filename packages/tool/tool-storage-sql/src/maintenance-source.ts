import { randomUUID } from 'node:crypto'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolMaterialMaintenanceSource } from '@omne-harness/tool'
import type { JsonValue } from '@omne-harness/sql-contract'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { decodeToolMaterialInstant } from '@omne-harness/tool-contract/provider'
import {
  MAINTENANCE_READ_HANDLER,
  maintenanceOrdinal,
  parseMaintenanceScan,
  type MaintenanceScan,
} from './maintenance-scan-wire.ts'
import type { SqlToolStorageOptions } from './options.ts'
import { resolveTenant, tenantText } from './tenant.ts'
import { PROTOCOL } from './worker/schema.ts'
import { isObject } from './worker/support.ts'

const unavailable = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency: 'material-maintenance', diagnostic })
const invalid = () =>
  fail({ kind: 'invalid' as const, field: 'scan', reason: 'invalid-maintenance-page' })

function scanRequest(
  input: Parameters<ToolMaterialMaintenanceSource['scan']>[0],
): MaintenanceScan | null {
  const tenant = tenantText(input.tenant)
  const instant = decodeToolMaterialInstant(input.at)
  if (tenant === null || 'failure' in instant) return null
  let position: unknown = {
    tenant,
    at: instant.ok,
    after: '0',
    through: null,
    limit: input.limit,
  }
  if (input.after !== null) {
    if (typeof input.after !== 'string') return null
    try {
      const cursor: unknown = JSON.parse(input.after)
      if (cursor === null || typeof cursor !== 'object' || Reflect.get(cursor, 'version') !== 1)
        return null
      position = { ...cursor, limit: input.limit }
    } catch {
      return null
    }
  }
  const request = parseMaintenanceScan(position)
  if (
    request === null ||
    request.tenant !== tenant ||
    request.at !== instant.ok ||
    (input.after !== null && request.through === null)
  )
    return null
  return request
}

function scanPage(output: JsonValue, request: MaintenanceScan) {
  if (
    !isObject(output) ||
    !Array.isArray(output['calls']) ||
    output['calls'].length > request.limit ||
    !maintenanceOrdinal(output['after']) ||
    !maintenanceOrdinal(output['through']) ||
    typeof output['more'] !== 'boolean' ||
    BigInt(output['after']) < BigInt(request.after) ||
    BigInt(output['after']) > BigInt(output['through']) ||
    (request.through !== null && output['through'] !== request.through) ||
    (output['more'] && BigInt(output['after']) <= BigInt(request.after))
  )
    return unavailable('invalid maintenance scan output')
  const calls = []
  for (const value of output['calls']) {
    const call = decodeToolCallId(value)
    if ('failure' in call) return unavailable('invalid maintenance call identity')
    calls.push(call.ok)
  }
  return succeed({
    calls,
    next: output['more']
      ? JSON.stringify({
          version: 1,
          tenant: request.tenant,
          at: request.at,
          after: output['after'],
          through: output['through'],
        })
      : null,
  })
}

export function createSqlToolMaterialMaintenanceSource(
  options: SqlToolStorageOptions,
): ToolMaterialMaintenanceSource {
  return {
    async scan(input) {
      const request = scanRequest(input)
      if (request === null) return invalid()
      const resolved = await resolveTenant(options, input.tenant)
      if (resolved.kind !== 'ready') return unavailable(resolved.diagnostic)
      if (resolved.at.tenant !== request.tenant) return invalid()
      const answer = await options.storage.read({
        domain: resolved.at.domain,
        handler: MAINTENANCE_READ_HANDLER,
        protocol: PROTOCOL,
        requestKey: randomUUID(),
        input: request,
      })
      return answer.kind === 'read'
        ? scanPage(answer.output, request)
        : unavailable(`maintenance scan: ${answer.kind}`)
    },
  }
}
