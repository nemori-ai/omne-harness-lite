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
import {
  BLOCK_NOT_REGISTERED,
  publishedViewPortsOf,
  readPublishedView,
} from '../session-ad03/published-view.ts'
import { examiningOf } from '../goal/examines.ts'
import { sessionWorkOf } from '../tool-runtime/session-work.ts'
import { ToolCatalogService, toolCatalogKey } from '@omne-harness/tool-cordis-contract/cordis'
import { releaseOf } from '../../entry/tool-release.ts'

type NoValue = Exclude<SourceRead<never>, { kind: 'value' }>

const unavailable = (diagnostic: string): NoValue => ({ kind: 'unavailable', diagnostic })

function readOfFailure(failure: ToolFailure): NoValue {
  switch (failure.kind) {
    case 'denied':
      return { kind: 'denied' }
    case 'invalid':
      return unavailable(`tool-invalid: ${failure.field}: ${failure.reason}`)
    case 'unavailable':
      return unavailable(`tool-unavailable: ${failure.dependency}: ${failure.diagnostic}`)
    default:
      return unavailable(`tool-catalog: ${failure.kind}`)
  }
}

function readOfPosition(failure: ToolFailure, name: string): NoValue {
  return failure.kind === 'invalid' && failure.field === 'name' && failure.reason === 'unknown-tool'
    ? unavailable(`tool-unknown: ${name}`)
    : readOfFailure(failure)
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
  if ('failure' in view) return view
  const examining = await examiningOf(ctx, access, session)
  if ('failure' in examining) return examining
  return succeed(heldConditions({ ...view.ok.interaction, examining: examining.ok }))
}

const unreadConditions = (failure: string): NoValue =>
  failure === BLOCK_NOT_REGISTERED ? { kind: 'denied' } : unavailable(`tool-conditions: ${failure}`)

export function catalogToolLookup(ctx: Context): ToolLookup<unknown> {
  return async ({
    access,
    bindings,
  }): Promise<SourceRead<readonly (ToolAvailabilityRead | null)[]>> => {
    const service: unknown = ctx.get(toolCatalogKey, false)
    if (!(service instanceof ToolCatalogService)) return unavailable('tool-catalog-absent')
    const catalog = service as ToolCatalogService<unknown>
    const consumer = consumerOf(ctx)
    if ('kind' in consumer) return consumer
    const names = bindings.map(binding => binding.name)
    let answer
    try {
      answer = await catalog.inspectEach({ ...access, names, consumer })
    } catch {
      return unavailable('tool-catalog-failed')
    }
    if (!('ok' in answer)) return readOfFailure(answer.failure)
    // The command table the model is given is cut by the same declaration that judges each call.
    let held: Outcome<ReadonlySet<string>, string> | undefined
    const offered: (ToolAvailabilityRead | null)[] = []
    for (const [index, one] of answer.ok.entries()) {
      if ('failure' in one) return readOfPosition(one.failure, names[index]!)
      if (!declaresConditions(one.ok.definition)) {
        offered.push(one.ok)
        continue
      }
      held ??= await heldBy(ctx, access)
      if ('failure' in held) return unreadConditions(held.failure)
      const definition = offeredDefinition(one.ok.definition, held.ok)
      offered.push(definition === null ? null : { ...one.ok, definition })
    }
    return { kind: 'value', value: offered }
  }
}
