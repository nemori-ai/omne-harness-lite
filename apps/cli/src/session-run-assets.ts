import {
  createAssetRegistry,
  type RegistryDependencies,
  type AssetRegistry,
} from '@omne-harness-lite/asset-registry-local'
import {
  evaluate,
  type AssetEvaluator,
  type EvaluationOptions,
} from '@omne-harness-lite/asset-evaluation'
import type { CurrentInputReader } from '@omne-harness-lite/evaluation-input-store'
import type { BorrowedRunJournal } from '@omne-harness-lite/session-runtime-local'
import type { SessionTenancyService } from '@omne-harness-lite/session-tenancy'
import type { SessionBootstrapAssembly } from './session-bootstrap.ts'

export interface SessionRunAssetOptions {
  readonly bootstrap: SessionBootstrapAssembly
  readonly journal: BorrowedRunJournal
  readonly tenancy: SessionTenancyService
  readonly initialFillRef: string
  readonly evaluation: EvaluationOptions
  readonly evaluator?: AssetEvaluator
  readonly registry: Omit<
    RegistryDependencies,
    'sessionTenancy' | 'currentInputs' | 'fixedRootInput' | 'historicalBody'
  >
}
export interface SessionRunAssets {
  readonly input: CurrentInputReader
  readonly registry: AssetRegistry
  readonly history: NonNullable<ReturnType<SessionBootstrapAssembly['runRegistry']>>['history']
}
export interface SessionRunAssetOwner {
  readonly ready: Promise<SessionRunAssets | { readonly unavailable: true }>
  readonly close: () => Promise<void>
}
export function createSessionRunAssets(options: SessionRunAssetOptions): SessionRunAssetOwner {
  let input: CurrentInputReader | undefined
  let sources: ReturnType<SessionBootstrapAssembly['runRegistry']>
  let registry: AssetRegistry | undefined
  let stopped = false
  async function start(): SessionRunAssetOwner['ready'] {
    if (stopped) return { unavailable: true }
    const { journal } = options
    if ((await options.bootstrap.ensureRun(journal.scope, journal)) !== 'ready' || stopped)
      return { unavailable: true }
    input = options.bootstrap.runInputs(journal.scope, journal)
    sources = options.bootstrap.runRegistry(journal.scope, journal, options.registry.manifest)
    if (!input || !sources) return { unavailable: true }
    registry = createAssetRegistry({
      ...options.registry,
      sessionTenancy: options.tenancy,
      currentInputs: input,
      fixedRootInput: sources.fixedRoot,
      historicalBody: sources.history,
    })
    const head = await options.registry.manifest.readHead(journal.scope.session)
    if (!('head' in head) || stopped) return { unavailable: true }
    if (head.head === 0 && !(await fillInitial(input, registry, options)))
      return { unavailable: true }
    const restored = await registry.list(journal.scope.session, 'tool', { kind: 'session' })
    if (!('entries' in restored) || stopped) return { unavailable: true }
    return Object.freeze({ input, registry, history: sources.history })
  }
  const ready = Promise.resolve().then(start)
  const started = ready.then(
    () => undefined,
    () => undefined,
  )
  return Object.freeze({
    ready,
    async close() {
      stopped = true
      await started
      await registry?.close()
      await sources?.close()
      await input?.close()
    },
  })
}

async function fillInitial(
  input: CurrentInputReader,
  registry: AssetRegistry,
  options: SessionRunAssetOptions,
): Promise<boolean> {
  const { scope } = options.journal
  const current = await input.read(scope.session, scope.tenant)
  if (!('input' in current)) return false
  const selected = (options.evaluator?.evaluate ?? evaluate)(current.input, options.evaluation)
  if (!('ok' in selected)) return false
  const filled = await registry.fill(
    scope.session,
    selected.ok,
    options.initialFillRef,
    selected.ok.composition,
  )
  return 'snapshots' in filled
}
