import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { CURRENT_EVALUATION_INPUTS } from '@omne-harness-lite/asset-evaluation/cordis'
import { TOOL_RUNTIME_REGISTRY } from '@omne-harness-lite/tool-execution-runtime/cordis'
import { EXECUTION_ENVIRONMENTS } from '@omne-harness-lite/execution-environments/cordis'
import {
  captureEnvironmentReference,
  type EnvironmentReference,
  type EnvironmentPlacementSource,
} from '@omne-harness-lite/execution-environments'
import {
  ASSEMBLY_LIFETIME_SERVICE,
  startAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import type { AssemblyDeclaration } from '@omne-harness-lite/cordis-plugin-tree'
import {
  ToolEnvironmentPlacementConfig,
  createToolEnvironmentPlacementSource,
} from './environment-placement.ts'
import { sameJson } from './json-values.ts'

const Config = ToolEnvironmentPlacementConfig.extend({
  selection: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('unique') }).strict(),
    z
      .object({
        kind: z.literal('reference'),
        reference: z.custom<EnvironmentReference>(
          value => captureEnvironmentReference(value) !== undefined,
        ),
      })
      .strict(),
  ]),
}).strict()

/** Configuration is data. The static binding implements the explicit selection policy. */
function register(ctx: Context, config: z.infer<typeof Config>) {
  const configured =
    config.selection.kind === 'reference'
      ? captureEnvironmentReference(config.selection.reference)
      : undefined
  const select: EnvironmentPlacementSource['select'] = async (_placement, candidates) => {
    if (configured) {
      const selected = candidates.find(value => sameJson(value.reference, configured))
      return selected
        ? { kind: 'selected', reference: selected.reference }
        : { kind: 'rejected', reason: 'noMatchingEnvironment' }
    }
    if (candidates.length !== 1 || !candidates[0])
      return { kind: 'rejected', reason: 'ambiguousEnvironment' }
    return { kind: 'selected', reference: candidates[0].reference }
  }
  const source = createToolEnvironmentPlacementSource(
    { name: config.name, factoryPermission: config.factoryPermission },
    { currentInputs: ctx.currentEvaluationInputs, tools: ctx.toolRuntimeRegistry, select },
  )
  return ctx.executionEnvironments.registerPlacementSource(source)
}

export const toolEnvironmentPlacement = definePlugin({
  name: 'tool-environment-placement',
  Config,
  inject: [CURRENT_EVALUATION_INPUTS, TOOL_RUNTIME_REGISTRY, EXECUTION_ENVIRONMENTS],
  apply(ctx, config) {
    register(ctx, config)
  },
})

export const managedToolEnvironmentPlacement = Object.assign(
  definePlugin({
    name: 'tool-environment-placement-managed',
    Config,
    inject: [
      CURRENT_EVALUATION_INPUTS,
      TOOL_RUNTIME_REGISTRY,
      EXECUTION_ENVIRONMENTS,
      ASSEMBLY_LIFETIME_SERVICE,
    ],
    apply(ctx, config) {
      let withdraw: (() => Promise<void>) | undefined
      startAssemblyWork(
        ctx,
        async () => {
          withdraw = register(ctx, config)
        },
        async () => {
          await withdraw?.()
        },
      )
    },
  }),
  {
    assemblyLifecycle: 1 as const,
    describeAssembly(value: unknown): AssemblyDeclaration {
      Config.parse(value)
      return {
        provides: [],
        requires: [CURRENT_EVALUATION_INPUTS, TOOL_RUNTIME_REGISTRY, EXECUTION_ENVIRONMENTS],
        optional: [],
        dynamicProvides: [],
        dynamicRequires: [],
        claims: [],
      }
    },
  },
)
