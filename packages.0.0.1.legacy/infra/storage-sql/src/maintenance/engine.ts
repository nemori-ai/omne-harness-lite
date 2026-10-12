import { open, statfs } from 'node:fs/promises'
import { join } from 'node:path'
import {
  SnapshotFailure,
  StorageDefect,
  type SnapshotInput,
  type SnapshotInspection,
  type SnapshotRunOptions,
  type SnapshotSession,
  type SnapshotView,
} from '@omne-harness-lite/storage'
import { combineFailure, physicalFailure, withCleanup } from './failure.ts'
import { SnapshotResources } from './resources.ts'
import { MAX_SNAPSHOT_BYTES, SNAPSHOT_CHUNK_BYTES, useSnapshotView } from './view.ts'
import { SnapshotWorkspace } from './workspace.ts'

export type SnapshotProducer = (
  file: string,
  signal: AbortSignal,
  resources: SnapshotResources,
) => Promise<void>

interface Residue {
  readonly path: string
  readonly resources: SnapshotResources
}

/** Physical workspace owner, nested under the original source owner when online. */
export class SnapshotEngine {
  #closed = false
  #poisoned = false
  #active: Promise<unknown> | undefined
  #cancel: AbortController | undefined
  #closing: Promise<void> | undefined
  #released = false
  readonly #residue: Residue[] = []
  readonly #runResidue: SnapshotResources[] = []
  private constructor(
    readonly workspace: SnapshotWorkspace,
    private readonly source?: SnapshotProducer,
  ) {}

  get resourcesSettled(): boolean {
    return (
      this.#active === undefined &&
      this.#residue.every(item => item.resources.settled) &&
      this.#runResidue.every(scope => scope.settled)
    )
  }

  get ownershipReleased(): boolean {
    return this.#released
  }

  static async open(workRoot: string, source?: SnapshotProducer): Promise<SnapshotEngine> {
    return new SnapshotEngine(await SnapshotWorkspace.open(workRoot), source)
  }

