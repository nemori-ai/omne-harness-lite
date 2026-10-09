import { setTimeout as wait } from 'node:timers/promises'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { LocalSessionIngress } from '@omne-harness-lite/session-runtime-local'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import { compareInteger } from '@omne-harness-lite/session-log'
import { createSessionHostEndpoint, type SessionCreationDefaults } from './session-host-protocol.ts'
import {
  startLocalSessionHost,
  type LocalSessionHost,
  type SessionHostPolicy,
} from './session-host-server.ts'
import { prepareSessionModelRun, type SessionRunIdentities } from './session-run-preparation.ts'
import {
  createSessionModelAttempt,
  type SessionModelAttempt,
  type SessionModelAttemptOptions,
  type OriginalSessionModelWork,
} from './session-agent-attempt.ts'
import type { RetainedSessionModelTurn } from '@omne-harness-lite/session-runtime-local'
import type { TenantBinding } from './state-layout-values.ts'
import { checkedTenantBinding } from './state-layout-values.ts'
import type {
  SessionDriverWorkOwner,
  SessionDriverWorkToken,
} from '@omne-harness-lite/session-runtime-local'

type Prepared = Extract<Awaited<ReturnType<typeof prepareSessionModelRun>>, { kind: 'prepared' }>
export interface SessionExecutionPolicy {
  readonly scanLimit: number
  readonly intervalMs: number
  readonly maxTasks: number
  readonly maxHeld: number
  readonly maxFailures: number
}
export interface RunningSessionHostOptions {
  readonly home: string
  readonly binding: TenantBinding
  readonly ingress: LocalSessionIngress
  readonly creation?: SessionCreationDefaults
  /** The same actual work owner supplied to Ingress.workSettledIn by the trusted root. */
  readonly work: SessionDriverWorkOwner
  readonly transport: SessionHostPolicy
  readonly execution: SessionExecutionPolicy
  /** The root binds these identities to the original durable input, before any step commit. */
  readonly identities: (scope: SessionScope, position: JsonNumber) => SessionRunIdentities
  /** Actual runtime/qualification owners; this function cannot dispatch a model itself. */
  readonly model: (scope: SessionScope, prepared: Prepared) => Promise<SessionModelAttemptOptions>
  readonly diagnostic: (error: unknown) => void
}
export interface RunningSessionHost {
  readonly socketPath: string
  /** Only this host's admission and waits stop. Borrowed execution pools never close here. */
  readonly close: () => Promise<
    { readonly closed: true } | { readonly pending: true; readonly held: number }
  >
}
interface Slot {
  readonly scope: SessionScope
  readonly identities: SessionRunIdentities
  frame?: SessionModelAttempt
  options?: SessionModelAttemptOptions
  work?: OriginalSessionModelWork
  retained?: RetainedSessionModelTurn
  driving?: Promise<void>
  workToken?: SessionDriverWorkToken
}

