import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import {
  commandGateOf,
  selectCommandText,
  type Adoption,
  type ToolActionGate,
  type ReleaseDetailAnswer,
  type ToolActionResolution,
  type ToolAvailability,
  type ToolCallLabel,
  type ToolReleaseDetails,
} from '@omne-harness/tool-contract'
import { forwardIntentOfCall } from '@omne-harness/tool-host-local'
import {
  releaseToolConsumer,
  resolveForwardTarget,
  type ForwardRequestPorts,
} from './tool-forward-requests.ts'
import { TOOL_CATEGORY } from './permission-declarations.ts'
import { namedUngated } from './tool-release-manifest.ts'
import { callOf } from './tool-requests.ts'

const unavailable = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency: 'tool-action', diagnostic })

type Input = Parameters<ToolActionResolution<unknown>['resolve']>[0]

// A release card's label, from the very definition admission judged; never the model's intent.
// The detail is what the implementer says this call would do, asked once with the same arguments.
export type ToolCallLabeling = Readonly<{
  label(
    input: Omit<Input, 'name'> & Readonly<{ definition: Adoption }>,
  ): Promise<
    (Omit<ToolCallLabel, 'intent'> & Readonly<{ detail: ReleaseDetailAnswer }>) | undefined
  >
}>

const NO_DETAILS: ReleaseDetailAnswer = { kind: 'unavailable', reason: 'no-provider' }
const DETAILS_THREW: ReleaseDetailAnswer = { kind: 'unavailable', reason: 'threw' }

export function createToolCallLabeling(
  ports: ForwardRequestPorts &
    Readonly<{ details?: () => ToolReleaseDetails<unknown> | undefined }>,
): ToolCallLabeling {
  return {
    async label(input) {
      const release = ports.release()
      const catalog = ports.catalog()
      if (release.kind !== 'trusted' || catalog === undefined) return undefined
      const inspected = await catalog.inspect({
        principal: input.principal,
        tenant: input.tenant,
        name: input.definition.name,
        command: null,
        consumer: releaseToolConsumer(release),
      })
      if ('failure' in inspected || inspected.ok.kind !== 'available') return undefined
      const { definition } = inspected.ok
      if (canonicalDigest(definition.adoption) !== canonicalDigest(input.definition))
        return undefined
      const called = callOf(definition, input.effectiveArguments)
      if ('answer' in called) return undefined
      const { tool, command, preview } = called.label
      const details = ports.details?.()
      const detail =
        details === undefined
          ? NO_DETAILS
          : await details
              .describe({
                principal: input.principal,
                tenant: input.tenant,
                availability: inspected.ok,
                command,
                effectiveArguments: input.effectiveArguments,
              })
              .catch(() => DETAILS_THREW)
      return { tool, command, preview, detail }
    },
  }
}

type Definition = Extract<ToolAvailability, { kind: 'available' }>['definition']

async function judgedDefinition(ports: ForwardRequestPorts, input: Input) {
  const release = ports.release()
  const catalog = ports.catalog()
  if (release.kind !== 'trusted' || catalog === undefined)
    return unavailable('The release snapshot or the catalog is unavailable.')
  const inspected = await catalog.inspect({
    principal: input.principal,
    tenant: input.tenant,
    name: input.name,
    command: null,
    consumer: releaseToolConsumer(release),
  })
  if ('failure' in inspected) return inspected
  const availability = inspected.ok
  if (
    availability.kind !== 'available' ||
    canonicalDigest(availability.definition.adoption) !== canonicalDigest(input.definition)
  )
    return unavailable('The judged definition is not the one the catalog offers now.')
  const entry = release.manifest.entries.find(item => item.asset.name === input.name)
  const released =
    entry !== undefined &&
    availability.layer.kind === 'official' &&
    canonicalDigest(availability.definition.adoption) === canonicalDigest(entry.asset.adoption)
  return succeed({ definition: availability.definition, released })
}

function namedCommand(definition: Definition, effectiveArguments: string): string | null {
  if (definition.kind === 'function') return null
  const selected = selectCommandText(
    definition.commands.map(command => command.name),
    effectiveArguments,
  )
  return 'ok' in selected ? selected.ok : null
}

export function createToolActionResolution(
  ports: ForwardRequestPorts,
): ToolActionResolution<unknown> {
  return {
    async resolve(input) {
      const judged = await judgedDefinition(ports, input)
      if ('failure' in judged) return judged
      const { definition, released } = judged.ok
      const gateOf = (tool: Definition, command: string | null) =>
        commandGateOf(tool, command, namedUngated(tool.name))
      const called = callOf(definition, input.effectiveArguments)
      if ('answer' in called)
        return succeed({
          kind: 'argument-error',
          gate: gateOf(definition, namedCommand(definition, input.effectiveArguments)),
          field: 'command',
          reason: 'unknown-command',
        })
      const own = gateOf(definition, called.command)
      if (input.name !== 'Tools' || called.command !== 'execute')
        return succeed({ kind: 'own', gate: own })
      if (!released) return unavailable('Tools is not available as released')
      return carriedAction(ports, input, definition, own, gateOf)
    },
  }
}

async function carriedAction(
  ports: ForwardRequestPorts,
  input: Input,
  definition: Definition,
  own: ToolActionGate,
  gateOf: (tool: Definition, command: string | null) => ToolActionGate,
): ReturnType<ToolActionResolution<unknown>['resolve']> {
  const refused = (field: string, reason: string) =>
    succeed({ kind: 'argument-error' as const, gate: own, field, reason })
  const effective = input.effectiveArguments
  const intent = forwardIntentOfCall({
    definition,
    command: 'execute',
    arguments: { original: effective, effective, complete: true },
  })
  if (intent === null) return refused('arguments', 'tools-execute-arguments')
  const resolved = await resolveForwardTarget(ports, input, intent)
  if ('failure' in resolved) {
    const { failure } = resolved
    // A target the forward refuses (resident, not included, not available) is no target either.
    if (failure.kind === 'denied') return refused('name', 'target-refused')
    if (failure.kind === 'invalid') return refused(failure.field, failure.reason)
    return resolved
  }
  const { capability } = resolved.ok
  const target = resolved.ok.availability.definition
  // A call its target would answer with usage carries no action either.
  const targetCall = callOf(target, resolved.ok.effective)
  if ('answer' in targetCall) return refused('arguments', 'target-call-refused')
  return succeed({
    kind: 'carried',
    carrier: { name: input.name, definition: definition.adoption, gate: own },
    target: {
      name: intent.name,
      ...(capability.category === TOOL_CATEGORY ? {} : { capability }),
      definition: target.adoption,
      command: intent.command,
      effectiveArguments: resolved.ok.effective,
      gate: gateOf(target, targetCall.command),
    },
  })
}
