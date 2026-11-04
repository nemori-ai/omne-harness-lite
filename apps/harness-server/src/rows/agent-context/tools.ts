// The tool lookup of the `agent-context` row (G-TOOLS6): the `ToolLookup` port of agent-context
// over Tool's own read, `toolCatalog.inspect`. The definition the model sees (name, description,
// command summaries and parameter schemas) is the one in the Catalog's registry; nothing here writes
// a description. The consumer material is the text consumer that this release confirmed
// (`tool-release.json#consumer`), the only material the release availability source accepts.
//
// Both services are read again on every call, as `startAuthorityProxy` of the `tool-bindings` row
// does, so the row's manifest keeps its injects: a session without resident tools never needs them.
// An absent Catalog, a double that is not the contract service, a release that is not trusted, an
// unknown tool and a throw all answer without a value; the sixth group then fails closed.
import type { Context } from '@deepseek-ai/cordis'
import type { ToolAvailabilityRead, ToolLookup } from '@omne-harness/agent-context'
import type { SourceRead } from '@omne-harness/request-context-contract'
import type { ToolConsumerProfile, ToolFailure } from '@omne-harness/tool-contract'
import { ToolCatalogService, toolCatalogKey } from '@omne-harness/tool-cordis-contract/cordis'
import { releaseOf } from '../../entry/tool-release.ts'

type NoValue = Exclude<SourceRead<never>, { kind: 'value' }>

const unavailable = (diagnostic: string): NoValue => ({ kind: 'unavailable', diagnostic })

/** A Catalog failure as a read without a value. An unknown name is a source that cannot be read. */
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

/** The consumer material that the trusted release confirmed, or why there is none. */
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

/** The lookup over the current Catalog and the release consumer, made from the plugin context. */
export function catalogToolLookup(ctx: Context): ToolLookup<unknown> {
  return async ({ access, binding }): Promise<SourceRead<ToolAvailabilityRead>> => {
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
    return 'ok' in answer
      ? { kind: 'value', value: answer.ok }
      : readOfFailure(answer.failure, binding.name)
  }
}
