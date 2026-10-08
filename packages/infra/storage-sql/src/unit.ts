// P-13：显式事务参与。ALS 只跟踪单元内调用帧，不合并普通 Storage 调用。
import { AsyncLocalStorage } from 'node:async_hooks'
import { isStorageInstance } from './service-identity.ts'
import {
  ReferenceViolation,
  StorageDefect,
  UniqueViolation,
  type ReadTx,
  type Storage,
  type StorageUnit,
  type WriteTx,
} from '@omne-harness-lite/storage'

interface Frame {
  readonly parent?: Frame
  active: boolean
  busy: boolean
}

export class SqlStorageUnit implements StorageUnit {
  readonly #frames = new AsyncLocalStorage<Frame>()
  readonly #jobs = new Set<Promise<unknown>>()
  readonly #notifications: (() => void)[] = []
  #closed = false
  // 单独记录存在性：JavaScript 可以 throw undefined / null / false。
  #failure: { readonly error: unknown } | undefined
  readonly #completion: Promise<'committed' | 'rolledBack' | 'unknown'>
  readonly #complete: (result: 'committed' | 'rolledBack' | 'unknown') => void

  constructor(
    private readonly storage: Storage,
    private readonly tx: WriteTx,
  ) {
    let complete!: (result: 'committed' | 'rolledBack' | 'unknown') => void
    this.#completion = new Promise(resolve => {
      complete = resolve
    })
    this.#complete = complete
  }

  observeCompletion(): Promise<'committed' | 'rolledBack' | 'unknown'> {
    this.#frame()
    return this.#completion
  }

  /** Called by the original commit owner after its physical write operation ends. */
  complete(result: 'committed' | 'rolledBack' | 'unknown'): void {
    this.#complete(result)
  }

  completionAfterError(error: unknown): 'rolledBack' | 'unknown' {
    return this.#failure !== undefined && Object.is(error, this.#failure.error)
      ? 'rolledBack'
      : 'unknown'
  }

  #fail(message: string): never {
    const error = new StorageDefect(message)
    this.#failure ??= { error }
    throw error
  }

  #frame(): Frame {
    if (this.#closed) this.#fail('storage unit is closed')
    if (this.#failure !== undefined) throw this.#failure.error
    const frame = this.#frames.getStore()
    if (frame === undefined) this.#fail('storage unit used outside its callback')
    for (let at: Frame | undefined = frame; at !== undefined; at = at.parent) {
      if (!at.active) this.#fail('storage unit call frame has ended')
    }
    return frame
  }

  assertStorage(expected: Storage): void {
    if (this.#frame().busy) this.#fail('storage unit calls overlap')
    if (!isStorageInstance(expected, this.storage))
      this.#fail('storage unit belongs to a different instance')
  }

  #invoke<T>(fn: () => Promise<T>, statement: boolean): Promise<T> {
    const parent = this.#frame()
    if (parent.busy) this.#fail('storage unit calls overlap')
    parent.busy = true
    const frame: Frame = { parent, active: true, busy: false }
    const job = Promise.resolve()
      .then(() =>
        this.#frames.run(frame, () => {
          this.#frame()
          return fn()
        }),
      )
      .catch((error: unknown) => {
        // P-2 只在语句回调出口保留可恢复性；逃出 run 的任何异常都污染。
        if (
          !statement ||
          !(error instanceof UniqueViolation || error instanceof ReferenceViolation)
        ) {
          this.#failure ??= { error }
        }
        throw error
      })
      .finally(() => {
        frame.active = false
        parent.busy = false
        this.#jobs.delete(job)
      })
    this.#jobs.add(job)
    // 接纳时就观察拒绝；不改变交给调用方的原 Promise。
    void job.catch(() => undefined)
    return job
  }

  run<T>(fn: () => Promise<T>): Promise<T> {
    return this.#invoke(fn, false)
  }

  query<T>(fn: (tx: ReadTx) => Promise<T>): Promise<T> {
    return this.#invoke(() => fn({ db: this.tx.db }), true)
  }

  mutate<T>(fn: (tx: WriteTx) => Promise<T>): Promise<T> {
    return this.#invoke(() => fn(this.tx), true)
  }

  afterCommit(notify: () => void): void {
    if (this.#frame().busy) this.#fail('storage unit calls overlap')
    this.#notifications.push(notify)
  }

  async execute<T>(fn: (unit: StorageUnit) => Promise<T>): Promise<T> {
    const root: Frame = { active: true, busy: false }
    let result: { readonly value: T } | undefined
    try {
      result = { value: await this.#frames.run(root, () => fn(this)) }
    } catch (error) {
      this.#failure ??= { error }
    } finally {
      root.active = false
      this.#closed = true
    }
    if (this.#jobs.size > 0) {
      this.#failure ??= {
        error: new StorageDefect('storage unit callback ended with calls still in flight'),
      }
    }
    // 关闭新准入后已接纳的 SQL 仍需收场；不能先回滚/关连接。
    await Promise.allSettled([...this.#jobs])
    if (this.#failure !== undefined) throw this.#failure.error
    if (result === undefined) throw new StorageDefect('storage unit completed without a result')
    return result.value
  }

  /** 仅实际提交拥有者调用；已退出写事务和本单元 ALS。 */
  publish(reportFailure: () => void): void {
    const report = () => {
      try {
        reportFailure()
      } catch {
        // 诊断提供者失败不能改写已提交的业务结果；不输出原异常/秘密。
        console.error('storage-sql: after-commit notification diagnostic failed')
      }
    }
    for (const notify of this.#notifications.splice(0)) {
      try {
        const result: unknown = notify()
        if (result !== undefined) {
          report()
          // 非 void 返回是误用；仍立即观察可能的 Promise 拒绝，不等待它。
          void Promise.resolve(result).catch(report)
        }
      } catch {
        report()
      }
    }
  }
}
