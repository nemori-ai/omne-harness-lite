import { isOk, parseTenantId, type TenantId } from '@omne-harness-lite/identity-values'
import {
  isGovernanceCenterId,
  type GovernanceCenterId,
} from '@omne-harness-lite/governance-center-entry'

export interface HomeInput {
  readonly explicitHome?: string
  readonly environmentHome?: string
  readonly osHome: string
}
export interface TenantBinding {
  readonly formatVersion: 1
  readonly centerId: GovernanceCenterId
  readonly tenant: TenantId
}
export interface TenantPaths {
  readonly home: string
  readonly directory: string
  readonly binding: string
  readonly auth: string
  readonly clientState: string
  readonly credentials: string
  readonly data: string
  readonly runtime: string
  readonly sessions: string
  readonly assets: string
  readonly logs: string
  readonly cache: string
  readonly run: string
}
export class StateLayoutFailure extends Error {
  override readonly name = 'StateLayoutFailure'
  constructor(
    readonly reason:
      'invalid-home' | 'invalid-binding' | 'unsafe-path' | 'binding-mismatch' | 'unavailable',
  ) {
    super(`omne-state: ${reason}`)
  }
}
function hasBindingShape(
  value: unknown,
): value is { formatVersion: unknown; centerId: unknown; tenant: unknown } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return (
    Object.keys(value).length === 3 &&
    'formatVersion' in value &&
    'centerId' in value &&
    'tenant' in value
  )
}
export function checkedTenantBinding(value: unknown): TenantBinding {
  if (!hasBindingShape(value) || value.formatVersion !== 1)
    throw new StateLayoutFailure('invalid-binding')
  const tenant = parseTenantId(value.tenant)
  if (!isGovernanceCenterId(value.centerId) || !isOk(tenant))
    throw new StateLayoutFailure('invalid-binding')
  return { formatVersion: 1, centerId: value.centerId, tenant: tenant.ok }
}
