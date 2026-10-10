import { copyJsonValue, isNonNegativeJsonInteger } from '@omne-harness-lite/content-blocks'
import { addInteger, compareInteger } from '@omne-harness-lite/session-log'
import type { OriginalIssueAdmission } from '@omne-harness-lite/model-request-runtime'
import type { SourceToken } from '@omne-harness-lite/session-log'
type Receipt = Awaited<ReturnType<OriginalIssueAdmission['admitOriginal']>>
/** The claim is opaque. No accessors or malformed success can authorize model IO. */
export function originalIssueReceipt(raw: unknown, source: SourceToken): Receipt | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return
  const descriptors = Object.getOwnPropertyDescriptors(raw)
  if (Reflect.ownKeys(raw).some(key => typeof key !== 'string')) return
  if (Object.values(descriptors).some(item => !Object.hasOwn(item, 'value'))) return
  const value = Object.fromEntries(
    Object.entries(descriptors).map(([key, item]) => [key, item.value]),
  )
  if (
    Object.keys(value).length === 1 &&
    ['invalidInput', 'denied', 'staleAttempt', 'unavailable', 'conflict'].includes(value.kind)
  )
    return value as Receipt
  return confirmedReceipt(value, source)
}
function confirmedReceipt(
  value: Record<string, unknown>,
  source: SourceToken,
): Receipt | undefined {
  if (Object.keys(value).length !== 3 || value.confirmed !== true) return
  const positions = copyJsonValue(value.positions)
  if ('failed' in positions || !Array.isArray(positions.ok) || positions.ok.length !== 1) return
  const position = positions.ok[0]
  if (
    !isNonNegativeJsonInteger(position) ||
    compareInteger(position, addInteger(source.tail, 1)) !== 0
  )
    return
  if (value.claim === null || typeof value.claim !== 'object') return
  return {
    confirmed: true,
    positions: positions.ok as import('@omne-harness-lite/content-blocks').JsonNumber[],
    claim: value.claim as import('@omne-harness-lite/model-request-runtime').OriginalIssueClaim,
  }
}
