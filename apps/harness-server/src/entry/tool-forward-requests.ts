import { writeJsonText } from '@omne-harness/json-text'
import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import {
  callLabel,
  type FixedToolRequest,
  type Reply,
  type ToolCatalog,
  type ToolAvailability,
  type ToolConsumerProfile,
  type ToolForwardIntent,
  type ToolInvokeRequest,
} from '@omne-harness/tool-contract'
import {
  encodeCommandCall,
  toolAvailabilityReference,
  type ToolAuthority,
  type ToolForwardParent,
} from '@omne-harness/tool-contract/provider'
import type { LocalToolCatalogViewSource } from '@omne-harness/tool-host-local'
import type { CurrentHeldTool } from '../rows/tool-host/held-current.ts'
import { HELD_TOOL_SETTINGS } from '../rows/tool-host/held-tools.ts'
import { targetResidency } from './tool-target-residency.ts'

const EMPTY_PARAMS = { kind: 'object', entries: [] } as const
import type { ToolRelease } from './tool-release.ts'

type Trusted = Extract<ToolRelease, { kind: 'trusted' }>
export type ForwardRequestPorts = Readonly<{
  release(): ToolRelease
  catalog(): ToolCatalog<unknown> | undefined
  view(): LocalToolCatalogViewSource<unknown> | undefined
  /** The tool the tenant of the call holds in force under a name, loaded; absent: this assembly keeps none. */
  held?(access: Access<unknown>, name: string): Promise<CurrentHeldTool>
}>
const unavailable = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency: 'tools-target', diagnostic })
const invalid = (field: string, reason: string) => fail({ kind: 'invalid' as const, field, reason })

export function releaseToolConsumer(release: Trusted): ToolConsumerProfile {
  const { capabilities, conversion, attachmentAccess } = release.manifest.consumer
  return { capabilities, conversion, attachmentAccess }
}

/** The name alone never grants the provider's Tools capability. */
export function isReleaseToolsRequest(release: ToolRelease, request: FixedToolRequest): boolean {
  return isReleaseToolRequest(release, request, 'Tools')
}

export function isReleaseToolRequest(
  release: ToolRelease,
  request: FixedToolRequest,
  name: string,
): boolean {
  if (
    release.kind !== 'trusted' ||
    request.availability.kind !== 'available' ||
    request.availability.layer.kind !== 'official'
  )
    return false
  const entry = release.manifest.entries.find(item => item.asset.name === name)
  return (
    entry !== undefined &&
    canonicalDigest(request.availability.definition.adoption) ===
      canonicalDigest(entry.asset.adoption) &&
    canonicalDigest(request.availability.executor) === canonicalDigest(entry.module.executor)
  )
}

type TargetDefinition = Extract<ToolAvailability, { kind: 'available' }>['definition']
type Entry = Trusted['manifest']['entries'][number]

/** What a name stands for now: a tool of the release, or the one the tenant of the call holds. */
type Target = Readonly<{ entry: Entry }> | Readonly<{ held: ToolAuthority }>

async function targetOf(
  ports: ForwardRequestPorts,
  release: Trusted,
  access: Access<unknown>,
  intent: ToolForwardIntent,
) {
  if (intent.name === 'Tools') return invalid('name', 'recursive-tools-execute')
  const entry = release.manifest.entries.find(item => item.asset.name === intent.name)
  if (entry !== undefined) return succeed<Target>({ entry })
  const held = await ports.held?.(access, intent.name)
  if (held?.kind === 'unavailable') return unavailable(held.diagnostic)
  if (held?.kind === 'unfit') return unavailable(held.reason)
  return held?.kind === 'held'
    ? succeed<Target>({ held: held.authority })
    : invalid('name', 'unknown-target')
}

function isReleaseAdoption(
  availability: ToolAvailability,
  entry: Entry,
): availability is Extract<ToolAvailability, { kind: 'available' }> {
  return (
    availability.kind === 'available' &&
    availability.layer.kind === 'official' &&
    canonicalDigest(availability.definition.adoption) === canonicalDigest(entry.asset.adoption) &&
    canonicalDigest(availability.executor) === canonicalDigest(entry.module.executor)
  )
}

/** The catalog offers exactly the version the tenant holds now, of its own layer. */
function isHeldAdoption(
  availability: ToolAvailability,
  held: ToolAuthority,
): availability is Extract<ToolAvailability, { kind: 'available' }> {
  return (
    availability.kind === 'available' &&
    canonicalDigest(availability.layer) === canonicalDigest(held.layer) &&
    canonicalDigest(availability.definition.adoption) === canonicalDigest(held.asset.adoption)
  )
}

