import { writeJsonText } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import {
  type FixedToolRequest,
  type Reply,
  type ToolCatalog,
  type ToolConsumerProfile,
  type ToolForwardIntent,
  type ToolInvokeRequest,
} from '@omne-harness/tool-contract'
import { encodeCommandCall, type ToolForwardParent } from '@omne-harness/tool-contract/provider'
import type { LocalToolCatalogViewSource } from '@omne-harness/tool-host-local'
import { nonresidentTarget } from './tool-target-residency.ts'
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

/** Builds only the target business request. The source provider owns its slot and invocation. */
export function createForwardTargetRequests(ports: ForwardRequestPorts) {
  return async (
    parent: Pick<ToolForwardParent<unknown>, 'principal' | 'tenant' | 'request'>,
    intent: ToolForwardIntent,
  ): Reply<ToolInvokeRequest> => {
    const release = ports.release()
    if (release.kind !== 'trusted' || !isReleaseToolsRequest(release, parent.request))
      return unavailable('The exact parent Tools adoption is unavailable.')
    if (intent.name === 'Tools') return invalid('name', 'recursive-tools-execute')
    const entry = release.manifest.entries.find(item => item.asset.name === intent.name)
    const catalog = ports.catalog()
    if (entry === undefined || catalog === undefined)
      return unavailable('The target release or catalog is unavailable.')
    const inspected = await catalog.inspect({
      principal: parent.principal,
      tenant: parent.tenant,
      name: intent.name,
      command: intent.command,
      consumer: releaseToolConsumer(release),
    })
    if ('failure' in inspected) return inspected
    const availability = inspected.ok
    if (
      availability.kind !== 'available' ||
      availability.layer.kind !== 'official' ||
      canonicalDigest(availability.definition.adoption) !== canonicalDigest(entry.asset.adoption) ||
      canonicalDigest(availability.executor) !== canonicalDigest(entry.module.executor)
    )
      return unavailable('The exact target release adoption is unavailable.')
    const nonresident = await nonresidentTarget(ports.view(), parent, availability)
    if ('failure' in nonresident) return nonresident
    const definition = availability.definition
    let effective: string
    if (definition.kind === 'function') {
      if (intent.command !== null) return invalid('command', 'function-command-must-be-null')
      effective = writeJsonText(intent.arguments)
    } else {
      if (
        intent.command === null ||
        !definition.commands.some(item => item.name === intent.command)
      )
        return invalid('command', 'unknown-target-command')
      if (intent.arguments.kind !== 'object')
        return invalid('arguments', 'command-parameters-must-be-object')
      if (
        definition.encoding === 'flat' &&
        intent.arguments.entries.some(item => item.key === 'command')
      )
        return invalid('arguments', 'reserved-command-field')
      effective = writeJsonText(
        encodeCommandCall(definition.encoding, {
          command: intent.command,
          params: intent.arguments,
        }),
      )
    }
    const { context, workspace, resources, scope, requesterScope, limits, mode, consumer } =
      parent.request
    return succeed({
      availability,
      command: intent.command,
      arguments: { original: effective, effective, complete: true },
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
