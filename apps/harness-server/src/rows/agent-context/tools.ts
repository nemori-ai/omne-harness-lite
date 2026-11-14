import type { Context } from '@deepseek-ai/cordis'
import type { ToolAvailabilityRead, ToolLookup } from '@omne-harness/agent-context'
import type { SourceRead } from '@omne-harness/request-context-contract'
import type { ToolConsumerProfile, ToolFailure } from '@omne-harness/tool-contract'
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
