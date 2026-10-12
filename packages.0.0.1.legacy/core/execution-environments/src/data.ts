import {
  copyJsonValue,
  isJsonNumber,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  tenantIdEquals,
} from '@omne-harness-lite/identity-values'
import type { ContextScope } from '@omne-harness-lite/runtime-context'
import type {
  EnvironmentDescription,
  EnvironmentAdoption,
  EnvironmentReference,
  EnvironmentRequirement,
} from './execution-environments.ts'
import type {
  EnvironmentBinding,
  EnvironmentCall,
  EnvironmentContinuity,
  EnvironmentPlacement,
} from './placement.ts'

function object(value: JsonValue): value is JsonObject {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}
function record(input: unknown, keys: readonly string[]): JsonObject | undefined {
  const copied = copyJsonValue(input)
  if ('failed' in copied) return undefined
  const value = copied.ok
  return object(value) && Object.keys(value).every(key => keys.includes(key)) ? value : undefined
}
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0
export function captureEnvironmentScope(input: unknown): ContextScope | undefined {
  const value = record(input, ['tenant', 'session'])
  if (!value) return undefined
  const tenant = parseTenantId(value.tenant),
    session = parseOpaqueIdentifier(value.session, 'SessionRef')
  return 'ok' in tenant && 'ok' in session
    ? Object.freeze({ tenant: Object.freeze(tenant.ok), session: session.ok })
    : undefined
}
export function sameEnvironmentScope(a: ContextScope, b: ContextScope): boolean {
  return a.session === b.session && tenantIdEquals(a.tenant, b.tenant)
}
export function captureEnvironmentReference(input: unknown): EnvironmentReference | undefined {
  const value = record(input, ['provider', 'reference'])
  return value && text(value.provider) && value.reference !== undefined
    ? Object.freeze({ provider: value.provider, reference: value.reference })
    : undefined
}
export function captureEnvironmentRequirement(input: unknown): EnvironmentRequirement | undefined {
  const value = record(input, ['bindingLayer', 'facilities'])
  if (
    !value ||
    !Array.isArray(value.facilities) ||
    !value.facilities.every(text) ||
    new Set(value.facilities).size !== value.facilities.length
  )
    return undefined
  const layer = value.bindingLayer
  return layer === 'host_machine' ||
    layer === 'stateless_sandbox' ||
    layer === 'session_sandbox' ||
    layer === 'tenant_sandbox'
    ? Object.freeze({ bindingLayer: layer, facilities: Object.freeze([...value.facilities]) })
    : undefined
}
export function captureEnvironmentCall(input: unknown): EnvironmentCall | undefined {
  const value = record(input, ['tool', 'execution'])
  const tool = value && record(value.tool, ['name', 'definition']),
    execution = parseOpaqueIdentifier(value?.execution, 'CallId')
  return value && tool && text(tool.name) && text(tool.definition) && 'ok' in execution
    ? Object.freeze({
        tool: Object.freeze({ name: tool.name, definition: tool.definition }),
        execution: execution.ok,
      })
    : undefined
}
export function captureEnvironmentPlacement(input: unknown): EnvironmentPlacement | undefined {
  const value = record(input, [
    'scope',
    'tool',
    'execution',
    'requirement',
    'permission',
    'revision',
    'evidence',
  ])
  if (!value) return undefined
  const scope = captureEnvironmentScope(value.scope),
    call = captureEnvironmentCall({ tool: value.tool, execution: value.execution }),
    requirement = captureEnvironmentRequirement(value.requirement)
  const permission = value.permission
  return scope &&
    call &&
    requirement &&
    text(value.revision) &&
    value.evidence !== undefined &&
    (permission === 'always-allow' || permission === 'auto_place' || permission === 'never-allow')
    ? Object.freeze({
        scope,
        ...call,
        requirement,
        permission,
        revision: value.revision,
        evidence: value.evidence,
      })
    : undefined
}
function binding(input: unknown): EnvironmentBinding | undefined {
  const value = record(input, ['kind', 'scope', 'execution', 'tenant'])
  if (!value) return undefined
  if (value.kind === 'host_machine')
    return Object.keys(value).length === 1 ? { kind: value.kind } : undefined
  if (value.kind === 'tenant_sandbox') {
    const tenant = parseTenantId(value.tenant)
    return Object.keys(value).length === 2 && 'ok' in tenant
      ? { kind: value.kind, tenant: Object.freeze(tenant.ok) }
      : undefined
  }
  const scope = captureEnvironmentScope(value.scope)
  if (!scope) return undefined
  if (value.kind === 'session_sandbox')
    return Object.keys(value).length === 2 ? { kind: value.kind, scope } : undefined
  const execution = parseOpaqueIdentifier(value.execution, 'CallId')
  return value.kind === 'stateless_sandbox' && Object.keys(value).length === 3 && 'ok' in execution
    ? { kind: value.kind, scope, execution: execution.ok }
    : undefined
}
function continuity(input: unknown): EnvironmentContinuity | undefined {
  const value = record(input, ['kind', 'data', 'revision', 'previous'])
  if (!value) return undefined
  if (value.kind === 'notGuaranteed')
    return Object.keys(value).length === 1 ? { kind: value.kind } : undefined
  if (value.kind === 'continuous')
    return Object.keys(value).length === 3 && text(value.data) && text(value.revision)
      ? { kind: value.kind, data: value.data, revision: value.revision }
      : undefined
  return value.kind === 'lost' && Object.keys(value).length === 2 && text(value.previous)
    ? { kind: value.kind, previous: value.previous }
    : undefined
}
export function captureEnvironmentDescription(input: unknown): EnvironmentDescription | undefined {
  const value = record(input, [
    'reference',
    'bindingLayer',
    'facilities',
    'instance',
    'binding',
    'continuity',
  ])
  if (!value) return undefined
  const reference = captureEnvironmentReference(value.reference),
    requirement = captureEnvironmentRequirement({
      bindingLayer: value.bindingLayer,
      facilities: value.facilities,
    }),
    instance = record(value.instance, ['id', 'generation']),
    bound = binding(value.binding),
    data = continuity(value.continuity)
  if (
    !reference ||
    !requirement ||
    !instance ||
    !text(instance.id) ||
    !text(instance.generation) ||
    !bound ||
    bound.kind !== requirement.bindingLayer ||
    !data
  )
    return undefined
  // Runtime validation establishes the dependent bindingLayer/binding pair.
  return Object.freeze({
    ...requirement,
    reference,
    instance: Object.freeze({ id: instance.id, generation: instance.generation }),
    binding: Object.freeze(bound),
    continuity: Object.freeze(data),
  }) as EnvironmentDescription
}
/** Queries expose only instances in the requested tenant/session (or a shared host). */
export function environmentVisibleInScope(
  description: EnvironmentDescription,
  scope: ContextScope,
): boolean {
  const bound = description.binding
  switch (bound.kind) {
    case 'host_machine':
      return true
    case 'tenant_sandbox':
      return tenantIdEquals(bound.tenant, scope.tenant)
    case 'session_sandbox':
    case 'stateless_sandbox':
      return sameEnvironmentScope(bound.scope, scope)
  }
}
/** This checks original ownership only. Permission and candidate selection remain separate. */
export function environmentBelongsTo(
  description: EnvironmentDescription,
  scope: ContextScope,
  call: EnvironmentCall,
): boolean {
  return (
    environmentVisibleInScope(description, scope) &&
    (description.binding.kind !== 'stateless_sandbox' ||
      description.binding.execution === call.execution)
  )
}

