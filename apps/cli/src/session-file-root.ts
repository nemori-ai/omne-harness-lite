import { parseTenantId, isOk, tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { OpenLeaseClockOptions } from '@omne-harness-lite/clock-lease'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import type { RuntimeCloseResult } from '@omne-harness-lite/model-request-runtime'
import { SessionRuntimeFiles } from './session-runtime-files.ts'
import { resolveStateHome } from './state-layout.ts'
import { checkedTenantBinding } from './state-layout-values.ts'
import {
  startSessionRuntimeRoot,
  startSessionDriverRuntimeRoot,
  confirmSessionRuntimeLogin,
  SessionRuntimeRootFailure,
} from './session-runtime-root.ts'
import type {
  SessionRuntimeRoot,
  SessionRuntimeRootOptions,
  SessionDriverRuntimeRootOptions,
} from './session-runtime-root-types.ts'
import { parseRunLoginBinding } from './session-preparation.ts'
import {
  createNativeSessionModelOwner,
  type SessionNativeModelOptions,
  type SessionNativeModelPoolOptions,
  type SessionNativeModelPool,
  createNativeSessionModelPool,
} from './session-native-model.ts'

export interface FileSessionModelOwner {
  readonly ready: Promise<SessionRuntimeRootOptions['model']>
  /** Actual physical pool closure, not a statement inferred from absence of calls. */
  readonly close: () => Promise<RuntimeCloseResult>
}
type FileSessionRuntimeInputs = Omit<
  SessionRuntimeRootOptions,
  'storage' | 'rootStorage' | 'clock' | 'model'
> & {
  readonly clockOptions?: Omit<OpenLeaseClockOptions, 'file' | 'initialize'>
}
export type FileSessionRuntimeOptions = FileSessionRuntimeInputs &
  (
    | { readonly nativeModel: SessionNativeModelOptions; readonly createModel?: never }
    | {
        readonly nativeModel?: never
        /** Return the original close owner before asynchronous acquisition. A thrown constructor retains no resources. */
        readonly createModel: (storage: AtomicStorage, clock: Clock) => FileSessionModelOwner
      }
  )
export type FileSessionDriverOptions = Omit<
  SessionDriverRuntimeRootOptions,
  'storage' | 'rootStorage' | 'clock' | 'model' | 'configure'
> & {
  readonly clockOptions?: Omit<OpenLeaseClockOptions, 'file' | 'initialize'>
  readonly nativeModel: SessionNativeModelPoolOptions
  readonly model: Omit<SessionDriverRuntimeRootOptions['model'], 'executionSource'>
  readonly configure: (
    owners: Parameters<SessionDriverRuntimeRootOptions['configure']>[0],
    pool: SessionNativeModelPool,
    work: Parameters<SessionDriverRuntimeRootOptions['configure']>[1],
    files: Pick<SessionRuntimeRootOptions, 'storage' | 'clock'>,
  ) => ReturnType<SessionDriverRuntimeRootOptions['configure']>
}

export async function startFileSessionDriverRoot(
  requested: FileSessionDriverOptions,
): Promise<SessionRuntimeRoot> {
  return startFileRoot(requested, async (owner, options) => {
    const model = createNativeSessionModelPool(owner.storage!, owner.clock!, options.nativeModel)
    owner.model = model
    const pool = await model.ready
    return startSessionDriverRuntimeRoot({
      ...options,
      storage: owner.storage!,
      rootStorage: owner.rootStorage!,
      clock: owner.clock!,
      model: { ...options.model, executionSource: () => pool.runtime.executionSource },
      configure: (owners, work) =>
        options.configure(owners, pool, work, {
          storage: owner.storage!,
          clock: owner.clock!,
        }),
    })
  })
}

/** Original resources remain available to the owner when startup cleanup cannot finish. */
export class FileSessionRuntimeFailure extends AggregateError {
  constructor(
    errors: readonly unknown[],
    readonly closeRetained: SessionRuntimeRoot['close'],
  ) {
    super(errors, 'file Session root startup failed; original resources retained')
  }
}
/** Production file owner. It does not invent deployment, model selection or execution authority. */
export async function startFileSessionRuntimeRoot(
  requested: FileSessionRuntimeOptions,
): Promise<SessionRuntimeRoot> {
  return startFileRoot(requested, async (owner, options) => {
    const model = options.nativeModel
      ? createNativeSessionModelOwner(owner.storage!, owner.clock!, options.nativeModel)
      : options.createModel(owner.storage!, owner.clock!)
    owner.model = model
    return startSessionRuntimeRoot({
      ...options,
      storage: owner.storage!,
      rootStorage: owner.rootStorage!,
      clock: owner.clock!,
      model: await model.ready,
    })
  })
}
type FileRootInputs = Omit<FileSessionRuntimeInputs, 'execution' | 'identities'> & {
  readonly nativeModel?: Pick<SessionNativeModelPoolOptions, 'directory'>
}
async function startFileRoot<T extends FileRootInputs>(
  requested: T,
  start: (owner: FileRootOwner, options: T) => Promise<SessionRuntimeRoot>,
): Promise<SessionRuntimeRoot> {
  const home = resolveStateHome({ explicitHome: requested.home, osHome: requested.home })
  const binding = Object.freeze(checkedTenantBinding(requested.binding))
  const source = parseRunLoginBinding(requested.source)
  if (
    !source ||
    source.centerId !== binding.centerId ||
    source.accountId !== binding.tenant.account
  )
    throw new TypeError('actual fixed Session source required')
  const options: T = { ...requested, home, binding, source: Object.freeze(source) }
  Object.freeze(options)
  if (!directoryMatchesRoot(options))
    throw new TypeError('model directory does not belong to the fixed Session root')
  await confirmSessionRuntimeLogin(options)
  const owner = new FileRootOwner(options)
  try {
    await owner.openFiles()
    const root = await start(owner, options)
    owner.root = root
    return Object.freeze({ socketPath: root.socketPath, owners: root.owners, close: owner.close })
  } catch (error) {
    if (error instanceof SessionRuntimeRootFailure) owner.retainedRoot = error.closeRetained
    try {
      const closed = await owner.close()
      if ('pending' in closed) throw new FileSessionRuntimeFailure([error], owner.close)
    } catch (cleanup) {
      if (cleanup instanceof FileSessionRuntimeFailure) throw cleanup
      throw new FileSessionRuntimeFailure([error, cleanup], owner.close)
    }
    throw error
  }
}
function directoryMatchesRoot(options: FileRootInputs): boolean {
  const directory = options.nativeModel?.directory
  if (!directory) return true
  const tenant = parseTenantId(directory.tenant)
  const source = parseRunLoginBinding(directory.source)
  return (
    isOk(tenant) &&
    tenantIdEquals(tenant.ok, options.binding.tenant) &&
    !!source &&
    source.centerId === options.source.centerId &&
    source.accountId === options.source.accountId &&
    source.loginStateHandle === options.source.loginStateHandle &&
    directory.governance === options.governance
  )
}

class FileRootOwner extends SessionRuntimeFiles {
  model?: Pick<FileSessionModelOwner, 'close'>
  root?: SessionRuntimeRoot
  retainedRoot?: SessionRuntimeRoot['close']
  closing?: ReturnType<SessionRuntimeRoot['close']>
  constructor(options: FileRootInputs) {
    super(options)
  }
  close = (): ReturnType<SessionRuntimeRoot['close']> => {
    if (!this.closing) {
      const attempt = this.finishClose()
      this.closing = attempt
      void attempt.then(
        result => {
          if ('pending' in result && this.closing === attempt) delete this.closing
        },
        () => {
          if (this.closing === attempt) delete this.closing
        },
      )
    }
    return this.closing
  }
  async finishClose(): ReturnType<SessionRuntimeRoot['close']> {
    const endRoot = this.retainedRoot ?? this.root?.close
    if (endRoot && 'pending' in (await endRoot())) return { pending: true }
    if (this.model && 'unavailable' in (await this.model.close())) return { pending: true }
    await this.closeFiles()
    return { closed: true }
  }
}
