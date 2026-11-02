import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type { Access, Adoption, ToolFailure } from '@omne-harness/tool-contract'
import type {
  ToolAuthority,
  ToolBindingRegistry,
  ToolGovernance,
  ToolContributionFailure,
  ToolImplementationModule,
  ToolLoader,
} from '@omne-harness/tool-contract/provider'
import {
  toolBindingsKey,
  toolGenerationsKey,
  type ToolGenerations,
} from '@omne-harness/tool-cordis-contract/cordis'

export type ToolAuthorConfiguration<E, B extends ContentBlock> = Readonly<{
  authority: ToolAuthority
  construction: Parameters<ToolImplementationModule<E, B>['createAuthor']>[0]
  settings: Adoption
}>
export type ToolAuthorContext<P> = Readonly<{
  access: Access<P>
  asset: ToolGovernance
  services: Readonly<Record<string, unknown>>
}>

export class ToolAuthorContributionError extends Error {
  readonly failure: ToolFailure | ToolContributionFailure
  constructor(failure: ToolFailure | ToolContributionFailure) {
    super(`author contribution: ${failure.kind}`)
    this.failure = failure
  }
}

export async function contributeTool<P, E, B extends ContentBlock>(
  ctx: Context,
  config: ToolAuthorConfiguration<E, B>,
  module: ToolImplementationModule<E, B>,
  input: ToolAuthorContext<P>,
): Promise<void> {
  // Assembly fixes the service type parameters. Cordis stores erased service instances.
  const generations = ctx.get(toolGenerationsKey) as ToolGenerations<P, E, B> | undefined
  const registry = ctx.get(toolBindingsKey) as ToolBindingRegistry<P, E, B> | undefined
  if (generations === undefined || registry === undefined)
    throw new Error('author dependencies unavailable')
  const loader: ToolLoader<P, E, B> = generations.loaderFor(config.authority)
  const loaded = await loader.load({
    ...input.access,
    asset: input.asset,
    settings: config.settings,
    module: {
      executor: module.executor,
      createAuthor: construction =>
        canonicalDigest(construction) === canonicalDigest(config.construction)
          ? module.createAuthor(construction)
          : fail({ field: 'construction', reason: 'configuration differs from legal settings' }),
    },
    services: input.services,
  })
  if ('failure' in loaded) throw new ToolAuthorContributionError(loaded.failure)
  if (ctx.fiber.state === 4) throw new Error('author fiber disposed during load')
  ctx.effect(() => {
    const contribution = registry.register({
      ...input.access,
      authority: config.authority,
      loaded: loaded.ok,
    })
    if ('failure' in contribution) throw new ToolAuthorContributionError(contribution.failure)
    return () => {
      contribution.ok.release()
    }
  })
}

export function createToolAuthorPlugin<P, E, B extends ContentBlock>(
  module: ToolImplementationModule<E, B>,
  input: ToolAuthorContext<P>,
) {
  return {
    name: 'tool-author',
    inject: [toolBindingsKey, toolGenerationsKey],
    apply: (ctx: Context, config: ToolAuthorConfiguration<E, B>) =>
      contributeTool(ctx, config, module, input),
  }
}

export {
  createLocalToolGenerations,
  type LocalToolGenerationsInput,
  type LocalToolAuthorSource,
} from './author-generations.ts'
