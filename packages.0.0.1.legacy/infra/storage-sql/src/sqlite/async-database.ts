import type { DatabaseSyncOptions, SQLInputValue, StatementResultingChanges } from 'node:sqlite'
import { Worker } from 'node:worker_threads'
import { SnapshotFailure } from '@omne-harness-lite/storage'
import {
  restoreSqliteFailure,
  type SqliteCommand,
  type SqliteReply,
  type SqliteRow,
  type SqliteProgress,
  type BackupLimits,
} from './worker-protocol.ts'

interface Pending {
  resolve(value: unknown): void
  reject(error: unknown): void
  progress?: () => void
}

/** One native connection and its work queue live outside the application event loop. */
export class AsyncSqliteDatabase {
  readonly #worker: Worker
  readonly #pending = new Map<number, Pending>()
  readonly #backups = new Set<Int32Array>()
  readonly #exited: Promise<number>
  readonly ready: Promise<void>
  #next = 1
  #open = true // Opening is an owned resource, not evidence of closure.
  #exitObserved = false
  #failure: Error | undefined
  #workerError = false
  #closing: Promise<void> | undefined

  constructor(file: string, options: DatabaseSyncOptions = {}) {
    const url = new URL(
      import.meta.url.endsWith('.ts') ? './connection-worker.ts' : './connection-worker.js',
      import.meta.url,
    )
    this.ready = new Promise<void>((resolve, reject) => {
      this.#pending.set(0, { resolve: () => resolve(), reject })
    })
    this.#worker = new Worker(url, { workerData: { file, options }, execArgv: [] })
    this.#worker.on('message', (reply: SqliteReply | SqliteProgress) => this.#receive(reply))
    this.#worker.on('messageerror', error => this.#fail(error))
    this.#worker.on('error', error => {
      this.#workerError = true
      this.#fail(error)
    })
    this.#exited = new Promise(resolve => {
      this.#worker.once('exit', code => {
        // Exit is the resource barrier. An error event alone does not release resources.
        this.#open = false
        this.#exitObserved = true
        if (this.#pending.size > 0) this.#fail(new Error(`sqlite worker exited (${code})`))
        resolve(code)
      })
    })
  }

  get isOpen(): boolean {
    return !this.#exitObserved
  }

  #receive(reply: SqliteReply | SqliteProgress): void {
    const pending = this.#pending.get(reply.id)
    if (pending === undefined) {
      this.#fail(new Error('sqlite worker sent an unowned reply'))
      return
    }
    if ('progress' in reply) {
      pending.progress?.()
      return
    }
    this.#pending.delete(reply.id)
    this.#open = reply.open
    if (reply.ok) pending.resolve(reply.value)
    else pending.reject(restoreSqliteFailure(reply.error))
  }

  #fail(error: Error): void {
    this.#failure ??= error
    for (const control of this.#backups) {
      Atomics.store(control, 0, 1)
      Atomics.store(control, 1, 1)
      Atomics.notify(control, 1)
    }
    for (const pending of this.#pending.values()) pending.reject(this.#failure)
    this.#pending.clear()
  }

  async #request<T>(command: SqliteCommand, progress?: () => void): Promise<T> {
    if (this.#closing !== undefined && command.kind !== 'close')
      throw Object.assign(new Error('sqlite handle is closing'), { code: 'ERR_INVALID_STATE' })
    if (command.kind === 'close') await this.ready.catch(() => undefined)
    else await this.ready
    if (this.#failure !== undefined && command.kind !== 'close') throw this.#failure
    if (!this.#open)
      throw Object.assign(new Error('sqlite handle is closed'), { code: 'ERR_INVALID_STATE' })
    const id = this.#next++
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, {
        resolve: value => resolve(value as T),
        reject,
        ...(progress === undefined ? {} : { progress }),
      })
      try {
        this.#worker.postMessage({ id, command })
      } catch (error) {
        this.#pending.delete(id)
        reject(error)
      }
    })
  }

  exec(sql: string): Promise<void> {
    return this.#request({ kind: 'exec', sql })
  }

  all(
    sql: string,
    parameters: readonly SQLInputValue[] = [],
    limit?: number,
  ): Promise<SqliteRow[]> {
    return this.#request({
      kind: 'all',
      sql,
      parameters,
      ...(limit === undefined ? {} : { limit }),
    })
  }

  get(sql: string, parameters: readonly SQLInputValue[] = []): Promise<SqliteRow | undefined> {
    return this.#request({ kind: 'get', sql, parameters })
  }

  run(sql: string, parameters: readonly SQLInputValue[] = []): Promise<StatementResultingChanges> {
    return this.#request({ kind: 'run', sql, parameters })
  }

  rollback(): Promise<void> {
    return this.#request({ kind: 'rollback' })
  }

  async backup(
    file: string,
    options: {
      readonly signal?: AbortSignal
      readonly limits?: BackupLimits
      readonly progress?: () => void
    } = {},
  ): Promise<void> {
    const control = new Int32Array(new SharedArrayBuffer(8))
    this.#backups.add(control)
    const abort = () => {
      Atomics.store(control, 0, 1)
    }
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted === true) abort()
    let failed = false
    let failure: unknown
    const progress = () => {
      try {
        options.progress?.()
      } catch (error) {
        failed = true
        failure = error
        abort()
      } finally {
        Atomics.store(control, 1, 1)
        Atomics.notify(control, 1)
      }
    }
    try {
      await this.#request(
        {
          kind: 'backup',
          file,
          control: control.buffer,
          progress: options.progress !== undefined,
          ...(options.limits === undefined ? {} : { limits: options.limits }),
        },
        progress,
      )
    } catch (error) {
      if (failed) throw failure
      if (error instanceof Error && 'code' in error) {
        if (error.code === 'OMNE_SNAPSHOT_CANCELLED') throw new SnapshotFailure('cancelled')
        if (error.code === 'OMNE_SNAPSHOT_CAPACITY') throw new SnapshotFailure('capacity')
      }
      throw error
    } finally {
      this.#backups.delete(control)
      options.signal?.removeEventListener('abort', abort)
    }
  }

  close(): Promise<void> {
    this.#closing ??= this.#close().finally(() => {
      this.#closing = undefined
    })
    return this.#closing
  }

  async #close(): Promise<void> {
    await this.ready.catch(() => undefined)
    if (this.#open && !this.#workerError) {
      try {
        await this.#request({ kind: 'close' })
      } catch (error) {
        if (this.#workerError) await this.#exited
        throw error
      }
    }
    const code = await this.#exited
    if (code !== 0 || this.#failure !== undefined)
      throw this.#failure ?? new Error(`sqlite worker exited (${code})`)
  }
}