/** Own the listener and background model jobs. Neither reads nor client signals drive the queue. */
export async function startRunningSessionHost(
  options: RunningSessionHostOptions,
): Promise<RunningSessionHost> {
  for (const field of ['scanLimit', 'intervalMs', 'maxTasks', 'maxHeld', 'maxFailures'] as const) {
    const value = options.execution[field]
    if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647)
      throw new TypeError('bounded host execution policy required')
  }
  requireRootPorts(options)
  const captured = Object.freeze({
    ...options,
    binding: Object.freeze(checkedTenantBinding(options.binding)),
    execution: Object.freeze({ ...options.execution }),
  })
  const root = new ExecutionHost(captured)
  const server = await startLocalSessionHost({
    home: captured.home,
    binding: captured.binding,
    endpoint: createSessionHostEndpoint(captured),
    policy: captured.transport,
    diagnostic: error => root.fail(error),
  })
  root.server = server
  root.start()
  return Object.freeze({ socketPath: server.socketPath, close: root.close })
}
function requireRootPorts(options: RunningSessionHostOptions) {
  if (
    typeof options.identities !== 'function' ||
    typeof options.model !== 'function' ||
    typeof options.diagnostic !== 'function'
  )
    throw new TypeError('actual root configuration required')
  if (
    !options.work ||
    !(['begin', 'readIn', 'complete', 'release'] as const).every(
      key => typeof options.work[key] === 'function',
    )
  )
    throw new TypeError('actual model work owner required')
}
class ExecutionHost {
  server!: LocalSessionHost
  readonly local = new AbortController()
  readonly tasks = new Set<Promise<void>>()
  readonly slots = new Map<string, Slot>()
  readonly failures: unknown[] = []
  additionalFailures = 0
  readonly failedSessions = new Set<string>()
  cursor: Parameters<LocalSessionIngress['scanWork']>[1] = null
  admitting = true
  scanning?: Promise<void>
  closing?: ReturnType<RunningSessionHost['close']>
  constructor(readonly options: RunningSessionHostOptions) {}
  start() {
    this.scanning = this.scan()
    // Observe the actual task; a rejected scan retains the root and stops new admission.
    void this.scanning.catch(error => this.fail(error))
  }
  async scan() {
    while (this.admitting) {
      const page = await this.options.ingress.scanWork(
        this.options.ingress.coordinationAuthority,
        this.cursor,
        this.options.execution.scanLimit,
      )
      if ('failure' in page) {
        if (page.failure !== 'unavailable') throw new Error(`session scan: ${page.failure}`)
      } else {
        this.cursor = page.next
        for (const session of page.sessions) await this.admit(session)
      }
      try {
        await wait(this.options.execution.intervalMs, undefined, { signal: this.local.signal })
      } catch (error) {
        if (!this.local.signal.aborted) throw error
      }
    }
  }
  async admit(session: SessionScope['session']) {
    if (!this.canAdmit(session)) return
    const scope = Object.freeze({ tenant: this.options.binding.tenant, session })
    const read = await this.options.ingress.readWork(
      this.options.ingress.coordinationAuthority,
      scope,
      1,
    )
    if (
      !('kind' in read) ||
      read.inputs.length === 0 ||
      read.head.run?.state === 'runnable' ||
      read.head.run?.state === 'waiting'
    )
      return
    if (!this.admitting) return
    const slot: Slot = {
      scope,
      identities: Object.freeze({ ...this.options.identities(scope, read.inputs[0]!) }),
    }
    this.slots.set(session, slot)
    const task = this.run(slot)
    slot.driving = task
    this.own(task, session)
  }
  canAdmit(session: SessionScope['session']) {
    return (
      this.admitting &&
      !this.slots.has(session) &&
      !this.failedSessions.has(session) &&
      this.tasks.size < this.options.execution.maxTasks &&
      this.slots.size < this.options.execution.maxHeld
    )
  }
  own(task: Promise<void>, session: string) {
    this.tasks.add(task)
    void task.then(
      () => this.tasks.delete(task),
      error => {
        this.tasks.delete(task)
        this.failedSessions.add(session)
        this.fail(error)
      },
    )
  }
  async run(slot: Slot) {
    const prepared = await prepareSessionModelRun({
      ingress: this.options.ingress,
      scope: slot.scope,
      identities: slot.identities,
    })
    if (!('kind' in prepared) || prepared.kind !== 'prepared') {
      if ('kind' in prepared && prepared.kind === 'idle') this.slots.delete(slot.scope.session)
      return
    }
    const configured = await this.options.model(slot.scope, prepared)
    // Returning the binding transfers its references even when validation exposes a root defect.
    slot.options = configured
    validateTurn(slot.scope, prepared, configured, this.options.ingress)
    slot.workToken = this.options.work.begin(slot.scope, prepared.preparation)
    const frame = createSessionModelAttempt({
      ...configured,
      turn: {
        ...configured.turn,
        retain: async retained => {
          slot.retained = retained
          await configured.turn.retain(retained)
        },
      },
      transfer: async work => {
        if (slot.work && slot.work !== work) throw new TypeError('different original model task')
        if (!slot.work) {
          slot.work = work
          this.own(this.completeTransferred(slot, prepared, work), slot.scope.session)
        }
        return 'retained'
      },
    })
    slot.frame = frame
    const driven = await frame.drive(this.local.signal)
    if (!('kind' in driven) || driven.kind !== 'committed') return
    await this.finish(slot, prepared, driven.source)
  }
  async completeTransferred(slot: Slot, prepared: Prepared, work: OriginalSessionModelWork) {
    const completed = await work.completion
    await slot.driving
    if (!('acknowledged' in completed)) return
    const read = await this.options.ingress.readWork(
      this.options.ingress.coordinationAuthority,
      slot.scope,
      1,
    )
    if (!('kind' in read)) return
    await this.finish(slot, prepared, read.source)
  }
  async finish(slot: Slot, prepared: Prepared, source: Prepared['source']) {
    const ingress = this.options.ingress
    const result = await ingress.modelResults.read(
      ingress.coordinationAuthority,
      slot.scope,
      prepared.preparation.call,
      slot.options!.turn.resultKey,
    )
    if (
      !('pending' in result) ||
      result.pending.outcome !== 'complete' ||
      result.pending.reply.blocks.some(block => block.kind === 'tool_call')
    )
      return
    this.options.work.complete(slot.workToken!)
    const finished = await ingress.lifecycle.commitStep(
      ingress.coordinationAuthority,
      slot.scope,
      source,
      {
        kind: 'finish',
        stepKey: `${slot.identities.prepareKey}:finish`,
        run: prepared.preparation.run,
        attempt: prepared.preparation.attempt,
        permit: prepared.preparation.permit,
        terminal: 'completed',
        reason: 'model_reply_complete',
      },
    )
    if (!('kind' in finished) || finished.kind !== 'committed') return
    const released = await slot.frame!.close()
    if (!('kind' in released) || released.kind !== 'released') return
    await slot.options!.turn.linked.returnJournal()
    this.options.work.release(slot.workToken!)
    this.slots.delete(slot.scope.session)
  }
  fail(error: unknown) {
    this.admitting = false
    this.local.abort()
    this.server?.stopAdmission()
    this.record(error)
    try {
      this.options.diagnostic(error)
    } catch (diagnostic) {
      this.record(diagnostic)
    }
  }
  record(error: unknown) {
    if (this.failures.includes(error)) return
    if (this.failures.length < this.options.execution.maxFailures) this.failures.push(error)
    else this.additionalFailures++
  }
  close = (): ReturnType<RunningSessionHost['close']> => {
    if (this.closing) return this.closing
    this.closing = this.finishClose()
    return this.closing
  }
  async finishClose(): ReturnType<RunningSessionHost['close']> {
    this.admitting = false
    this.local.abort()
    this.server.stopAdmission()
    const ends = await Promise.allSettled([this.server.close(), this.scanning])
    this.recordRejected(ends)
    await this.drain()
    this.recordRejected(
      await Promise.allSettled([...this.slots.values()].map(slot => slot.frame?.close())),
    )
    await this.drain()
    if (this.failures.length)
      throw new AggregateError(
        this.failures,
        `running Session host failed; ${this.additionalFailures} additional failures; original resources retained`,
      )
    if (this.slots.size) return { pending: true, held: this.slots.size }
    return { closed: true }
  }
  async drain() {
    while (this.tasks.size) await Promise.allSettled([...this.tasks])
  }
  recordRejected(ends: readonly PromiseSettledResult<unknown>[]) {
    for (const end of ends) if (end.status === 'rejected') this.record(end.reason)
  }
}
function validateTurn(
  scope: SessionScope,
  prepared: Prepared,
  configured: SessionModelAttemptOptions,
  ingress: LocalSessionIngress,
) {
  const original = configured.turn.preparation
  if (
    configured.turn.ingress !== ingress ||
    !tenantIdEquals(configured.turn.scope.tenant, scope.tenant) ||
    configured.turn.scope.session !== scope.session ||
    !samePreparation(original, prepared.preparation)
  )
    throw new TypeError('actual original prepared model turn required')
}
function samePreparation(original: Prepared['preparation'], expected: Prepared['preparation']) {
  return (
    original.permit === expected.permit &&
    original.run === expected.run &&
    original.call === expected.call &&
    original.stepKey === expected.stepKey &&
    original.originalPosition === expected.originalPosition &&
    compareInteger(original.attempt, expected.attempt) === 0
  )
}
