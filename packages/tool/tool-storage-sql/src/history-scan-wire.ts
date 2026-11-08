import { decodeToolCallId } from '@omne-harness/tool-contract'

export const HISTORY_SCAN_HANDLER = 'tool.history.calls'
export const HISTORY_SCAN_LIMIT = 128
export type HistoryScan = Readonly<{ tenant: string; after: string | null; limit: number }>

export function parseHistoryScan(value: unknown): HistoryScan | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const tenant: unknown = Reflect.get(value, 'tenant')
  const after: unknown = Reflect.get(value, 'after')
  const limit: unknown = Reflect.get(value, 'limit')
  if (
    typeof tenant !== 'string' ||
    tenant === '' ||
    (after !== null && (typeof after !== 'string' || 'failure' in decodeToolCallId(after))) ||
    typeof limit !== 'number' ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > HISTORY_SCAN_LIMIT
  )
    return null
  return { tenant, after, limit }
}
