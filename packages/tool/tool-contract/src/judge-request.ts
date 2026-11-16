import { decodeScopeRef, type ScopeRef } from '@omne-harness/runtime-context-contract'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  FixedToolRequest,
  ResourceScope,
  ToolAvailability,
  ToolDefinition,
  ToolInvocation,
} from './definitions.ts'
import type { ToolInvokeRequest } from './operations.ts'
import { canonicalJsonText } from './dynamics.ts'
import { environmentDeclaration, toolDefinition } from './judge-definition.ts'
import { toolArguments } from './parameter-codec.ts'
import {
  filled,
  judgeUnknown,
  list,
  literal,
  member,
  nonBlank,
  nullable,
  positiveSafeInteger,
  record,
  refine,
  reject,
  variant,
  type Check,
  type ShapeRejection,
} from './shape.ts'
import {
  adoption,
  consumerRef,
  durableEvidence,
  sameAdoption,
  sourceLayer,
  workspaceId,
} from './value-shapes.ts'

const nonNegativeSafeInteger: Check<number> = (value, at) => {
  if (typeof value !== 'number') return reject(at, 'type')
  return Number.isSafeInteger(value) && value >= 0 ? succeed(value) : reject(at, 'range')
}

function availabilityFor<T>(definition: Check<T>) {
  return variant('kind', {
    available: record({
      kind: literal('available'),
      definition,
      executor: adoption,
      layer: sourceLayer,
    }),
    'known-unavailable': record({
      kind: literal('known-unavailable'),
      definition,
      reason: nonBlank,
    }),
  })
}
const availability: Check<ToolAvailability> = availabilityFor(toolDefinition)

const invocation: Check<ToolInvocation> = record({
  kind: literal('direct', 'programmatic'),
  source: durableEvidence,
})

const scope: Check<ResourceScope> = record({ owner: filled, key: filled, grant: durableEvidence })

const limits = record({
  concurrency: nullable(positiveSafeInteger),
  scopeBudget: nullable(positiveSafeInteger),
  foregroundMs: nullable(nonNegativeSafeInteger),
  backgroundAfterMs: nullable(nonNegativeSafeInteger),
})

// Copy data properties before calling RC's decoder; it must not observe input accessors.
const requesterScope: Check<ScopeRef> = (value, at) => {
  const seen = new Set<unknown>()
  const copy: Check<ScopeRef> = (source, field) => {
    if (seen.has(source)) return reject(field, 'cycle')
    seen.add(source)
    const shape = record({ ref: nonBlank }, { parent: copy })(source, field)
    if ('failure' in shape) return shape
    const decoded = decodeScopeRef(shape.ok)
    return 'ok' in decoded ? decoded : reject(field, decoded.failure.reason)
  }
  return copy(value, at)
}

const callerFields = {
  availability,
  command: nullable(filled),
  arguments: toolArguments,
  settings: adoption,
  context: adoption,
  workspace: nullable(workspaceId),
  environment: nullable(environmentDeclaration),
  requesterScope,
  resources: list(adoption),
  scope,
  consumer: consumerRef,
  batchDecision: nullable(durableEvidence),
  mode: literal('foreground', 'background'),
  limits,
} as const

type RequestDefinition = Pick<ToolDefinition, 'declarations'> &
  (
    | Readonly<{ kind: 'function' }>
    | Readonly<{ kind: 'commands'; commands: readonly Readonly<{ name: string }>[] }>
  )
function commandRule(
  definition: RequestDefinition,
  command: string | null,
  at: string,
): ShapeRejection | undefined {
  const field = member(at, 'command')
  if (definition.kind === 'function')
    return command === null ? undefined : { field, reason: 'not-a-command-tool' }
  if (command === null) return { field, reason: 'missing' }
  const known = definition.commands.some(entry => entry.name === command)
  return known ? undefined : { field, reason: 'unknown-command' }
}

function requestRule(
  request: Omit<ToolInvokeRequest, 'availability'> &
    Readonly<{ availability: Readonly<{ definition: RequestDefinition }> }>,
  at: string,
): ShapeRejection | undefined {
  const declared = request.availability.definition.declarations.environment
  const fixed = request.environment
  const matches =
    declared === null || fixed === null
      ? declared === fixed
      : sameAdoption(declared.adoption, fixed.adoption) &&
        canonicalJsonText(declared.value) === canonicalJsonText(fixed.value)
  return matches
    ? commandRule(request.availability.definition, request.command, at)
    : { field: member(at, 'environment'), reason: 'definition-mismatch' }
}

const fixedToolRequest: Check<FixedToolRequest> = refine(
  record({ ...callerFields, invocation }),
  requestRule,
)

const invokeToolRequest: Check<ToolInvokeRequest> = refine(record(callerFields), requestRule)

export function judgeFixedToolRequest(
  value: unknown,
): Outcome<FixedToolRequest, Readonly<{ field: string; reason: string }>> {
  return judgeUnknown(fixedToolRequest, value, 'FixedToolRequest')
}

export function judgeToolInvokeRequest(
  value: unknown,
): Outcome<ToolInvokeRequest, Readonly<{ field: string; reason: string }>> {
  return judgeUnknown(invokeToolRequest, value, 'ToolInvokeRequest')
}
