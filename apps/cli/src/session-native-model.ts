import { invokeModel } from '@omne-harness-lite/model-request-runtime-local'
import { createSessionModelReads } from '@omne-harness-lite/session-runtime-local'
import { createSessionModelSelection } from '@omne-harness-lite/session-runtime-local'
import { createSessionModelCallFacts } from '@omne-harness-lite/session-runtime-local'
import { sessionModelSettlement } from '@omne-harness-lite/session-runtime-local'
import { createSessionModelAcknowledgement } from '@omne-harness-lite/session-runtime-local'
import {
  publishSessionModelCallContent,
  sessionModelRequestPreparation,
} from '@omne-harness-lite/session-runtime-local'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import type {
  PlannedRequest,
  RawResponse,
  RetirementPolicy,
  RuntimeCloseResult,
} from '@omne-harness-lite/model-request-runtime'
import {
  createModelCallContentStore,
  type ModelCallContentPolicy,
  type CallFacts,
} from '@omne-harness-lite/model-request-runtime-local'
import {
  createSessionModelRuntime,
  createCallContainerStore,
  createCallContainerPresence,
  type SessionModelConstruction,
} from '@omne-harness-lite/session-runtime-local'
import {
  createModelTransportService,
  officialCatalog,
  type TransportOptions,
} from '@omne-harness-lite/pi-ai-transport'
import type { SessionRuntimeRootOptions } from './session-runtime-root-types.ts'
import {
  createSessionModelDirectory,
  type SessionModelDirectoryOptions,
  type SessionModelDirectoryRead,
} from './session-model-directory.ts'

type Construction = SessionModelConstruction<PlannedRequest, RawResponse>
type Runtime = ReturnType<typeof createSessionModelRuntime<PlannedRequest, RawResponse>>
type Calls = Construction['calls']
type Content = ReturnType<typeof createModelCallContentStore>
export interface SessionNativeModelPool {
  readonly runtime: Runtime
  readonly facts: CallFacts
  readonly content: Content
  readonly directory?: SessionModelDirectoryRead
}
/** Official model IDs and transport limits come from explicit application configuration. */
export interface SessionNativeModelOptions {
  readonly directory?: SessionModelDirectoryOptions
  readonly modelIds: readonly string[]
  readonly network: Omit<TransportOptions, 'definitions' | 'inputMeters' | 'baseUrl' | 'tls'>
  readonly retirement: RetirementPolicy
  readonly contentPolicy: ModelCallContentPolicy
  readonly externalContent?: Parameters<typeof createModelCallContentStore>[0]['externalContent']
  readonly maxFactScopes: number
  readonly sources: (
    calls: Calls,
    clock: Clock,
  ) => Omit<
    Construction,
    | 'calls'
    | 'invoke'
    | 'callFacts'
    | 'callPresence'
    | 'transport'
    | 'requestPreparation'
    | 'selectionFactory'
    | 'readFactory'
    | 'recordPublication'
    | 'acknowledgementFactory'
    | 'settlementFactory'
  >
  readonly bind: (
    pool: SessionNativeModelPool,
  ) => Omit<SessionRuntimeRootOptions['model'], 'executionSource'>
}
export type SessionNativeModelPoolOptions = Omit<SessionNativeModelOptions, 'bind'>

/** Own the existing ModelRuntime and the official OpenRouter transport over the tenant store. */
export function createNativeSessionModelOwner(
  storage: AtomicStorage,
  clock: Clock,
  options: SessionNativeModelOptions,
) {
  const bind = options.bind
  const owner = createNativeSessionModelPool(storage, clock, options)
  const ready = owner.ready.then(pool => ({
    ...bind(pool),
    executionSource: () => pool.runtime.executionSource,
  }))
  void ready.catch(() => {})
  return Object.freeze({ ready, close: owner.close })
}

