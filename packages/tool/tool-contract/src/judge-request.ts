import { decodeScopeRef, type ScopeRef } from '@omne-harness/runtime-context-contract'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  FixedToolRequest,
  ResourceScope,
  ToolAvailability,
  ToolAvailabilityReference,
  ToolInvocation,
  ToolInvokeRequest,
} from './definitions.ts'
import { toolCallLabel } from './call-label.ts'
import { toolDefinition } from './judge-definition.ts'
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
import { adoption, consumerRef, durableEvidence, sourceLayer, workspaceId } from './value-shapes.ts'

const nonNegativeSafeInteger: Check<number> = (value, at) => {
  if (typeof value !== 'number') return reject(at, 'type')
  return Number.isSafeInteger(value) && value >= 0 ? succeed(value) : reject(at, 'range')
}

const availability: Check<ToolAvailability> = variant('kind', {
  available: record({
    kind: literal('available'),
    definition: toolDefinition,
    executor: adoption,
    layer: sourceLayer,
  }),
  'known-unavailable': record({
    kind: literal('known-unavailable'),
    definition: toolDefinition,
    reason: nonBlank,
  }),
})

const availabilityReference: Check<ToolAvailabilityReference> = variant('kind', {
  available: record({
    kind: literal('available'),
    definition: adoption,
    name: nonBlank,
    executor: adoption,
    layer: sourceLayer,
  }),
  'known-unavailable': record({
    kind: literal('known-unavailable'),
    definition: adoption,
    name: nonBlank,
    reason: nonBlank,
  }),
})

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

const callFields = {
  command: nullable(filled),
  arguments: toolArguments,
  label: toolCallLabel,
  settings: adoption,
  context: adoption,
  workspace: nullable(workspaceId),
  requesterScope,
  resources: list(adoption),
  scope,
  consumer: consumerRef,
  batchDecision: nullable(durableEvidence),
  mode: literal('foreground', 'background'),
  limits,
} as const

type RequestDefinition =
  | Readonly<{ kind: 'function' }>
  | Readonly<{
      kind: 'commands'
      commands: readonly Readonly<{ name: string; background?: unknown }>[]
    }>
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

/** A command that may go to the background carries an intent in its label. */
function labelRule(
  definition: RequestDefinition,
  request: Pick<ToolInvokeRequest, 'command' | 'label'>,
  at: string,
): ShapeRejection | undefined {
  const background =
    definition.kind === 'commands' &&
    definition.commands.some(
      entry => entry.name === request.command && entry.background !== undefined,
    )
  return background && request.label.intent === null
    ? { field: member(member(at, 'label'), 'intent'), reason: 'required' }
    : undefined
}

function requestRule(
  request: Pick<FixedToolRequest, 'availability' | 'command' | 'label'>,
  at: string,
): ShapeRejection | undefined {
  const definition: RequestDefinition = request.availability.definition
  return commandRule(definition, request.command, at) ?? labelRule(definition, request, at)
}

const fixedToolRequest: Check<FixedToolRequest> = refine(
  record({ ...callFields, availability, invocation }),
  requestRule,
)

const toolCall: Check<Omit<FixedToolRequest, 'invocation'>> = refine(
  record({ ...callFields, availability }),
  requestRule,
)

const invokeToolRequest: Check<ToolInvokeRequest> = record({
  ...callFields,
  availability: availabilityReference,
})

export function judgeFixedToolRequest(
  value: unknown,
): Outcome<FixedToolRequest, Readonly<{ field: string; reason: string }>> {
  return judgeUnknown(fixedToolRequest, value, 'FixedToolRequest')
}

export function judgeToolCall(
  value: unknown,
): Outcome<Omit<FixedToolRequest, 'invocation'>, Readonly<{ field: string; reason: string }>> {
  return judgeUnknown(toolCall, value, 'ToolCall')
}

export function judgeToolInvokeRequest(
  value: unknown,
): Outcome<ToolInvokeRequest, Readonly<{ field: string; reason: string }>> {
  return judgeUnknown(invokeToolRequest, value, 'ToolInvokeRequest')
}
