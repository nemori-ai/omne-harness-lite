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
  confirmSessionRuntimeLogin,
  SessionRuntimeRootFailure,
} from './session-runtime-root.ts'
import type { SessionRuntimeRoot, SessionRuntimeRootOptions } from './session-runtime-root-types.ts'
import { parseRunLoginBinding } from './session-preparation.ts'
import {
  createNativeSessionModelOwner,
  type SessionNativeModelOptions,
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
  const home = resolveStateHome({ explicitHome: requested.home, osHome: requested.home })
  const binding = Object.freeze(checkedTenantBinding(requested.binding))
  const source = parseRunLoginBinding(requested.source)
  if (
    !source ||
    source.centerId !== binding.centerId ||
    source.accountId !== binding.tenant.account
  )
    throw new TypeError('actual fixed Session source required')
  const options = Object.freeze({ ...requested, home, binding, source: Object.freeze(source) })
  if (!directoryMatchesRoot(options))
    throw new TypeError('model directory does not belong to the fixed Session root')
  await confirmSessionRuntimeLogin(options)
  const owner = new FileRootOwner(options)
  try {
    await owner.open()
    const root = await startSessionRuntimeRoot({
      ...options,
      storage: owner.storage!,
      rootStorage: owner.rootStorage!,
      clock: owner.clock!,
      model: owner.modelOptions!,
    })
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
function directoryMatchesRoot(options: FileSessionRuntimeOptions): boolean {
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
  model?: FileSessionModelOwner
  modelOptions?: SessionRuntimeRootOptions['model']
  root?: SessionRuntimeRoot
  retainedRoot?: SessionRuntimeRoot['close']
  closing?: ReturnType<SessionRuntimeRoot['close']>
  constructor(readonly options: FileSessionRuntimeOptions) {
    super(options)
  }
  async open() {
    const o = this.options
    await this.openFiles()
    this.model = o.nativeModel
      ? createNativeSessionModelOwner(this.storage!, this.clock!, o.nativeModel)
      : o.createModel(this.storage!, this.clock!)
    this.modelOptions = await this.model.ready
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
