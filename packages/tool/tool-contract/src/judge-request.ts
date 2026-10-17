// The closed judgment of a fixed request (342 values, definitions and the fixed request; P02).
import { succeed, type Outcome } from '@omne-harness/kernel-basis'
import type {
  FixedToolRequest,
  ResourceScope,
  ToolAvailability,
  ToolDefinition,
  ToolInvocation,
} from './definitions.ts'
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
import { adoption, consumerRef, durableEvidence } from './value-shapes.ts'

/** A time limit is a non-negative finite integer of milliseconds (342 values). */
const nonNegativeSafeInteger: Check<number> = (value, at) => {
  if (typeof value !== 'number') return reject(at, 'type')
  return Number.isSafeInteger(value) && value >= 0 ? succeed(value) : reject(at, 'range')
}

const availability: Check<ToolAvailability> = variant('kind', {
  available: record({
    kind: literal('available'),
    definition: toolDefinition,
    executor: adoption,
  }),
  'known-unavailable': record({
    kind: literal('known-unavailable'),
    definition: toolDefinition,
    reason: nonBlank,
  }),
})

const invocation: Check<ToolInvocation> = record({
  kind: literal('direct', 'programmatic'),
  source: durableEvidence,
})

const scope: Check<ResourceScope> = variant('kind', {
  session: record({ kind: literal('session'), owner: filled, session: filled }),
  independent: record({ kind: literal('independent'), owner: filled, resource: filled }),
})

const limits = record({
  concurrency: nullable(positiveSafeInteger),
  foregroundMs: nullable(nonNegativeSafeInteger),
  backgroundAfterMs: nullable(nonNegativeSafeInteger),
})

/**
 * The command of a request selects one operation of the definition (P13). A function tool takes
 * no command. A multi-command tool needs a named command that it declares.
 */
function commandRule(
  definition: ToolDefinition,
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

const fixedToolRequest: Check<FixedToolRequest> = refine(
  record({
    availability,
    invocation,
    command: nullable(filled),
    arguments: toolArguments,
    settings: adoption,
    context: adoption,
    workspace: nullable(adoption),
    environment: adoption,
    resources: list(adoption),
    scope,
    consumer: consumerRef,
    batchDecision: nullable(durableEvidence),
    mode: literal('foreground', 'background'),
    limits,
  }),
  (request, at) => commandRule(request.availability.definition, request.command, at),
)

/**
 * Judges an untrusted value as a fixed request. The check is closed: every field has the
 * declared shape, the definition passes `judgeToolDefinition`, the concurrency limit is a
 * positive integer or null, the time limits are non-negative integers or null, and the command
 * selects an operation the definition declares. It reads no store and grants nothing: the
 * trusted source, the current qualification and the availability facts are verified by the
 * admission provider. The result is a frozen copy.
 */
export function judgeFixedToolRequest(
  value: unknown,
): Outcome<FixedToolRequest, Readonly<{ field: string; reason: string }>> {
  return judgeUnknown(fixedToolRequest, value, 'FixedToolRequest')
}
