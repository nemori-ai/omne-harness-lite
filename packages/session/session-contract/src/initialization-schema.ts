import type { JsonValue } from '@omne-harness/json-text'
import type {
  InitializationAdoption,
  InitialAdoption,
  InitializationConsequence,
  InitializationGuardResult,
  InitializationGuardFacts,
} from './values.ts'
import type { Adoption, ResidentKey } from './identity.ts'
import type { ResidentTool } from './values.ts'
import type { GuardCommand, SessionCommand } from './ports.ts'
import { fromJsonValue, toJsonValue } from './entries.ts'
import { INITIALIZATION_RELEASE_DIGEST } from './release-digests.ts'
import {
  InitializationInvalid,
  adoption,
  evidence,
  json,
  list,
  material,
  object,
  result,
  text,
} from './initialization-parse.ts'
import { creationInput, planItem, tenantText } from './initialization-plan.ts'
import { registration } from './initialization-registration.ts'
import { requirements } from './initialization-requirements.ts'

export const INITIALIZATION_PROTOCOL: Adoption = Object.freeze({
  owner: '@omne-harness/session-contract',
  name: 'session-initialization',
  revision: '1',
  digest: INITIALIZATION_RELEASE_DIGEST,
})

export type {
  InitializationAdoption,
  InitialAdoption,
  InitializationConsequence,
  InitializationGuardResult,
  InitializationGuardFacts,
  InitializationFactReference,
} from './values.ts'

function resident(value: unknown): ResidentTool {
  const fields = object(value, ['capability', 'version', 'shape', 'admitted'])
  return {
    capability: text(fields['capability']),
    version: text(fields['version']),
    shape: json(fields['shape']),
    admitted: evidence(fields['admitted']),
  }
}

export function adoptionMaterial(value: unknown, initial: true): InitialAdoption
export function adoptionMaterial(value: unknown, initial: false): InitializationAdoption
export function adoptionMaterial(
  value: unknown,
  initial: boolean,
): InitializationAdoption | InitialAdoption {
  const fields = object(value, [
    'definitionName',
    'adopted',
    'source',
    'boundary',
    'inputSnapshot',
    'capabilities',
    'residentBindings',
    'newResidents',
    ...(initial ? ['candidate'] : []),
  ])
  const adopted: InitializationAdoption = {
    definitionName: text(fields['definitionName']),
    adopted: adoption(fields['adopted']),
    source: evidence(fields['source']),
    boundary: evidence(fields['boundary']),
    inputSnapshot: material(fields['inputSnapshot']),
    capabilities: material(fields['capabilities']),
    residentBindings: list(fields['residentBindings'], value => {
      const pair = object(value, ['capability', 'key'])
      return { capability: text(pair['capability']), key: text(pair['key']) as ResidentKey }
    }),
    newResidents: list(fields['newResidents'], resident),
  }
  for (const values of [adopted.residentBindings, adopted.newResidents])
    if (new Set(values.map(value => value.capability)).size !== values.length)
      throw new InitializationInvalid('duplicate resident capability')
  return initial ? { ...adopted, candidate: adoption(fields['candidate']) } : adopted
}

export function consequence(value: unknown): InitializationConsequence | null {
  if (value === null) return null
  if (typeof value !== 'object' || !('kind' in value))
    throw new InitializationInvalid('missing consequence kind')
  switch (value.kind) {
    case 'identity':
    case 'workspace-load': {
      const fields = object(value, ['kind', 'evidence'])
      return { kind: value.kind, evidence: evidence(fields['evidence']) }
    }
    case 'context-registration': {
      const fields = object(value, ['kind', 'prepared', 'decision'])
      return {
        kind: value.kind,
        prepared: evidence(fields['prepared']),
        decision: registration(fields['decision']),
      }
    }
    case 'execution-ready': {
      const fields = object(value, ['kind', 'evidence', 'adoption'])
      return {
        kind: value.kind,
        evidence: evidence(fields['evidence']),
        adoption: fields['adoption'] === null ? null : adoptionMaterial(fields['adoption'], false),
      }
    }
    default:
      throw new InitializationInvalid('unknown consequence kind')
  }
}

export function guardResult(value: unknown): InitializationGuardResult {
  const fields = object(value, ['owner', 'item', 'result', 'consequence'])
  return {
    owner: text(fields['owner']),
    item: text(fields['item']),
    result: result(fields['result']),
    consequence: consequence(fields['consequence']),
  }
}

export function parseInitializationFacts(guard: GuardCommand): InitializationGuardFacts {
  if (guard.owner !== 'session-initialization' || guard.participant !== 'session-evidence')
    throw new InitializationInvalid('wrong initialization participant')
  const protocol = adoption(guard.protocol)
  if (
    Object.keys(INITIALIZATION_PROTOCOL).some(
      key => protocol[key as keyof Adoption] !== INITIALIZATION_PROTOCOL[key as keyof Adoption],
    )
  )
    throw new InitializationInvalid('unsupported initialization protocol adoption')
  const fields = object(fromJsonValue(json(guard.facts)), [
    'version',
    'command',
    'binding',
    'input',
    'initialAdoption',
    'requirements',
    'plan',
    'results',
  ])
  if (
    fields['version'] !== 1 ||
    (fields['command'] !== 'create' && fields['command'] !== 'completeInitialization')
  )
    throw new InitializationInvalid('unsupported initialization facts version or command')
  const binding = object(fields['binding'], ['tenant', 'session', 'operation', 'createOperation'])
  return {
    version: 1,
    command: fields['command'],
    binding: {
      tenant: text(binding['tenant']),
      session: text(binding['session']),
      operation: text(binding['operation']),
      createOperation: text(binding['createOperation']),
    },
    input: json(fields['input']),
    initialAdoption:
      fields['initialAdoption'] === null ? null : adoptionMaterial(fields['initialAdoption'], true),
    requirements: fields['requirements'] === null ? null : requirements(fields['requirements']),
    plan: list(fields['plan'], planItem),
    results: list(fields['results'], guardResult),
  }
}

export function initializationCommandInput(
  command: Extract<SessionCommand, { kind: 'create' | 'completeInitialization' }>,
): JsonValue {
  return toJsonValue({
    ...command.input,
    tenant: tenantText(command.input.tenant),
    ...(command.kind === 'create'
      ? { creation: fromJsonValue(creationInput(command.input.creation)) }
      : {}),
  })
}

export type { InitializationResultRecord, InitializationState } from './values.ts'
