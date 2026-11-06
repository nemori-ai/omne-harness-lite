import { unique, validDefinition, validRule } from './definition.ts'
import {
  PermissionEvaluationSchema,
  type PermissionDefinition,
  type PermissionEvaluation,
  type PermissionInputFailure,
  type PermissionScope,
  type PermissionDefinitionRef,
} from './schema.ts'

const layers = ['organization', 'tenant', 'session'] as const
export type PermissionEvidence = {
  scope: PermissionScope
  definition: PermissionDefinitionRef
  capabilityId: string
  enforcementKey: string
  sourceRefs: string[]
  revisionVector: { axis: string; sourceRef: string; revision: string }[]
}
export type PermissionEvaluationResult =
  | ({
      kind: 'effective'
      value: string
      permitsOperation: boolean
      allowedSet: string[]
      selection: 'pick' | 'nearest'
    } & PermissionEvidence)
  | ({
      kind: 'denied'
      reason: 'active-prohibition' | 'empty-bound'
      allowedSet: string[] | null
    } & PermissionEvidence)
  | ({ kind: 'unavailable'; missingBasis: string[] } & PermissionEvidence)
  | PermissionInputFailure

function same<T>(left: T, right: T): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
function validSourceBindings(input: PermissionEvaluation): boolean {
  for (const layer of layers) {
    const source = input.sources[layer]
    if (source.kind !== 'available') continue
    if (!same(source.scope, input.scope) || !same(source.definition, input.definition)) return false
    if (layer === 'organization' && input.scope.organizationId === null) return false
    if (layer === 'session' && input.scope.sessionId === null) return false
  }
  return true
}
function validBindings(input: PermissionEvaluation): boolean {
  if (!validSourceBindings(input)) return false
  return input.constraints.every(
    constraint =>
      constraint.kind !== 'available' ||
      (same(constraint.scope, input.scope) &&
        constraint.capabilityId === input.capabilityId &&
        constraint.enforcementKey === input.enforcementKey),
  )
}
function validRules(input: PermissionEvaluation, definition: PermissionDefinition): boolean {
  const ids = definition.values.map(value => value.id)
  const sourcesValid = layers.every(layer => {
    const source = input.sources[layer]
    return (
      source.kind !== 'available' ||
      (definition.assignmentLayers.includes(layer) && validRule(source.rule, ids))
    )
  })
  const boundsValid = input.constraints.every(
    constraint =>
      constraint.kind !== 'available' ||
      constraint.effect.kind !== 'bound' ||
      validRule({ pick: null, allowedSet: constraint.effect.allowedSet }, ids),
  )
  return sourcesValid && boundsValid
}
function validate(input: PermissionEvaluation): PermissionInputFailure | undefined {
  if (!validBindings(input)) return { kind: 'invalid-input', reason: 'binding' }
  if (
    !unique(input.requiredConstraintIds) ||
    !unique(input.constraints.map(constraint => constraint.id))
  )
    return { kind: 'invalid-input', reason: 'rule' }
  if (input.declaration.kind !== 'available') return undefined
  const definition = input.declaration.definition
  if (!validDefinition(definition)) return { kind: 'invalid-input', reason: 'definition' }
  if (
    !same(definition.reference, input.definition) ||
    definition.capabilityId !== input.capabilityId ||
    definition.enforcementKey !== input.enforcementKey
  )
    return { kind: 'invalid-input', reason: 'binding' }
  return validRules(input, definition) ? undefined : { kind: 'invalid-input', reason: 'rule' }
}
function evidence(input: PermissionEvaluation): PermissionEvidence {
  const revisionVector = [
    { axis: 'adoption', sourceRef: input.scope.logicalServiceId, revision: input.adoptionRevision },
    { axis: 'target', sourceRef: input.scope.targetId, revision: input.targetRevision },
  ]
  if (input.declaration.kind === 'available')
    revisionVector.push({
      axis: 'definition',
      sourceRef: input.definition.itemId,
      revision: input.definition.revision,
    })
  for (const layer of layers) {
    const source = input.sources[layer]
    if (source.kind === 'unavailable') continue
    revisionVector.push({
      axis: layer,
      sourceRef: source.kind === 'absent' ? layer : source.sourceRef,
      revision: source.revision,
    })
  }
  for (const constraint of input.constraints) {
    if (constraint.kind === 'available')
      revisionVector.push({
        axis: `constraint/${constraint.id}`,
        sourceRef: constraint.sourceRef,
        revision: constraint.revision,
      })
  }
  return {
    scope: input.scope,
    definition: input.definition,
    capabilityId: input.capabilityId,
    enforcementKey: input.enforcementKey,
    sourceRefs: [...new Set(revisionVector.map(entry => entry.sourceRef))],
    revisionVector,
  }
}
function missingSources(input: PermissionEvaluation): string[] {
  const missing: string[] = []
  if (input.declaration.kind === 'unavailable')
    missing.push(`declaration/${input.declaration.sourceRef}`)
  for (const layer of layers) if (input.sources[layer].kind === 'unavailable') missing.push(layer)
  for (const id of input.requiredConstraintIds)
    if (
      !input.constraints.some(constraint => constraint.id === id && constraint.kind === 'available')
    )
      missing.push(`constraint/${id}`)
  for (const constraint of input.constraints)
    if (constraint.kind === 'unavailable' && !missing.includes(`constraint/${constraint.id}`))
      missing.push(`constraint/${constraint.id}`)
  return missing
}
function knownRules(input: PermissionEvaluation) {
  const defaults =
    input.declaration.kind === 'available' ? [input.declaration.definition.defaultRule] : []
  return [
    ...defaults,
    ...layers.flatMap(layer => {
      const source = input.sources[layer]
      return source.kind === 'available' ? [source.rule] : []
    }),
  ]
}
function activeProhibition(input: PermissionEvaluation): boolean {
  if (
    input.constraints.some(
      constraint => constraint.kind === 'available' && constraint.effect.kind === 'prohibition',
    )
  )
    return true
  if (input.declaration.kind !== 'available') return false
  const denied = input.declaration.definition.values
    .filter(value => !value.permitsOperation)
    .map(value => value.id)
  return layers.some(layer => {
    const source = input.sources[layer]
    return (
      source.kind === 'available' && source.rule.pick !== null && denied.includes(source.rule.pick)
    )
  })
}
function allowedValues(input: PermissionEvaluation): string[] | undefined {
  const bounds = knownRules(input).flatMap(rule =>
    rule.allowedSet === null ? [] : [rule.allowedSet],
  )
  for (const constraint of input.constraints)
    if (constraint.kind === 'available' && constraint.effect.kind === 'bound')
      bounds.push(constraint.effect.allowedSet)
  if (bounds.some(bound => bound.length === 0)) return []
  const universe =
    input.declaration.kind === 'available'
      ? input.declaration.definition.values.map(value => value.id)
      : bounds[0]
  return universe?.filter(value => bounds.every(bound => bound.includes(value)))
}
function nearest(
  definition: PermissionDefinition,
  allowed: string[],
  anchor: string,
): string | undefined {
  const comparison = definition.comparison
  if (comparison === null) return undefined
  const ids = definition.values.map(value => value.id)
  const anchorIndex = ids.indexOf(anchor)
  let best: { value: string; distance: number; rank: number } | undefined
  for (const value of allowed) {
    const distance = comparison.distances[ids.indexOf(value)]?.[anchorIndex]
    if (distance === undefined) return undefined
    const rank = comparison.strictOrder.indexOf(value)
    if (!best || distance < best.distance || (distance === best.distance && rank < best.rank))
      best = { value, distance, rank }
  }
  return best?.value
}
function select(
  input: PermissionEvaluation,
  definition: PermissionDefinition,
  allowedSet: string[],
  basis: PermissionEvidence,
): PermissionEvaluationResult {
  const picks = knownRules(input)
    .flatMap(rule => (rule.pick === null ? [] : [rule.pick]))
    .reverse()
  const legal = picks.find(value => allowedSet.includes(value))
  const anchor = picks[0]
  const value =
    legal ?? (anchor === undefined ? undefined : nearest(definition, allowedSet, anchor))
  if (value === undefined) return { kind: 'unavailable', missingBasis: ['comparison'], ...basis }
  const option = definition.values.find(option => option.id === value)
  if (!option) return { kind: 'unavailable', missingBasis: ['comparison'], ...basis }
  return {
    kind: 'effective',
    value,
    permitsOperation: option.permitsOperation,
    allowedSet,
    selection: legal === undefined ? 'nearest' : 'pick',
    ...basis,
  }
}
export function evaluatePermission(input: unknown): PermissionEvaluationResult {
  const parsed = PermissionEvaluationSchema.safeParse(input)
  if (!parsed.success) return { kind: 'invalid-input', reason: 'structure' }
  const material = parsed.data
  const invalid = validate(material)
  if (invalid) return invalid
  const basis = evidence(material)
  const allowedSet = allowedValues(material)
  if (activeProhibition(material))
    return {
      kind: 'denied',
      reason: 'active-prohibition',
      allowedSet: allowedSet ?? null,
      ...basis,
    }
  if (allowedSet?.length === 0)
    return { kind: 'denied', reason: 'empty-bound', allowedSet, ...basis }
  const missingBasis = missingSources(material)
  if (missingBasis.length > 0) return { kind: 'unavailable', missingBasis, ...basis }
  if (material.declaration.kind !== 'available' || allowedSet === undefined)
    return { kind: 'unavailable', missingBasis: ['declaration'], ...basis }
  return select(material, material.declaration.definition, allowedSet, basis)
}
