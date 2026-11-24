import { fail, succeed } from '@omne-harness/operation-result'
import {
  callLabel,
  type Access,
  type ProgramFunction,
  type Reply,
  type ToolForwardIntent,
  type ToolInvokeRequest,
} from '@omne-harness/tool-contract'
import {
  needsIntent,
  programFunctions,
  toolAvailabilityReference,
  type ProgramParent,
} from '@omne-harness/tool-contract/provider'
import {
  isReleaseToolRequest,
  releaseToolConsumer,
  resolveForwardTarget,
  type ForwardRequestPorts,
} from './tool-forward-requests.ts'
import { toolLimitsOf } from './tool-limits.ts'

export type ProgramRequestPorts = ForwardRequestPorts &
  Readonly<{ operatorSettings(tool: string): Readonly<Record<string, unknown>> | undefined }>

const EMPTY_PARAMS = { kind: 'object', entries: [] } as const
const unavailable = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency: 'program-target', diagnostic })

/** TL-51: a program writes no intent, so the host says what made the call where a command needs one. */
const PROGRAM_INTENT = 'called by a program that Code runs'

type Parent = Pick<ProgramParent<unknown>, 'principal' | 'tenant' | 'request'>

const isCode = (ports: ProgramRequestPorts, parent: Parent): boolean =>
  isReleaseToolRequest(ports.release(), parent.request, 'Code')

/** The trusted source of a program call's request: a listed target, the parent's pins, the target's own limits. */
export function createProgramTargetRequests(ports: ProgramRequestPorts) {
  return async (parent: Parent, intent: ToolForwardIntent): Reply<ToolInvokeRequest> => {
    if (!isCode(ports, parent)) return unavailable('The exact parent Code adoption is unavailable.')
    const resolved = await resolveForwardTarget(ports, parent, intent, 'listed', PROGRAM_INTENT)
    if ('failure' in resolved) return resolved
    const { settings, availability, effective } = resolved.ok
    const args = { original: effective, effective, complete: true } as const
    const { command } = intent
    const limits = toolLimitsOf({ availability, command, arguments: args }, () =>
      ports.operatorSettings(availability.definition.name),
    )
    if ('failure' in limits) return unavailable(limits.failure)
    const said =
      availability.definition.kind === 'commands' && needsIntent(availability.definition, command)
    const label = callLabel(availability.definition, {
      command,
      intent: said ? PROGRAM_INTENT : null,
      params: intent.arguments.kind === 'object' ? intent.arguments : EMPTY_PARAMS,
    })
    const { context, workspace, resources, scope, requesterScope, consumer, directory } =
      parent.request
    return succeed({
      ...(directory === undefined ? {} : { directory }),
      availability: toolAvailabilityReference(availability),
      command,
      arguments: args,
      label,
      settings,
      batchDecision: null,
      context,
      workspace,
      resources,
      scope,
      requesterScope,
      limits: { concurrency: null, scopeBudget: null, ...limits.ok, backgroundAfterMs: null },
      mode: 'foreground',
      consumer,
    })
  }
}

export function createProgramFunctions(ports: ProgramRequestPorts) {
  return async (parent: Parent): Reply<readonly ProgramFunction[]> => {
    const release = ports.release()
    const catalog = ports.catalog()
    const view = ports.view()
    if (release.kind !== 'trusted' || catalog === undefined || view === undefined)
      return unavailable('The release snapshot, the catalog or the view is unavailable.')
    if (!isCode(ports, parent)) return unavailable('The exact parent Code adoption is unavailable.')
    const access: Access<unknown> = { principal: parent.principal, tenant: parent.tenant }
    const listed = await view.read(access)
    if ('failure' in listed) return listed
    const names = [...new Set(listed.ok.entries.map(entry => entry.key.asset.name))]
    const inspected = await catalog.inspectEach({
      ...access,
      names,
      consumer: releaseToolConsumer(release),
    })
    if ('failure' in inspected) return inspected
    return succeed(
      inspected.ok.flatMap(one =>
        'ok' in one && one.ok.kind === 'available' ? programFunctions(one.ok.definition) : [],
      ),
    )
  }
}
