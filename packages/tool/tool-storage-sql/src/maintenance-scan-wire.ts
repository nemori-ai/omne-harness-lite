import { decodeToolMaterialInstant } from '@omne-harness/tool-contract/provider'

export const MAINTENANCE_PAGE_LIMIT = 128
export const MAINTENANCE_READ_HANDLER = 'tool.material.maintenance'

export type MaintenanceScan = Readonly<{
  tenant: string
  at: string
  after: string
  through: string | null
  limit: number
}>

export function maintenanceOrdinal(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^(0|[1-9][0-9]{0,18})$/.test(value) &&
    BigInt(value) <= 9223372036854775807n
  )
}

export function parseMaintenanceScan(value: unknown): MaintenanceScan | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const tenant: unknown = Reflect.get(value, 'tenant')
  const at: unknown = Reflect.get(value, 'at')
  const after: unknown = Reflect.get(value, 'after')
  const through: unknown = Reflect.get(value, 'through')
  const limit: unknown = Reflect.get(value, 'limit')
  if (
    typeof tenant !== 'string' ||
    tenant === '' ||
    typeof at !== 'string' ||
    'failure' in decodeToolMaterialInstant(at) ||
    !maintenanceOrdinal(after) ||
    (through !== null && !maintenanceOrdinal(through)) ||
    (through !== null && BigInt(after) > BigInt(through)) ||
    typeof limit !== 'number' ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAINTENANCE_PAGE_LIMIT
  )
    return null
  return { tenant, at, after, through, limit }
}
