import { setTimeout as delay } from 'node:timers/promises'
import { StorageUnavailable } from '@omne-harness-lite/storage'
import { checkSideFiles, prepareFiles, type PrivateFiles } from './files.ts'
import { unavailableIo } from './io-errors.ts'
import { LocalState, readState } from './store.ts'
import { initialize, createStatePersistence } from './state-sql.ts'
import type { LocalStateStorage } from '@omne-harness-lite/client-local-state'
import { ClientStateOpenFailure } from './open-failure.ts'
import type {
  ClientLocalState,
  LocalStateStorageFactory,
} from '@omne-harness-lite/client-local-state'

function sqliteCode(error: unknown): number | undefined {
  return error instanceof Error && 'errcode' in error && typeof error.errcode === 'number'
    ? error.errcode & 0xff
    : undefined
}

export interface OpenClientLocalStateOptions {
  readonly directory: string
}
export interface OpenClientLocalStateDependencies {
  readonly storage: LocalStateStorageFactory
}
export interface ClientLocalStateInstance extends ClientLocalState {
  close(): Promise<void>
}

/** Only the process that exclusively created the file may initialize its identity. */
export async function openClientLocalState(
  options: OpenClientLocalStateOptions,
  dependencies: OpenClientLocalStateDependencies,
): Promise<ClientLocalStateInstance> {
  let files: PrivateFiles | undefined
  let storage: LocalStateStorage | undefined
  try {
    files = await prepareFiles(options.directory)
    const deadline = AbortSignal.timeout(5000)
    for (;;) {
      try {
        storage = await dependencies.storage.open(files.file)
        break
      } catch (error) {
        if (!([5, 6].includes(sqliteCode(error) ?? -1) || error instanceof StorageUnavailable))
          throw error
        if (deadline.aborted) throw new ClientStateOpenFailure('unavailable')
        await delay(25)
      }
    }
    if (files.creator) await initialize(storage)
    const persistence = createStatePersistence(storage)
    for (;;) {
      const result = await persistence.read(readState)
      if (result.kind === 'row') break
      if (result.reason !== 'invalid-record') throw new ClientStateOpenFailure(result.reason)
      // Emptiness belongs to the same snapshot as the failed reading. A second
      // catalog query could mistake another process's completed initialization for damage.
      if (files.creator || result.emptyCatalog !== true || deadline.aborted)
        throw new ClientStateOpenFailure('invalid-record')
      await delay(25)
    }
    await checkSideFiles(files.file)
    // Every opener confirms its own parent/file directory durability, including competitors.
    await files.sync()
    return new LocalState(persistence, files.sync, files.close)
  } catch (error) {
    const cleanup: unknown[] = []
    try {
      await storage?.close()
    } catch (failure) {
      cleanup.push(failure)
    }
    try {
      await files?.close()
    } catch (failure) {
      cleanup.push(failure)
    }
    if (cleanup.length)
      throw new AggregateError(
        [error, ...cleanup],
        'client-local-state: opening and cleanup failed',
      )
    if (error instanceof ClientStateOpenFailure) throw error
    if ([11, 26].includes(sqliteCode(error) ?? -1))
      throw new ClientStateOpenFailure('invalid-record')
    if (error instanceof StorageUnavailable || unavailableIo(error))
      throw new ClientStateOpenFailure('unavailable')
    throw error
  }
}
