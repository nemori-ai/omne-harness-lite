import { writeJsonText } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type { Access } from '@omne-harness/legal-identity'
import {
  callLabel,
  type Adoption,
  type ConsumerRef,
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
  needsIntent,
  toolAvailabilityReference,
  type ToolAuthority,
  type ToolCapabilityIdentity,
  type ToolForwardParent,
} from '@omne-harness/tool-contract/provider'
import {
  SOURCE_ENTRY_SETTINGS,
  type LocalToolCatalogViewSource,
} from '@omne-harness/tool-host-local'
import type { CurrentHeldTool } from '../rows/tool-host/held-current.ts'
import { HELD_TOOL_SETTINGS } from '../rows/tool-host/held-tools.ts'
import { toolCapability } from './permission-declarations.ts'
import { sourcedEntryFor, type SourcedEntries } from './tool-entry-sources.ts'
import { targetResidency } from './tool-target-residency.ts'

const EMPTY_PARAMS = { kind: 'object', entries: [] } as const
import type { ToolRelease } from './tool-release.ts'

type Trusted = Extract<ToolRelease, { kind: 'trusted' }>
export type ForwardRequestPorts = Readonly<{
  release(): ToolRelease
  catalog(): ToolCatalog<unknown> | undefined
  view(): LocalToolCatalogViewSource<unknown> | undefined
  /** The entries of the tool entry sources; absent, only release tools are targets. */
  sourced?(): SourcedEntries
  held?(access: Access<unknown>, name: string): Promise<CurrentHeldTool>
  admitted?(consumer: ConsumerRef, target: Adoption): boolean
}>
const unavailable = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency: 'tools-target', diagnostic })
const invalid = (field: string, reason: string) => fail({ kind: 'invalid' as const, field, reason })
export const HELD_UNREAD = 'tenant-tools'

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
type ReleaseEntry = Trusted['manifest']['entries'][number]
type TargetAccess = Pick<ToolForwardParent<unknown>, 'principal' | 'tenant'>
type Available = Extract<ToolAvailability, { kind: 'available' }>

/** Where the catalog has the target from: the release, or a source that owns its name. */
type TargetOrigin =
  | Readonly<{ kind: 'release'; entry: ReleaseEntry }>
  | Readonly<{ kind: 'source'; entries: SourcedEntries }>
  | Readonly<{ kind: 'held'; held: ToolAuthority }>

async function targetOrigin(
  ports: ForwardRequestPorts,
  release: Trusted,
  access: TargetAccess,
  intent: ToolForwardIntent,
) {
  if (intent.name === 'Tools') return invalid('name', 'recursive-tools-execute')
  const entry = release.manifest.entries.find(item => item.asset.name === intent.name)
  if (entry !== undefined) return succeed<TargetOrigin>({ kind: 'release', entry })
  const entries = ports.sourced?.()
  if (entries?.owns(access, intent.name) === true)
    return succeed<TargetOrigin>({ kind: 'source', entries })
  const held = await ports.held?.(access, intent.name)
  if (held?.kind === 'unavailable')
    return fail({
      kind: 'unavailable' as const,
      dependency: HELD_UNREAD,
      diagnostic: held.diagnostic,
    })
  if (held?.kind === 'unfit') return unavailable(held.reason)
  return held?.kind === 'held'
    ? succeed<TargetOrigin>({ kind: 'held', held: held.authority })
    : invalid('name', 'unknown-target')
}

function isReleaseAdoption(
  availability: ToolAvailability,
  entry: ReleaseEntry,
): availability is Available {
  return (
    availability.kind === 'available' &&
    availability.layer.kind === 'official' &&
    canonicalDigest(availability.definition.adoption) === canonicalDigest(entry.asset.adoption) &&
    canonicalDigest(availability.executor) === canonicalDigest(entry.module.executor)
  )
}

type Target = Readonly<{
  availability: Available
  capability: ToolCapabilityIdentity
  settings: ToolInvokeRequest['settings']
  held?: true
}>

export type TargetResidency = 'nonresident' | 'listed'

