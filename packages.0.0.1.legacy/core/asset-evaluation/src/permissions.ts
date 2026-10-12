import type { PermissionValue } from '@omne-harness-lite/asset-model'
import type {
  Layer,
  PermissionAssignment,
  PermissionClassification,
  PermissionDeclaration,
  TierOrder,
} from './types.ts'

const execution = Object.freeze(['auto', 'ask', 'forbid'])
const power = Object.freeze(['veto', 'rewrite', 'observe'])

export function tiersOf(declaration: PermissionDeclaration): TierOrder | null {
  const domain = declaration.domain.values
  if (domain.length === execution.length && execution.every(value => domain.includes(value)))
    return execution
  if (
    domain.length > 0 &&
    domain.includes('observe') &&
    domain.every(value => power.includes(value))
  )
    return power
  return null
}
export function classifyPermissionAssignment(
  declaration: PermissionDeclaration,
  assignment: PermissionAssignment,
): PermissionClassification {
  const tiers = tiersOf(declaration)
  const forbid =
    tiers === execution &&
    assignment.value.allowed.length === 1 &&
    assignment.value.allowed[0] === 'forbid'
  return Object.freeze({ role: assignment.immutable || forbid ? 'bound' : 'pick', tiers })
}
export function boundOf(
  declaration: PermissionDeclaration,
  bounds: readonly PermissionValue[],
): PermissionValue {
  return Object.freeze({
    allowed: Object.freeze(
      declaration.domain.values.filter(value =>
        bounds.every(bound => bound.allowed.includes(value)),
      ),
    ),
  })
}
export function pickWithinBound(pick: PermissionValue, bound: PermissionValue): boolean {
  return pick.allowed.length === 0 || pick.allowed.some(value => bound.allowed.includes(value))
}
export interface LayerPermissionAssignment extends PermissionAssignment {
  readonly layer: Layer
}
export interface PermissionResolution {
  readonly value: PermissionValue
  readonly from: Layer
  readonly lockedAt?: Layer
}
// S-23: bounds never serve as picks. A workspace strict value is an unowned factory bound.
export function resolvePermission(
  declaration: PermissionDeclaration,
  assignments: readonly LayerPermissionAssignment[],
  strict?: PermissionValue,
): PermissionResolution {
  const bounds = assignments.filter(
    assignment => classifyPermissionAssignment(declaration, assignment).role === 'bound',
  )
  const picks = assignments
    .filter(assignment => classifyPermissionAssignment(declaration, assignment).role === 'pick')
    .toReversed()
  if (strict === undefined)
    picks.push({ layer: 'factory', value: { allowed: [declaration.default] }, immutable: false })
  const bound = boundOf(declaration, [
    ...bounds.map(assignment => assignment.value),
    ...(strict === undefined ? [] : [strict]),
  ])
  const lockedAt = bounds[0]?.layer
  const picked = picks.find(pick => pickWithinBound(pick.value, bound))
  let value = bound
  let from = bounds.at(-1)?.layer ?? 'factory'
  if (picked !== undefined) {
    value = Object.freeze({
      allowed: Object.freeze(picked.value.allowed.filter(token => bound.allowed.includes(token))),
    })
    from = picked.layer
  } else {
    const tiers = tiersOf(declaration)
    const nearest = picks[0]
    if (tiers !== null && nearest !== undefined && bound.allowed.length > 0) {
      const distance = (token: string): number =>
        Math.min(
          ...nearest.value.allowed.map(pick =>
            Math.abs(tiers.indexOf(pick) - tiers.indexOf(token)),
          ),
        )
      const ordered = [...bound.allowed].sort(
        (left, right) =>
          distance(left) - distance(right) || tiers.indexOf(right) - tiers.indexOf(left),
      )
      const selected = ordered[0]
      if (selected === undefined) throw new Error('nonempty bound has no nearest tier')
      value = Object.freeze({ allowed: Object.freeze([selected]) })
    }
  }
  return Object.freeze({ value, from, ...(lockedAt === undefined ? {} : { lockedAt }) })
}
export function strictPermission(declaration: PermissionDeclaration): PermissionValue {
  const tiers = tiersOf(declaration)
  const allowed =
    declaration.item === 'usableBy'
      ? ['self']
      : tiers === execution
        ? ['ask']
        : tiers === power
          ? ['observe']
          : []
  return Object.freeze({ allowed: Object.freeze(allowed) })
}
