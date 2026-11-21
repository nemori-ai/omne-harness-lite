import type { Context } from '@deepseek-ai/cordis'
import type { ToolAvailabilityRead, ToolLookup } from '@omne-harness/agent-context'
import type { SourceRead } from '@omne-harness/request-context-contract'
import {
  offeredDefinition,
  type ToolConsumerProfile,
  type ToolFailure,
} from '@omne-harness/tool-contract'
import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { sessionInteractionBinding } from '@omne-harness/session-adapters/cordis'
import type { SessionId } from '@omne-harness/session-contract'
import { declaresConditions, heldConditions } from '../../entry/meta-capabilities.ts'
import { publishedViewPortsOf, readPublishedView } from '../session-ad03/published-view.ts'
import { sessionWorkOf } from '../tool-runtime/session-work.ts'
import { ToolCatalogService, toolCatalogKey } from '@omne-harness/tool-cordis-contract/cordis'
import { releaseOf } from '../../entry/tool-release.ts'

type NoValue = Exclude<SourceRead<never>, { kind: 'value' }>

const unavailable = (diagnostic: string): NoValue => ({ kind: 'unavailable', diagnostic })

function readOfFailure(failure: ToolFailure, name: string): NoValue {
  switch (failure.kind) {
    case 'denied':
      return { kind: 'denied' }
    case 'invalid':
      return failure.field === 'name' && failure.reason === 'unknown-tool'
        ? unavailable(`tool-unknown: ${name}`)
        : unavailable(`tool-invalid: ${failure.field}: ${failure.reason}`)
    case 'unavailable':
      return unavailable(`tool-unavailable: ${failure.dependency}: ${failure.diagnostic}`)
    default:
      return unavailable(`tool-catalog: ${failure.kind}`)
  }
}

function consumerOf(ctx: Context): ToolConsumerProfile | NoValue {
  const release = releaseOf(ctx)
  if (release.kind !== 'trusted') return unavailable(`tool-consumer: ${release.diagnostic}`)
  const { consumer } = release.manifest
  return {
    capabilities: consumer.capabilities,
    conversion: consumer.conversion,
    attachmentAccess: consumer.attachmentAccess,
  }
}

/** The conditions that hold in the session this principal works for; none when it works for none. */
async function heldBy(
  ctx: Context,
  access: Access<unknown>,
): Promise<Outcome<ReadonlySet<string>, string>> {
  const work = sessionWorkOf(access.principal, access.tenant)
  if (work === undefined) return succeed(new Set())
  const ports = publishedViewPortsOf(ctx, false)
  if (ports === null) return fail('the Session or Runtime Context services are absent')
  const session = work.session as SessionId
  const view = await readPublishedView(ports, { ...access, session }, sessionInteractionBinding)
  return 'failure' in view ? view : succeed(heldConditions(view.ok.interaction))
}

// The command table the model is given is cut by the same declaration that judges each call.
async function offered(
  ctx: Context,
  access: Access<unknown>,
  availability: ToolAvailabilityRead,
): Promise<SourceRead<ToolAvailabilityRead | null>> {
  if (!declaresConditions(availability.definition)) return { kind: 'value', value: availability }
  const held = await heldBy(ctx, access)
  if ('failure' in held) return unavailable(`tool-conditions: ${held.failure}`)
  const definition = offeredDefinition(availability.definition, held.ok)
  return { kind: 'value', value: definition === null ? null : { ...availability, definition } }
}

export function catalogToolLookup(ctx: Context): ToolLookup<unknown> {
  return async ({ access, binding }): Promise<SourceRead<ToolAvailabilityRead | null>> => {
    const service: unknown = ctx.get(toolCatalogKey, false)
    if (!(service instanceof ToolCatalogService)) return unavailable('tool-catalog-absent')
    const catalog = service as ToolCatalogService<unknown>
    const consumer = consumerOf(ctx)
    if ('kind' in consumer) return consumer
    let answer
    try {
      answer = await catalog.inspect({ ...access, name: binding.name, command: null, consumer })
    } catch {
      return unavailable('tool-catalog-failed')
    }
    if (!('ok' in answer)) return readOfFailure(answer.failure, binding.name)
    return offered(ctx, access, answer.ok)
  }
}
