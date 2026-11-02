import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import type { Reply } from '@omne-harness/tool-contract'
import {
  deriveDefinition,
  judgeToolDefinition,
  sameBindingKey,
  shapeOf,
  type ToolAuthority,
  type ToolImplementationModule,
  type ToolLoadedRegistration,
  type ToolLoader,
} from '@omne-harness/tool-contract/provider'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import type { LocalToolContributionVerifier } from './bindings.ts'

type Load<P, E, B extends ContentBlock> = Parameters<ToolLoader<P, E, B>['load']>[0]
type Construction<E, B extends ContentBlock> = Parameters<
  ToolImplementationModule<E, B>['createAuthor']
>[0]

export type LocalToolLoaderInput<P, E, B extends ContentBlock> = Readonly<{
  authority: ToolAuthority
  verifier: LocalToolContributionVerifier<P>
  /** Reads and validates construction values at the verified contribution layer. */
  settings(input: Load<P, E, B> & Readonly<{ authority: ToolAuthority }>): Reply<Construction<E, B>>
  /** Checks declared schemas and legal setting paths before the registration becomes visible. */
  schemas(input: Load<P, E, B>, loaded: Omit<ToolLoadedRegistration<E, B>, symbol>): Reply<void>
}>

export function createLocalToolLoader<P, E, B extends ContentBlock>(
  dependencies: LocalToolLoaderInput<P, E, B>,
): ToolLoader<P, E, B> {
  return {
    async load(input) {
      const origin = dependencies.verifier.verify(dependencies.authority)
      if ('failure' in origin)
        return origin.failure.kind === 'unavailable'
          ? fail({ ...origin.failure, dependency: 'tool-contribution-authority' })
          : fail({ kind: 'denied', action: 'load-tool-origin' })
      const admitted = dependencies.verifier.admits(input, origin.ok.layer)
      if ('failure' in admitted)
        return admitted.failure.kind === 'unavailable'
          ? fail({ ...admitted.failure, dependency: 'tool-contribution-authority' })
          : fail({ kind: 'denied', action: 'load-tool' })
      const key = { layer: origin.ok.layer, asset: input.asset.asset }
      if (!sameBindingKey(key, origin.ok))
        return fail({ kind: 'invalid', field: 'asset', reason: 'authority mismatch' })
      const construction = await dependencies.settings({ ...input, authority: origin.ok })
      if ('failure' in construction) return construction
      try {
        const created = input.module.createAuthor(construction.ok)
        if ('failure' in created) return fail({ kind: 'invalid', ...created.failure })
        if (readToolRegistration(created.ok) === undefined)
          return fail({ kind: 'invalid', field: 'implementation', reason: 'unrecognized author' })
        const definition = judgeToolDefinition(deriveDefinition(input.asset, created.ok.facts))
        if ('failure' in definition) return fail({ kind: 'invalid', ...definition.failure })
        const loaded = {
          implementation: created.ok,
          key,
          definition: definition.ok,
          shape: shapeOf(definition.ok),
          executor: input.module.executor,
          settings: input.settings,
        }
        const schemas = await dependencies.schemas(input, loaded)
        if ('failure' in schemas) return schemas
        // Only the trusted loader mints this phantom brand, after all admission checks.
        return succeed(Object.freeze(loaded) as ToolLoadedRegistration<E, B>)
      } catch {
        return fail({
          kind: 'unavailable',
          dependency: 'tool-author',
          diagnostic: 'author loading failed',
        })
      }
    },
  }
}