/** Mechanical AND match; permission, ownership and strategy must be checked separately. */
export function matchesEnvironmentRequirement(
  description: EnvironmentDescription,
  requirement: EnvironmentRequirement,
): boolean {
  return (
    description.bindingLayer === requirement.bindingLayer &&
    requirement.facilities.every(name => description.facilities.includes(name))
  )
}

function capturePlacementSource(input: unknown): EnvironmentAdoption['source'] | undefined {
  const source = record(input, ['name', 'generation'])
  return source && text(source.name) && text(source.generation)
    ? Object.freeze({ name: source.name, generation: source.generation })
    : undefined
}
/** Checks represented adoption data. Shape alone does not prove the issuing authority. */
export function captureEnvironmentAdoption(input: unknown): EnvironmentAdoption | undefined {
  const value = record(input, ['placement', 'source', 'description', 'providerEvidence'])
  if (!value || value.providerEvidence === undefined) return undefined
  const placement = captureEnvironmentPlacement(value.placement),
    description = captureEnvironmentDescription(value.description),
    source = capturePlacementSource(value.source)
  if (!placement || !description || !source) return undefined
  if (
    !environmentBelongsTo(description, placement.scope, placement) ||
    !matchesEnvironmentRequirement(description, placement.requirement) ||
    (placement.permission === 'never-allow' && description.bindingLayer === 'host_machine')
  )
    return undefined
  return Object.freeze({
    placement,
    description,
    source,
    providerEvidence: value.providerEvidence,
  })
}
