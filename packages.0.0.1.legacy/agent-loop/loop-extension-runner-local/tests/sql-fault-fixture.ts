import { Worker } from 'node:worker_threads'
import { vi } from 'vitest'

interface Request {
  readonly id: number
  readonly command?: { readonly kind: string; readonly sql?: string }
}
interface Reply {
  readonly id: number
  readonly ok: boolean
}

/** One fixture journal: refuse before insert, or lose its actual COMMIT receipt and hide reads. */
export function sqlJournalFault(committed: boolean) {
  const post = Worker.prototype.postMessage,
    emit = Worker.prototype.emit
  const pending = new WeakSet<Worker>()
  const receipts = new WeakMap<Worker, number>()
  let armed = false,
    blocked = false,
    failures = 0
  const failure = (id: number) => ({
    id,
    open: true,
    ok: false,
    error: {
      name: 'Error',
      message: 'controlled runner journal IO fault',
      code: 'ERR_SQLITE_ERROR',
      errcode: 10,
      errstr: 'disk I/O error',
    },
  })
  const posting = vi.spyOn(Worker.prototype, 'postMessage').mockImplementation(function (
    this: Worker,
    message: Request,
  ) {
    const sql = message.command?.sql ?? ''
    const insert = armed && /insert into "sl_entry"/iu.test(sql)
    const refuse = blocked && /^select\b/iu.test(sql) && sql.includes('sl_entry')
    if (refuse || (insert && !committed)) {
      if (insert) failures++
      blocked = true
      queueMicrotask(() => emit.call(this, 'message', failure(message.id)))
      return
    }
    if (insert) pending.add(this)
    if (/^COMMIT$/iu.test(sql) && pending.has(this)) {
      pending.delete(this)
      receipts.set(this, message.id)
    }
    post.call(this, message)
  })
  const receiving = vi.spyOn(Worker.prototype, 'emit').mockImplementation(function (
    this: Worker,
    event: string | symbol,
    ...args: unknown[]
  ) {
    const reply = args[0] as Reply | undefined
    if (event === 'message' && reply?.ok && receipts.get(this) === reply.id) {
      receipts.delete(this)
      failures++
      blocked = true
      return emit.call(this, event, failure(reply.id))
    }
    return emit.call(this, event, ...args)
  })
  return {
    arm() {
      armed = true
    },
    clear() {
      armed = false
      blocked = false
    },
    failures: () => failures,
    close() {
      armed = false
      blocked = false
      posting.mockRestore()
      receiving.mockRestore()
    },
  }
}
