// A rejected mutant run must remain visible instead of disappearing after a recovery retry,
// and a static mutant run must not silently drop the type tests that the dry run executed.
import {
  commonTokens,
  declareFactoryPlugin,
  PluginKind,
  tokens,
  type Injector,
  type PluginContext,
} from '@stryker-mutator/api/plugin'
import {
  MutantRunStatus,
  type TestRunner,
  type TestRunnerCapabilities,
} from '@stryker-mutator/api/test-runner'
import { strykerPlugins as vitestPlugins } from '@stryker-mutator/vitest-runner'
export { strykerValidationSchema } from '@stryker-mutator/vitest-runner'

function rejectionMessage(error: unknown): string {
  const fallback = 'TestRunner mutantRun rejected. Original diagnostic could not be formatted'
  try {
    const message = error instanceof Error ? error.stack || error.message : String(error)
    return typeof message === 'string' && message.length > 0 ? message : fallback
  } catch {
    // Formatting must not turn this Error result back into a rejected promise.
    return fallback
  }
}

/**
 * The upstream runner claims it can reload the environment, but it reuses one Vitest instance, and Vitest
 * reports type tests only on the first start of an instance (#649). Declaring no reload makes Stryker start
 * a fresh worker process before each static mutant, so every static run executes the same tests as the dry run.
 */
async function withoutInProcessReload(original: TestRunner): Promise<TestRunnerCapabilities> {
  return { ...(await original.capabilities()), reloadEnvironment: false }
}

export function guardMutantRun(original: TestRunner): TestRunner {
  return {
    capabilities: () => withoutInProcessReload(original),
    init: async () => {
      await original.init?.()
    },
    dryRun: options => original.dryRun(options),
    async mutantRun(options) {
      try {
        return await original.mutantRun(options)
      } catch (error) {
        return {
          status: MutantRunStatus.Error,
          errorMessage: rejectionMessage(error),
        }
      }
    },
    dispose: async () => {
      await original.dispose?.()
    },
  }
}

function factory(injector: Injector<PluginContext>): TestRunner {
  const candidates = vitestPlugins.filter(
    plugin => plugin.kind === PluginKind.TestRunner && plugin.name === 'vitest',
  )
  const original = candidates[0]
  if (candidates.length !== 1 || original === undefined)
    throw new Error('Expected exactly one public vitest TestRunner factory')
  return guardMutantRun(injector.injectFunction(original.factory))
}
factory.inject = tokens(commonTokens.injector)
export const strykerPlugins = [declareFactoryPlugin(PluginKind.TestRunner, 'omne-vitest', factory)]