/** Allocate the physical pool independently of a particular Session driver binding. */
export function createNativeSessionModelPool(
  storage: AtomicStorage,
  clock: Clock,
  options: SessionNativeModelPoolOptions,
) {
  const entries = configuredEntries(options.modelIds)
  const retirement = options.retirement
  if (
    !Number.isSafeInteger(retirement?.waitMilliseconds) ||
    retirement.waitMilliseconds <= 0 ||
    typeof retirement.force !== 'boolean' ||
    typeof retirement.schedule !== 'function'
  )
    throw new TypeError('explicit valid transport retirement policy required')
  const owner = new NativeModelOwner(
    storage,
    clock,
    Object.freeze({
      ...options,
      retirement: Object.freeze({ ...options.retirement }),
    }),
  )
  const ready = Promise.resolve().then(() => owner.initialize(entries))
  // The original owner exists before acquisition; a failed ready still has a close port.
  void ready.catch(() => {})
  owner.started = ready.then(
    () => undefined,
    () => undefined,
  )
  return Object.freeze({ ready, close: owner.close })
}
function configuredEntries(ids: readonly string[]) {
  if (!Array.isArray(ids) || ids.length === 0 || new Set(ids).size !== ids.length)
    throw new TypeError('explicit distinct official model IDs required')
  return ids.map(id => {
    const entry = officialCatalog.find(item => item.definition.modelId === id)
    if (!entry) throw new TypeError('configured official model not available')
    return entry
  })
}
class NativeModelOwner {
  directory?: ReturnType<typeof createSessionModelDirectory>
  content?: Content
  calls?: Calls
  facts?: CallFacts
  runtime?: Runtime
  transport?: ReturnType<typeof createModelTransportService>
  started?: Promise<void>
  stopping = false
  closing?: Promise<RuntimeCloseResult>
  constructor(
    readonly storage: AtomicStorage,
    readonly clock: Clock,
    readonly options: SessionNativeModelPoolOptions,
  ) {}
  async initialize(entries: ReturnType<typeof configuredEntries>): Promise<SessionNativeModelPool> {
    if (this.stopping) throw new Error('native model owner stopped before acquisition')
    if (this.options.directory)
      this.directory = createSessionModelDirectory(this.storage, this.clock, this.options.directory)
    const directory = await this.directory?.ready
    if (this.stopping) throw new Error('native model owner stopped during directory setup')
    this.content = createModelCallContentStore({
      storage: this.storage,
      policy: this.options.contentPolicy,
      ...(this.options.externalContent === undefined
        ? {}
        : { externalContent: this.options.externalContent }),
    })
    this.calls = createCallContainerStore<PlannedRequest, RawResponse>()
    const sources = this.options.sources(this.calls, this.clock)
    const presence = createCallContainerPresence(this.calls)
    this.facts = createSessionModelCallFacts({
      content: this.content,
      presence,
      maxScopes: this.options.maxFactScopes,
    })
    this.transport = createModelTransportService({
      policy: this.options.network.policy,
      ...(this.options.network.imagePreparation === undefined
        ? {}
        : { imagePreparation: this.options.network.imagePreparation }),
      ...(this.options.network.onDiagnostic === undefined
        ? {}
        : { onDiagnostic: this.options.network.onDiagnostic }),
    })
    for (const entry of entries) {
      const result = this.transport.registerAdaptation(
        entry.definition,
        entry.createInputMeter(entry.definition),
        this,
        () => {},
      )
      if ('rejected' in result) throw new Error('official model registration failed')
    }
    this.runtime = createSessionModelRuntime({
      invoke: invokeModel,
      acknowledgementFactory: createSessionModelAcknowledgement,
      settlementFactory: sessionModelSettlement,
      recordPublication: publishSessionModelCallContent,
      requestPreparation: sessionModelRequestPreparation,
      selectionFactory: createSessionModelSelection,
      readFactory: createSessionModelReads,
      ...sources,
      calls: this.calls,
      callFacts: this.facts,
      callPresence: presence,
      transport: {
        clearReuseScope: scope => this.transport!.clearReuseScope(scope),
        acquire: (binding, routeName) => {
          const result = this.transport!.acquire(binding, routeName)
          return 'lease' in result
            ? result
            : result.rejected === 'invalidInput'
              ? { invalidInput: { reason: 'malformed' } }
              : { unavailable: true }
        },
      },
    })
    return Object.freeze({
      runtime: this.runtime,
      facts: this.facts,
      content: this.content,
      ...(directory ? { directory } : {}),
    })
  }
  close = (): Promise<RuntimeCloseResult> => {
    this.stopping = true
    this.runtime?.closeAdmission()
    if (this.closing) return this.closing
    const attempt = this.finishClose()
    this.closing = attempt
    void attempt.then(
      result => {
        if ('unavailable' in result && this.closing === attempt) delete this.closing
      },
      () => {
        if (this.closing === attempt) delete this.closing
      },
    )
    return attempt
  }
  async finishClose(): Promise<RuntimeCloseResult> {
    await this.started
    if ('unavailable' in (await this.closeRuntime())) return { unavailable: true }
    if (this.content && 'unavailable' in (await this.content.close())) return { unavailable: true }
    if (this.transport) {
      const result = await this.transport.close(this.options.retirement)
      if ('remaining_active' in result) return { unavailable: true }
      if (!('retired' in result)) throw new Error('original model transport cleanup failed')
      await this.transport.closed
    }
    await this.directory?.close()
    return { released: true }
  }
  async closeRuntime(): Promise<RuntimeCloseResult> {
    if (this.runtime) {
      const result = await this.runtime.close()
      return 'unavailable' in result ? result : this.runtime.executionSource.release()
    }
    if (this.calls && 'unavailable' in (await this.calls.close())) return { unavailable: true }
    if (this.facts && 'unavailable' in (await this.facts.close())) return { unavailable: true }
    return { released: true }
  }
}
