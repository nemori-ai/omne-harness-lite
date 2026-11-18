import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type { Adoption, ToolActionResolution, ToolCallLabel } from '@omne-harness/tool-contract'
import { forwardIntentOfCall } from '@omne-harness/tool-host-local'
import {
  releaseToolConsumer,
  resolveForwardTarget,
  type ForwardRequestPorts,
} from './tool-forward-requests.ts'
import { callOf } from './tool-requests.ts'

const unavailable = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency: 'tool-action', diagnostic })
const invalid = (field: string, reason: string) => fail({ kind: 'invalid' as const, field, reason })

type Input = Parameters<ToolActionResolution<unknown>['resolve']>[0]

// The released `Tools` as the catalog offers it now; anything else is not the carrier this resolves.
async function releasedTools(ports: ForwardRequestPorts, input: Input) {
  const release = ports.release()
  const catalog = ports.catalog()
  if (release.kind !== 'trusted' || catalog === undefined)
    return unavailable('The release snapshot or the catalog is unavailable.')
  const entry = release.manifest.entries.find(item => item.asset.name === input.name)
  if (entry === undefined) return unavailable('Tools is not a release tool')
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
    availability.layer.kind !== 'official' ||
    canonicalDigest(availability.definition.adoption) !== canonicalDigest(entry.asset.adoption)
  )
    return unavailable('Tools is not available as released')
  return succeed(availability.definition)
}

// A release card's label, from the very definition admission judged; never the model's intent.
export type ToolCallLabeling = Readonly<{
  label(
    input: Omit<Input, 'name'> & Readonly<{ definition: Adoption }>,
  ): Promise<Omit<ToolCallLabel, 'intent'> | undefined>
}>

export function createToolCallLabeling(ports: ForwardRequestPorts): ToolCallLabeling {
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
      return { tool, command, preview }
    },
  }
}

// Only a `Tools` execute call carries another action; every other call is its own, read nothing for it.
export function createToolActionResolution(
  ports: ForwardRequestPorts,
): ToolActionResolution<unknown> {
  return {
    async resolve(input) {
      if (input.name !== 'Tools') return succeed({ kind: 'own' })
      const tools = await releasedTools(ports, input)
      if ('failure' in tools) return tools
      const called = callOf(tools.ok, input.effectiveArguments)
      if ('answer' in called) return invalid('command', 'unknown-command')
      if (called.command !== 'execute') return succeed({ kind: 'own' })
      const effective = input.effectiveArguments
      const intent = forwardIntentOfCall({
        definition: tools.ok,
        command: called.command,
        arguments: { original: effective, effective, complete: true },
      })
      if (intent === null) return invalid('arguments', 'tools-execute-arguments')
      const resolved = await resolveForwardTarget(ports, input, intent)
      // A target the forward refuses (resident, not included, not available) is no target either.
      if ('failure' in resolved)
        return resolved.failure.kind === 'denied' ? invalid('name', 'target-refused') : resolved
      return succeed({
        kind: 'carried',
        carrier: { name: input.name, definition: tools.ok.adoption },
        target: {
          name: intent.name,
          definition: resolved.ok.availability.definition.adoption,
          command: intent.command,
          effectiveArguments: resolved.ok.effective,
        },
      })
    },
  }
}
