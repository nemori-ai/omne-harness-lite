import { writeJsonText } from '@omne-harness/json-text'
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
import { encodeCommandCall, type ToolForwardParent } from '@omne-harness/tool-contract/provider'
import type { LocalToolCatalogViewSource } from '@omne-harness/tool-host-local'
import { targetResidency } from './tool-target-residency.ts'

const EMPTY_PARAMS = { kind: 'object', entries: [] } as const
import type { ToolRelease } from './tool-release.ts'

type Trusted = Extract<ToolRelease, { kind: 'trusted' }>
export type ForwardRequestPorts = Readonly<{
  release(): ToolRelease
  catalog(): ToolCatalog<unknown> | undefined
  view(): LocalToolCatalogViewSource<unknown> | undefined
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

function targetEntry(release: Trusted, intent: ToolForwardIntent) {
  if (intent.name === 'Tools') return invalid('name', 'recursive-tools-execute')
  const entry = release.manifest.entries.find(item => item.asset.name === intent.name)
  if (entry === undefined) return invalid('name', 'unknown-target')
  return succeed(entry)
}

function isReleaseAdoption(
  availability: ToolAvailability,
  entry: Trusted['manifest']['entries'][number],
): availability is Extract<ToolAvailability, { kind: 'available' }> {
  return (
    availability.kind === 'available' &&
    availability.layer.kind === 'official' &&
    canonicalDigest(availability.definition.adoption) === canonicalDigest(entry.asset.adoption) &&
    canonicalDigest(availability.executor) === canonicalDigest(entry.module.executor)
  )
}

async function inspectTarget(
  ports: ForwardRequestPorts,
  access: Pick<ToolForwardParent<unknown>, 'principal' | 'tenant'>,
  intent: ToolForwardIntent,
  release: Trusted,
  entry: Trusted['manifest']['entries'][number],
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
  if (!isReleaseAdoption(availability, entry))
    return unavailable('The exact target release adoption is unavailable.')
  const nonresident = await targetResidency(ports.view(), access, availability, 'nonresident')
  if ('failure' in nonresident) return nonresident
  return succeed(availability)
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
  const entry = targetEntry(release, intent)
  if ('failure' in entry) return entry
  const availability = await inspectTarget(ports, access, intent, release, entry.ok)
  if ('failure' in availability) return availability
  const effective = effectiveCall(availability.ok.definition, intent)
  if ('failure' in effective) return effective
  return succeed({ entry: entry.ok, availability: availability.ok, effective: effective.ok })
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
    const { entry, availability, effective } = resolved.ok
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
      availability,
      command: intent.command,
      arguments: { original: effective, effective, complete: true },
      label,
      settings: entry.settings,
      environment: definition.declarations.environment,
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
