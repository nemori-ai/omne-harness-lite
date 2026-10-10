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
import { capabilityCanonicalString, type CapabilityId } from '@omne-harness-lite/asset-model'
import { compareInteger } from '@omne-harness-lite/session-log'
import { createHash } from 'node:crypto'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type { SessionBootstrapAssembly } from './session-bootstrap.ts'

export interface SessionRunAssetOptions {
  readonly bootstrap: SessionBootstrapAssembly
  readonly journal: BorrowedRunJournal
  readonly tenancy: SessionTenancyService
  readonly initialFillRef: string
  readonly refreshRoot?: CapabilityId
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
    if (!(await restoreRegistry(input, registry)) || stopped) return { unavailable: true }
    return Object.freeze({ input, registry, history: sources.history })
  }
  async function restoreRegistry(input: CurrentInputReader, registry: AssetRegistry) {
    const { scope } = options.journal
    const head = await options.registry.manifest.readHead(scope.session)
    if (!('head' in head) || stopped) return false
    if (head.head === 0 && !(await fillInitial(input, registry, options))) return false
    if (
      head.head !== 0 &&
      options.refreshRoot &&
      !(await refreshRegistry(input, registry, options, head.head))
    )
      return false
    const restored = await registry.list(scope.session, 'tool', { kind: 'session' })
    return 'entries' in restored
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

async function refreshRegistry(
  input: CurrentInputReader,
  registry: AssetRegistry,
  options: SessionRunAssetOptions,
  head: number,
) {
  const ref = await rootChanged(input, options, head)
  if (ref === 'unavailable') return false
  if (ref === false) return true
  if (!(await fillInitial(input, registry, options, ref))) return false
  return (await rootChanged(input, options, head)) === false
}

async function rootChanged(
  input: CurrentInputReader,
  options: SessionRunAssetOptions,
  head: number,
) {
  const { scope } = options.journal
  const current = await input.read(scope.session, scope.tenant)
  if (!('input' in current)) return 'unavailable' as const
  const definition = capabilityCanonicalString(current.input.root.definition)
  if (!options.refreshRoot || definition !== capabilityCanonicalString(options.refreshRoot))
    return false
  const original = await options.registry.manifest.readEvaluation(scope.session)
  if (!('evaluation' in original)) return 'unavailable' as const
  if (definition !== capabilityCanonicalString(original.evaluation.root))
    return 'unavailable' as const
  const roots = original.evaluation.assets.filter(
    asset => capabilityCanonicalString(asset.capability) === definition,
  )
  const before = roots[0]
  if (roots.length !== 1 || !before) return 'unavailable' as const
  const after = current.input.root.source
  if (before.asset === after.asset && compareInteger(before.version, after.version) === 0)
    return false
  return (
    'fill:root:' +
    createHash('sha256')
      .update(
        writeJsonLossless([options.initialFillRef, head, definition, after.asset, after.version]),
      )
      .digest('hex')
  )
}

async function fillInitial(
  input: CurrentInputReader,
  registry: AssetRegistry,
  options: SessionRunAssetOptions,
  ref = options.initialFillRef,
): Promise<boolean> {
  const { scope } = options.journal
  const current = await input.read(scope.session, scope.tenant)
  if (!('input' in current)) return false
  const selected = (options.evaluator?.evaluate ?? evaluate)(current.input, options.evaluation)
  if (!('ok' in selected)) return false
  const filled = await registry.fill(scope.session, selected.ok, ref, selected.ok.composition)
  return 'snapshots' in filled
}