  run<T>(
    fn: (session: SnapshotSession) => Promise<T>,
    options: SnapshotRunOptions = {},
  ): Promise<T> {
    if (this.#closed || this.#poisoned) return Promise.reject(new SnapshotFailure('unavailable'))
    if (this.#active !== undefined) return Promise.reject(new SnapshotFailure('busy'))
    const controller = new AbortController()
    this.#cancel = controller
    const abort = () => controller.abort()
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted === true) abort()
    const timer = setTimeout(abort, 300_000)
    const children = new Set<Promise<unknown>>()
    const runResources = new SnapshotResources()
    let childFailed = false
    let childError: unknown
    let live = true
    let operation = false
    const checkCancellation = () => {
      if (controller.signal.aborted) throw new SnapshotFailure('cancelled')
    }
    const execute = <R>(
      work: (file: string, resources: SnapshotResources) => Promise<R>,
    ): Promise<R> => {
      if (!live || operation)
        return Promise.reject(new StorageDefect('snapshot session is ended or already in use'))
      operation = true
      let cleanupFailed = false
      const task = (async () => {
        checkCancellation()
        return this.#task(work, () => {
          cleanupFailed = true
        })
      })().finally(() => {
        operation = false
      })
      children.add(task)
      void task.then(
        () => children.delete(task),
        error => {
          children.delete(task)
          // Ordinary validation refusals belong to the caller (e.g. count a bad
          // directory candidate and inspect the next). Cleanup failures and defects
          // cannot be swallowed, even if the callback catches that child rejection.
          if (cleanupFailed || !(physicalFailure(error) instanceof SnapshotFailure)) {
            childError = childFailed ? combineFailure(childError, error) : error
            childFailed = true
          }
        },
      )
      return task
    }
    const session: SnapshotSession = {
      ownResource: (close, isClosed) => runResources.own(close, isClosed),
      get cancelled() {
        return controller.signal.aborted
      },
      snapshot: use =>
        execute(async (file, resources) => {
          if (this.source === undefined) throw new SnapshotFailure('unavailable')
          await this.source(file, controller.signal, resources)
          checkCancellation()
          return useSnapshotView(file, use, resources)
        }),
      inspect: (input, use) =>
        execute(async (file, resources) => {
          await this.#import(file, input, resources, checkCancellation)
          checkCancellation()
          return useSnapshotView(file, use, resources)
        }),
    }
    // Defer the callback so active ownership is installed before any reentrant call.
    const task = Promise.resolve()
      .then(() =>
        withCleanup(
          async () => {
            checkCancellation()
            return fn(session)
          },
          async () => {
            live = false
            await Promise.allSettled(children)
            await withCleanup(
              async () => {
                if (childFailed) throw childError
              },
              async () => {
                try {
                  try {
                    await runResources.close()
                  } finally {
                    runResources.assertClean()
                  }
                } finally {
                  if (!runResources.settled) {
                    this.#poisoned = true
                    this.#runResidue.push(runResources)
                  }
                }
              },
            )
          },
        ),
      )
      .catch(error => {
        throw physicalFailure(error)
      })
      .finally(async () => {
        live = false
        await Promise.allSettled(children)
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', abort)
        this.#active = undefined
        this.#cancel = undefined
      })
    this.#active = task
    return task
  }

  async #task<T>(
    work: (file: string, resources: SnapshotResources) => Promise<T>,
    failedCleanup: () => void,
  ): Promise<T> {
    const path = await this.workspace.createTask()
    const resources = new SnapshotResources()
    return withCleanup(
      () => work(join(path, 'snapshot.sqlite'), resources),
      () =>
        withCleanup(
          () => resources.close(),
          async () => {
            if (!resources.settled) {
              this.#poisoned = true
              this.#residue.push({ path, resources })
            } else {
              try {
                await this.workspace.removeTask(path)
              } catch (error) {
                this.#residue.push({ path, resources })
                throw error
              }
            }
          },
        )
          .catch(error => {
            failedCleanup()
            throw error
          })
          .finally(() => {
            if (resources.closeFailed) failedCleanup()
          }),
    )
  }

  async #import(
    file: string,
    input: SnapshotInput,
    resources: SnapshotResources,
    check: () => void,
  ): Promise<void> {
    if (!Number.isSafeInteger(input.byteLength) || input.byteLength < 1)
      throw new SnapshotFailure('invalid-data')
    if (input.byteLength > MAX_SNAPSHOT_BYTES) throw new SnapshotFailure('capacity')
    const space = await statfs(this.workspace.root)
    if (space.bavail * space.bsize < input.byteLength * 2 + 268_435_456)
      throw new SnapshotFailure('capacity')
    const handle = await open(file, 'wx', 0o600)
    const close = resources.own(() => handle.close())
    let count = 0
    await withCleanup(async () => {
      try {
        for await (const chunk of input.chunks) {
          check()
          if (!(chunk instanceof Uint8Array)) throw new SnapshotFailure('invalid-data')
          if (chunk.byteLength > SNAPSHOT_CHUNK_BYTES) throw new SnapshotFailure('capacity')
          count += chunk.byteLength
          if (count > input.byteLength) throw new SnapshotFailure('invalid-data')
          await handle.writeFile(chunk)
        }
        if (count !== input.byteLength) throw new SnapshotFailure('invalid-data')
      } catch (error) {
        if (error instanceof SnapshotFailure || error instanceof StorageDefect) throw error
        throw new SnapshotFailure('unavailable', { cause: error })
      }
    }, close)
  }

  close(): Promise<void> {
    this.#closed = true
    this.#cancel?.abort()
    this.#closing ??= this.#close()
    return this.#closing
  }

  async #close(): Promise<void> {
    // A rejected operation has finished; a pending one still owns all its resources.
    await this.#active?.catch(() => undefined)
    let failure: unknown
    let failed = false
    for (const residue of this.#residue) {
      try {
        await residue.resources.close()
        if (residue.resources.settled) await this.workspace.removeTask(residue.path)
      } catch (error) {
        failed = true
        failure ??= error
      }
    }
    for (const scope of this.#runResidue) {
      try {
        await scope.close()
      } catch (error) {
        failure = failed ? combineFailure(failure, error) : error
        failed = true
      }
    }
    if (
      this.#residue.some(item => !item.resources.settled) ||
      this.#runResidue.some(scope => !scope.settled)
    ) {
      // Do not release the workspace lock. The enclosing source owner must also retain its lock.
      throw new StorageDefect('snapshot handles remain open; ownership is retained', {
        cause: failure,
      })
    }
    await this.workspace.close()
    this.#released = true
    if (failed) throw failure
  }
}

/** Offline tools receive no source path or snapshot operation. */
export async function openSnapshotInspection(workRoot: string): Promise<SnapshotInspection> {
  const engine = await SnapshotEngine.open(workRoot)
  return {
    run: (fn, options) =>
      engine.run(
        session =>
          fn({
            ownResource: (close, isClosed) => session.ownResource(close, isClosed),
            get cancelled() {
              return session.cancelled
            },
            inspect: <T>(input: SnapshotInput, use: (view: SnapshotView) => Promise<T>) =>
              session.inspect(input, use),
          }),
        options,
      ),
    close: () => engine.close(),
  }
}