async function heldTarget(
  ports: ForwardRequestPorts,
  access: TargetAccess,
  availability: ToolAvailability,
  held: ToolAuthority,
  required: TargetResidency,
): Reply<Target> {
  if (
    availability.kind !== 'available' ||
    canonicalDigest(availability.layer) !== canonicalDigest(held.layer) ||
    canonicalDigest(availability.definition.adoption) !== canonicalDigest(held.asset.adoption)
  )
    return unavailable(
      'The version of the tool the tenant holds now is not the one the catalog offers.',
    )
  const nonresident = await targetResidency(ports.view(), access, availability, required)
  if ('failure' in nonresident) return nonresident
  return succeed({
    availability,
    capability: toolCapability(held.asset.name),
    settings: HELD_TOOL_SETTINGS,
    held: true,
  })
}

async function releaseTarget(
  ports: ForwardRequestPorts,
  access: TargetAccess,
  availability: ToolAvailability,
  entry: ReleaseEntry,
  required: TargetResidency,
): Reply<Target> {
  if (!isReleaseAdoption(availability, entry))
    return unavailable('The exact target release adoption is unavailable.')
  const nonresident = await targetResidency(ports.view(), access, availability, required)
  if ('failure' in nonresident) return nonresident
  return succeed({
    availability,
    capability: toolCapability(entry.asset.name),
    settings: entry.settings,
  })
}

// A source entry is forwarded unless the session keeps it resident; it is the entry its source listed to this asker just now.
async function sourceTarget(
  ports: ForwardRequestPorts,
  access: TargetAccess,
  availability: ToolAvailability,
  entries: SourcedEntries,
  required: TargetResidency,
): Reply<Target> {
  if (availability.kind !== 'available')
    return fail({ kind: 'denied', action: 'target-unavailable' })
  const placed = await targetResidency(ports.view(), access, availability, required, entries)
  if ('failure' in placed) return placed
  const entry = sourcedEntryFor(entries, access, availability)
  if (entry === undefined)
    return unavailable('The source no longer lists the target as the catalog answered it.')
  return succeed({ availability, capability: entry.capability, settings: SOURCE_ENTRY_SETTINGS })
}

async function inspectTarget(
  ports: ForwardRequestPorts,
  access: TargetAccess,
  intent: ToolForwardIntent,
  release: Trusted,
  origin: TargetOrigin,
  required: TargetResidency,
): Reply<Target> {
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
  if (origin.kind === 'release')
    return releaseTarget(ports, access, inspected.ok, origin.entry, required)
  if (origin.kind === 'held') return heldTarget(ports, access, inspected.ok, origin.held, required)
  return sourceTarget(ports, access, inspected.ok, origin.entries, required)
}

function functionCall(intent: ToolForwardIntent) {
  if (intent.command !== null) return invalid('command', 'function-command-must-be-null')
  return succeed(writeJsonText(intent.arguments))
}

function commandCall(
  definition: Exclude<TargetDefinition, { kind: 'function' }>,
  intent: ToolForwardIntent,
  said: string | null,
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
        intent: needsIntent(definition, intent.command) ? said : null,
        params: intent.arguments,
      }),
    ),
  )
}

function effectiveCall(
  definition: TargetDefinition,
  intent: ToolForwardIntent,
  said: string | null,
) {
  if (definition.kind === 'function') return functionCall(intent)
  return commandCall(definition, intent, said)
}

/** The target a `Tools` execute call names, resolved for this tenant; the same answer forwarding uses. */
export async function resolveForwardTarget(
  ports: ForwardRequestPorts,
  access: Pick<ToolForwardParent<unknown>, 'principal' | 'tenant'>,
  intent: ToolForwardIntent,
  required: TargetResidency = 'nonresident',
  said: string | null = null,
) {
  const release = ports.release()
  if (release.kind !== 'trusted') return unavailable('The release snapshot is unavailable.')
  const origin = await targetOrigin(ports, release, access, intent)
  if ('failure' in origin) return origin
  const target = await inspectTarget(ports, access, intent, release, origin.ok, required)
  if ('failure' in target) return target
  const effective = effectiveCall(target.ok.availability.definition, intent, said)
  if ('failure' in effective) return effective
  return succeed({ ...target.ok, effective: effective.ok })
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
    if (
      resolved.ok.held === true &&
      ports.admitted?.(parent.request.consumer, definition.adoption) !== true
    )
      return invalid('name', 'target-changed-after-admission')
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
