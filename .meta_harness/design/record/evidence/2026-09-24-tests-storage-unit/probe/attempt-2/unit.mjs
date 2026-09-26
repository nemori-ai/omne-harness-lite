import { AsyncLocalStorage } from 'node:async_hooks'
import { StorageDefect, UniqueViolation, ReferenceViolation } from '../../../packages/core/storage/dist/index.js'

class Unit {
  #frames = new AsyncLocalStorage()
  #jobs = new Set()
  #closed = false
  #failure
  #notifications = []
  constructor(storage, tx) { this.storage = storage; this.tx = tx }
  #fail(message) {
    const error = new StorageDefect(message)
    this.#failure ??= error
    throw error
  }
  #frame() {
    if (this.#closed) this.#fail('unit closed')
    if (this.#failure) throw this.#failure
    const frame = this.#frames.getStore()
    if (!frame) this.#fail('unit used outside its callback')
    for (let at = frame; at; at = at.parent) if (!at.active) this.#fail('unit frame expired')
    return frame
  }
  assertStorage(storage) {
    this.#frame()
    if (storage !== this.storage) this.#fail('unit storage mismatch')
  }
  #invoke(fn, statement) {
    const parent = this.#frame()
    if (parent.busy) this.#fail('unit calls overlap')
    parent.busy = true
    const frame = { parent, active: true, busy: false }
    const job = Promise.resolve().then(() => this.#frames.run(frame, fn)).catch(error => {
      if (!statement || !(error instanceof UniqueViolation || error instanceof ReferenceViolation)) this.#failure ??= error
      throw error
    }).finally(() => {
      frame.active = false
      parent.busy = false
      this.#jobs.delete(job)
    })
    this.#jobs.add(job)
    void job.catch(() => undefined)
    return job
  }
  run(fn) { return this.#invoke(fn, false) }
  query(fn) { return this.#invoke(() => fn({ db: this.tx.db }), true) }
  mutate(fn) { return this.#invoke(() => fn(this.tx), true) }
  afterCommit(fn) { this.#frame(); this.#notifications.push(fn) }
  async execute(fn) {
    const root = { active: true, busy: false }
    let value
    try { value = await this.#frames.run(root, () => fn(this)) }
    catch (error) { this.#failure ??= error }
    finally { root.active = false; this.#closed = true }
    if (this.#jobs.size) this.#failure ??= new StorageDefect('unit callback returned with calls in flight')
    await Promise.allSettled([...this.#jobs])
    if (this.#failure) throw this.#failure
    return value
  }
  publish(diagnostic) {
    for (const notify of this.#notifications) {
      try {
        const result = notify()
        if (result && typeof result.then === 'function') {
          diagnostic('asynchronous notification')
          void Promise.resolve(result).catch(() => diagnostic('notification rejected'))
        }
      } catch { diagnostic('notification threw') }
    }
  }
}
export async function atomic(storage, fn, diagnostic = () => {}) {
  let unit
  const result = await storage.write(async tx => {
    unit = new Unit(storage, tx)
    return unit.execute(fn)
  })
  unit.publish(diagnostic)
  return result
}