async function inspectTarget(
  ports: ForwardRequestPorts,
  access: Pick<ToolForwardParent<unknown>, 'principal' | 'tenant'>,
  intent: ToolForwardIntent,
  release: Trusted,
  target: Target,
) {
  const catalog = ports.catalog()
  if (catalog === undefined) return unavailable('The target catalog is unavailable.')
  const inspected = await catalog.inspect({
    principal: access.principal,
    tenant: access.tenant,
    name: intent.name,
    command: intent.command,
    consumer: releaseToolConsumer(release),
  })
  if ('failure' in inspected) return inspected
  const availability = inspected.ok
  const exact =
    'entry' in target
      ? isReleaseAdoption(availability, target.entry)
      : isHeldAdoption(availability, target.held)
  if (!exact)
    return unavailable(
      'entry' in target
        ? 'The exact target release adoption is unavailable.'
        : 'The version of the tool the tenant holds now is not the one the catalog offers.',
    )
  const nonresident = await targetResidency(ports.view(), access, availability, 'nonresident')
  if ('failure' in nonresident) return nonresident
  return succeed(availability as Extract<ToolAvailability, { kind: 'available' }>)
}

function functionCall(intent: ToolForwardIntent) {
  if (intent.command !== null) return invalid('command', 'function-command-must-be-null')
  return succeed(writeJsonText(intent.arguments))
}

function commandCall(
  definition: Exclude<TargetDefinition, { kind: 'function' }>,
  intent: ToolForwardIntent,
) {
  if (intent.command === null || !definition.commands.some(item => item.name === intent.command))
    return invalid('command', 'unknown-target-command')
  if (intent.arguments.kind !== 'object')
    return invalid('arguments', 'command-parameters-must-be-object')
  if (
    definition.encoding === 'flat' &&
    intent.arguments.entries.some(item => item.key === 'command' || item.key === 'intent')
  )
    return invalid('arguments', 'reserved-command-field')
  return succeed(
    writeJsonText(
      encodeCommandCall(definition.encoding, {
        command: intent.command,
        intent: null,
        params: intent.arguments,
      }),
    ),
  )
}

function effectiveCall(definition: TargetDefinition, intent: ToolForwardIntent) {
  if (definition.kind === 'function') return functionCall(intent)
  return commandCall(definition, intent)
}

/** The target a `Tools` execute call names, resolved for this tenant; the same answer forwarding uses. */
export async function resolveForwardTarget(
  ports: ForwardRequestPorts,
  access: Pick<ToolForwardParent<unknown>, 'principal' | 'tenant'>,
  intent: ToolForwardIntent,
) {
  const release = ports.release()
  if (release.kind !== 'trusted') return unavailable('The release snapshot is unavailable.')
  const target = await targetOf(ports, release, access, intent)
  if ('failure' in target) return target
  const availability = await inspectTarget(ports, access, intent, release, target.ok)
  if ('failure' in availability) return availability
  const effective = effectiveCall(availability.ok.definition, intent)
  if ('failure' in effective) return effective
  const entry = 'entry' in target.ok ? target.ok.entry : undefined
  const settings = entry?.settings ?? HELD_TOOL_SETTINGS
  return succeed({ entry, settings, availability: availability.ok, effective: effective.ok })
}

export function createForwardTargetRequests(ports: ForwardRequestPorts) {
  return async (
    parent: Pick<ToolForwardParent<unknown>, 'principal' | 'tenant' | 'request'>,
    intent: ToolForwardIntent,
  ): Reply<ToolInvokeRequest> => {
    const release = ports.release()
    if (release.kind !== 'trusted' || !isReleaseToolsRequest(release, parent.request))
      return unavailable('The exact parent Tools adoption is unavailable.')
    const resolved = await resolveForwardTarget(ports, parent, intent)
    if ('failure' in resolved) return resolved
    const { settings, availability, effective } = resolved.ok
    const definition = availability.definition
    const label = callLabel(definition, {
      command: intent.command,
      intent: null,
      params: intent.arguments.kind === 'object' ? intent.arguments : EMPTY_PARAMS,
    })
    const { context, workspace, resources, scope, requesterScope, limits, mode, consumer } =
      parent.request
    // The target works in the directory its parent was pinned to when the parent was accepted.
    const { directory } = parent.request
    return succeed({
      ...(directory === undefined ? {} : { directory }),
      availability: toolAvailabilityReference(availability),
      command: intent.command,
      arguments: { original: effective, effective, complete: true },
      label,
      settings,
      batchDecision: null,
      context,
      workspace,
      resources,
      scope,
      requesterScope,
      limits,
      mode,
      consumer,
    })
  }
}
