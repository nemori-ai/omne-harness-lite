import { setTimeout as delay } from 'node:timers/promises'
import {
  checkSessionDriverPolicy,
  type SessionDriverControl,
  type SessionDriverCloseResult,
  type SessionDriverObservations,
} from '@omne-harness-lite/session-runtime'
import { parseTenantId, tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { SessionRef } from '@omne-harness-lite/messages'
import type { LocalSessionDriverOptions } from './driver-types.ts'
import { createDriverTaskOwner } from './driver-tasks.ts'
import { createDriverRunTask } from './driver-run-task.ts'

/** Own durable scanning and original Run tasks. Borrowed execution pools remain with their owners. */
export async function createLocalSessionDriver(
  requested: LocalSessionDriverOptions,
  signal: AbortSignal,
): Promise<SessionDriverControl & SessionDriverObservations> {
  const tenant = parseTenantId(requested.tenant)
  const policy = checkSessionDriverPolicy(requested.policy)
  if (!('ok' in tenant) || !('policy' in policy) || typeof requested.diagnostic !== 'function')
    throw new TypeError('fixed driver tenant, explicit policy and diagnostic required')
  const driver = new LocalDriver(
    Object.freeze({ ...requested, tenant: tenant.ok, policy: policy.policy }),
    signal,
  )
  driver.start()
  return Object.freeze({
    requestStop: driver.requestStop,
    close: driver.close,
    readRunAdmission: (scope: SessionScope) =>
      tenantIdEquals(scope.tenant, driver.options.tenant)
        ? driver.tasks.readRunAdmission(scope.session)
        : null,
  })
}

class LocalDriver {
  readonly stop = new AbortController()
  readonly tasks: ReturnType<typeof createDriverTaskOwner>
  readonly failures: unknown[] = []
  additionalFailures = 0
  cursor: SessionRef | null = null
  scanning?: Promise<void>
  closing?: Promise<SessionDriverCloseResult>
  constructor(
    readonly options: LocalSessionDriverOptions,
    readonly signal: AbortSignal,
  ) {
    this.tasks = createDriverTaskOwner(options.policy, error => this.fail(error))
    signal.addEventListener('abort', this.requestStop, { once: true })
    if (signal.aborted) this.requestStop()
  }
  start() {
    this.scanning = this.scan().catch(error => this.fail(error))
  }
  requestStop = () => {
    if (this.stop.signal.aborted) return
    this.stop.abort()
    this.tasks.requestStop()
  }
  record(error: unknown) {
    if (this.failures.includes(error)) return
    if (this.failures.length < this.options.policy.maxFailures) this.failures.push(error)
    else this.additionalFailures++
  }
  fail(error: unknown) {
    this.requestStop()
    this.record(error)
    try {
      this.options.diagnostic(error)
    } catch (diagnostic) {
      this.record(diagnostic)
    }
  }
  async scan() {
    while (!this.stop.signal.aborted) {
      await this.scanPage()
      await this.wait()
    }
  }
  async scanPage() {
    const { options } = this
    if ((await options.clock.now()) === 'unavailable')
      throw new Error('original driver Clock unavailable')
    if (this.stop.signal.aborted) return
    const page = await options.ingress.scanWork(
      options.ingress.coordinationAuthority,
      this.cursor,
      Math.min(options.policy.scanLimit, options.policy.maxStepsPerPass),
    )
    if (!('kind' in page))
      throw new Error(`original Session work scan ${page.failure}`, { cause: page })
    if (this.stop.signal.aborted) return
    this.cursor = page.next
    for (const session of page.sessions) {
      if (this.stop.signal.aborted) return
      const scope = Object.freeze({ tenant: this.options.tenant, session })
      this.tasks.admit(session, async () => createDriverRunTask(options, scope))
    }
  }
  async wait() {
    if (this.stop.signal.aborted) return
    try {
      await delay(this.options.policy.intervalMs, undefined, { signal: this.stop.signal })
    } catch (error) {
      if (this.stop.signal.aborted && error instanceof Error && error.name === 'AbortError') return
      throw error
    }
  }
  close = (): Promise<SessionDriverCloseResult> => {
    this.requestStop()
    this.closing ??= this.finishClose().finally(() => {
      delete this.closing
    })
    return this.closing
  }
  async finishClose(): Promise<SessionDriverCloseResult> {
    await this.scanning
    let result: SessionDriverCloseResult | undefined
    const errors = [...this.failures]
    try {
      result = await this.tasks.close()
    } catch (error) {
      errors.push(error)
    }
    if (errors.length)
      throw new AggregateError(
        errors,
        `Session driver failed; ${this.additionalFailures} additional failures; originals retained`,
      )
    if (!result) throw new Error('original driver close result missing')
    if ('closed' in result) this.signal.removeEventListener('abort', this.requestStop)
    return result
  }
}
