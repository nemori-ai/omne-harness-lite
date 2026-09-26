import type { ClientLocalState } from '@omne-harness-lite/client-local-state'
import {
  exchangeGovernance,
  readPublicHealth,
  GovernanceClientConfigurationError,
} from '@omne-harness-lite/governance-center-client'
import { preUseAction, readLocal, type Runtime } from './actions.ts'
import { block, finish, origin, reportFrame } from './report.ts'
import {
  ClientUseUsageDefect,
  type ActionReport,
  type GovernanceClientOperations,
  type OpenUseOutcome,
} from './surface.ts'
import { Prepared } from './prepared.ts'
import type { InputPrompt } from './surface.ts'
import { Use } from './use.ts'
import { observationTime } from './observation-time.ts'
import { captureAction, freeze } from './validation.ts'

export interface CreateGovernanceClientOptions {
  readonly state: ClientLocalState
  readonly timeoutMs?: number
}
export function createGovernanceClient(
  options: CreateGovernanceClientOptions,
): GovernanceClientOperations {
  const timeoutMs = options.timeoutMs ?? 10_000
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000)
    throw new GovernanceClientConfigurationError('timeoutMs must be an integer from 1 to 120000')
  return new Client({
    state: options.state,
    timeoutMs,
    health: readPublicHealth,
    exchange: exchangeGovernance,
    observedAt: observationTime,
  })
}

/** Internal constructor for deterministic faults; public construction fixes transport. */
export class Client implements GovernanceClientOperations {
  #runtime: Runtime | undefined
  readonly #uses = new Set<Use>()
  readonly #inputs = new Set<Prepared>()
  readonly #jobs = new Set<Promise<unknown>>()
  #opening = 0
  #entering = 0
  #closed = false
  #closing: Promise<void> | undefined
  constructor(runtime: Runtime) {
    this.#runtime = runtime
  }

  #track<T>(job: Promise<T>): Promise<T> {
    this.#jobs.add(job)
    job.then(
      () => this.#jobs.delete(job),
      () => this.#jobs.delete(job),
    )
    return job
  }
  openUse(): Promise<OpenUseOutcome> {
    if (this.#closed) return Promise.reject(new ClientUseUsageDefect('closed'))
    if (this.#entering !== 0) return Promise.resolve({ kind: 'blocked', reason: 'busy' })
    this.#opening++
    return this.#track(
      this.#open().finally(() => {
        this.#opening--
      }),
    )
  }
  async #open(): Promise<OpenUseOutcome> {
    const runtime = this.#runtime
    if (runtime === undefined) throw new ClientUseUsageDefect('closed')
    const frame = reportFrame(undefined)
    const snapshot = await readLocal(runtime, frame)
    if (snapshot === undefined)
      return {
        kind: 'blocked',
        reason: frame.defect === undefined ? frame.admission.reason! : 'defect',
      }
    // close may have run while CLS was reading. Never hand out an untracked use.
    if (this.#closed) return { kind: 'blocked', reason: 'reenter-required' }
    if (snapshot.value === null) return { kind: 'blocked', reason: 'not-configured' }
    if (snapshot.value.login === undefined) return { kind: 'blocked', reason: 'not-logged-in' }
    const use = new Use(runtime, snapshot, () => this.#uses.delete(use))
    this.#uses.add(use)
    return freeze({ kind: 'use', use, origin: origin(snapshot.value) })
  }
  runAction(input: unknown): Promise<ActionReport> {
    return this.#run(input)
  }
  runPrepared(input: unknown, prompt: InputPrompt): Promise<ActionReport> {
    if (this.#closed) return Promise.reject(new ClientUseUsageDefect('closed'))
    const prepared = Prepared.capture(input, prompt)
    if (prepared === undefined) {
      const frame = reportFrame(undefined)
      block(frame, 'invalid-input')
      return Promise.resolve(finish(frame))
    }
    this.#inputs.add(prepared)
    return this.#run(prepared.intent, prepared).finally(() => {
      prepared.release()
      this.#inputs.delete(prepared)
    })
  }
  #run(input: unknown, prepared?: Prepared): Promise<ActionReport> {
    if (this.#closed) return Promise.reject(new ClientUseUsageDefect('closed'))
    // Capture synchronously; callers cannot change payloads after admission.
    const action = prepared?.intent ?? captureAction(input)
    const frame = reportFrame(action)
    if (action === undefined) {
      block(frame, 'invalid-input')
      return Promise.resolve(finish(frame))
    }
    if (action.action === 'invoke' || action.action === 'logout') {
      return this.#track(
        (async () => {
          const opened = await this.openUse()
          if (opened.kind === 'blocked') {
            block(frame, opened.reason)
            return finish(frame)
          }
          try {
            const result = await (prepared === undefined
              ? opened.use.run(action)
              : (opened.use as Use).runCaptured(prepared))
            return freeze({ ...result, use: result.use === 'active' ? 'ended' : result.use })
          } finally {
            await opened.use.close()
          }
        })(),
      )
    }
    if (action.action !== 'health' && (this.#uses.size !== 0 || this.#opening !== 0)) {
      block(frame, 'busy')
      return Promise.resolve(finish(frame))
    }
    // Reserve the entering phase before the first await, so openUse cannot race it.
    if (action.action !== 'health') this.#entering++
    return this.#track(
      preUseAction(this.#runtime!, action, frame, prepared)
        .then(() => finish(frame))
        .finally(() => {
          if (action.action !== 'health') this.#entering--
        }),
    )
  }
  close(): Promise<void> {
    if (this.#closing !== undefined) return this.#closing
    this.#closed = true
    for (const input of this.#inputs) input.cancel()
    // Stop all use admission now; waiting on root jobs alone leaves TUI handles open.
    const closingUses = [...this.#uses].map(use => use.close())
    this.#closing = Promise.allSettled([...closingUses, ...this.#jobs]).then(() => {
      this.#uses.clear()
      this.#runtime = undefined
    })
    return this.#closing
  }
}
