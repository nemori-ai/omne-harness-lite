import {
  createAttemptOwner,
  driveStep,
  nextStep,
  releaseAttempt,
  type CurrentInputs,
  type DriveResult,
  type LoopFacts,
  type DecisionOrigin,
} from '@omne-harness-lite/agent-loop'
import {
  readSettlementPrefix,
  interpretCallHistory,
  type SettlementPrefix,
  type SettlementRegistration,
} from '@omne-harness-lite/model-request-runtime'
import { readSessionFact } from '@omne-harness-lite/session-runtime'
import { sourceTokenEquals, compareInteger } from '@omne-harness-lite/session-log'
import {
  runSessionModelTurn,
  type SessionModelTurnOptions,
  type SessionModelTurnResult,
} from './model-turn.ts'
import { createSessionRunHistory } from './run-history.ts'
import type { LocalSessionContext } from './session-context-types.ts'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { instantToRfc3339 } from '@omne-harness-lite/offer-expiry'

/** Observe the original normal-path attempt from its actual owners; this does not recover executions. */
export function createSessionModelObservations(
  turn: SessionModelTurnOptions,
  registration: SettlementRegistration,
  context: LocalSessionContext,
): (facts: LoopFacts) => Promise<CurrentInputs> {
  if (
    context.scope.session !== turn.scope.session ||
    !tenantIdEquals(context.scope.tenant, turn.scope.tenant)
  )
    throw new TypeError('actual original Session Context required')
  const assembly = observedAssembly(turn)
  return async () => {
    const read = await readSettlementPrefix({ binding: turn.linked.binding.log, registration })
    const generation = context.currentGeneration()
    if (!('prefix' in read))
      return {
        source: null,
        authorized: null,
        assembly,
        contextGeneration: generation,
        reconciled: null,
      }
    const history = createSessionRunHistory(turn.scope)(
      read.prefix,
      turn.preparation.run,
      turn.preparation.attempt,
    )
    const call = interpretCallHistory({ prefix: read.prefix, callId: turn.preparation.call })
    return {
      source: read.prefix.source,
      authorized: originalAttemptCurrent(history, turn),
      assembly,
      contextGeneration: context.currentGeneration() === generation ? generation : null,
      // An owned complete prefix with no original call is the fresh normal path.
      // Existing original calls need their actual reconciliation owner; do not invent recovery.
      reconciled: 'unavailable' in call ? null : 'absent' in call,
    }
  }
}
function originalAttemptCurrent(
  history: ReturnType<ReturnType<typeof createSessionRunHistory>>,
  turn: SessionModelTurnOptions,
): boolean | null {
  if (!('known' in history)) return null
  return (
    history.known.terminal === 'open' &&
    compareInteger(history.known.latestAttempt, turn.preparation.attempt) === 0
  )
}
function observedAssembly(turn: SessionModelTurnOptions): string {
  const report = turn.call.report
  if (
    report.session !== turn.scope.session ||
    report.runId !== turn.preparation.run ||
    compareInteger(report.attempt, turn.preparation.attempt) !== 0
  )
    throw new TypeError('actual original Run assembly report required')
  return writeJsonLossless({
    session: report.session,
    run: report.runId,
    attempt: report.attempt,
    computedAt: instantToRfc3339(report.computedAt),
    snapshots: report.snapshots.map(snapshot => ({
      category: snapshot.category,
      filledAt: instantToRfc3339(snapshot.filledAt),
    })),
  })
}

/** This is an actual private job, not a serializable statement that execution was transferred. */
export interface OriginalSessionModelWork {
  readonly originalPosition: string
  readonly turn: SessionModelTurnOptions
  readonly completion: Promise<SessionModelTurnResult>
}
export interface SessionModelAttemptOptions {
  readonly turn: SessionModelTurnOptions
  readonly registration: SettlementRegistration
  /** The real root observes current authorization, assembly, Context and original-call reconciliation. */
  readonly current: (facts: LoopFacts) => Promise<CurrentInputs>
  /** Success means the host retains this exact job and its bindings until their real release. */
  readonly transfer: (work: OriginalSessionModelWork) => Promise<'retained' | 'pending'>
}
export interface SessionModelAttempt {
  readonly drive: (signal?: AbortSignal) => Promise<DriveResult>
  /** Stops this attempt's waits. It never cancels the original model execution. */
  readonly close: () => ReturnType<typeof releaseAttempt>
}

/** Bind the project Agent Loop to one actually prepared model segment. No new execution pool. */
export function createSessionModelAttempt(
  options: SessionModelAttemptOptions,
): SessionModelAttempt {
  const attempt = new ModelAttempt(options)
  const frame = createAttemptOwner(options.turn.preparation.permit, {
    authorize: (permit, origin) => attempt.authorize(permit, origin),
    invokeModel: (_decision, _permit, signal) => attempt.invoke(signal),
    handBack: calls => attempt.handBack(calls),
  })
  let closed = false
  return Object.freeze<SessionModelAttempt>({
    drive: async signal => {
      if (closed) return attempt.blocked('released')
      const observed = await attempt.facts()
      if (!observed) return attempt.blocked('unavailable')
      const decision = nextStep({
        facts: observed.facts,
        currentInputs: await options.current(observed.facts),
      })
      if ('invalidInput' in decision) throw new TypeError('invalid root Loop observations')
      if (!('kind' in decision)) return attempt.blocked('unavailable')
      if (decision.kind === 'blocked')
        return attempt.blocked(decision.reason === 'denied' ? 'denied' : 'unavailable')
      if (decision.kind === 'idle') return { kind: 'retryFromFacts' }
      return driveStep({
        decision,
        permit: options.turn.preparation.permit,
        ports: frame.ports,
        ...(signal ? { signal } : {}),
      })
    },
    close: () => {
      closed = true
      return releaseAttempt(frame.owner)
    },
  })
}

class ModelAttempt {
  work?: OriginalSessionModelWork
  transferred = false
  transferring?: Promise<'retained' | 'pending'>
  transferFailed = false
  constructor(readonly options: SessionModelAttemptOptions) {
    if (typeof options.current !== 'function' || typeof options.transfer !== 'function')
      throw new TypeError('actual current sources and host transfer required')
  }
  blocked(reason: 'released' | 'unavailable' | 'denied'): DriveResult {
    return { kind: 'blocked', obligation: this.options.turn.preparation.originalPosition, reason }
  }
  async facts() {
    const { turn, registration } = this.options
    const read = await readSettlementPrefix({ binding: turn.linked.binding.log, registration })
    if (!('prefix' in read)) return undefined
    const preparation = turn.preparation
    if (!prepared(read.prefix, turn)) return undefined
    const state = createSessionRunHistory(turn.scope)(
      read.prefix,
      preparation.run,
      preparation.attempt,
    )
    if (
      !('known' in state) ||
      state.known.terminal !== 'open' ||
      compareInteger(state.known.latestAttempt, preparation.attempt) !== 0
    )
      return undefined
    const facts: LoopFacts = {
      source: read.prefix.source,
      run: {
        id: preparation.run,
        attempt: preparation.attempt,
        terminal: null,
        continuation: {
          kind: 'invokeModel',
          originalPosition: preparation.originalPosition,
          preparation: { call: preparation.call, stepKey: preparation.stepKey },
        },
      },
    }
    return { facts, prefix: read.prefix }
  }
  async authorize(
    permit: SessionModelTurnOptions['preparation']['permit'],
    origin: DecisionOrigin,
  ) {
    const expected = this.options.turn.preparation
    if (!ownsOrigin(permit, origin, expected)) return 'denied' as const
    const observed = await this.facts()
    if (!observed || !sourceTokenEquals(observed.facts.source, origin.expectedSourceToken))
      return 'unavailable' as const
    const decision = nextStep({
      facts: observed.facts,
      currentInputs: await this.options.current(observed.facts),
    })
    if ('invalidInput' in decision) throw new TypeError('invalid current root Loop observations')
    if ('kind' in decision && decision.kind === 'invokeModel') return 'authorized' as const
    return 'kind' in decision && decision.kind === 'blocked' && decision.reason === 'denied'
      ? ('denied' as const)
      : ('unavailable' as const)
  }
  async invoke(signal: AbortSignal): Promise<DriveResult> {
    const { turn } = this.options
    if (!this.work)
      this.work = Object.freeze({
        originalPosition: turn.preparation.originalPosition,
        turn,
        completion: runSessionModelTurn(turn),
      })
    const work = this.work
    // The exact promise stays owned here even if cancellation ends the local wait.
    try {
      const result = await waitOriginal(work.completion, signal)
      if (result.kind === 'detached') return this.detach()
      if ('retained' in result.value)
        return {
          kind: 'waiting',
          originalPosition: work.originalPosition,
          originalCalls: [work.originalPosition],
        }
      const current = await this.facts()
      if (!current) return { kind: 'retryFromFacts' }
      return { kind: 'committed', source: current.facts.source }
    } catch (error) {
      if (this.transferFailed) throw error
      try {
        await this.transfer()
      } catch (handoff) {
        throw new AggregateError([error, handoff], 'model work and host transfer failed')
      }
      throw error
    }
  }
  async detach(): Promise<DriveResult> {
    if ((await this.transfer()) === 'retained')
      return { kind: 'handedBack', originalCalls: [this.options.turn.preparation.originalPosition] }
    return {
      kind: 'waiting',
      originalPosition: this.options.turn.preparation.originalPosition,
      originalCalls: [this.options.turn.preparation.originalPosition],
    }
  }
  async transfer(): Promise<'retained' | 'pending'> {
    if (!this.work || this.transferred) return 'retained'
    if (!this.transferring) this.transferring = this.options.transfer(this.work)
    try {
      const result = await this.transferring
      if (result !== 'retained' && result !== 'pending')
        throw new TypeError('invalid model job transfer')
      if (result === 'retained') this.transferred = true
      return result
    } catch (error) {
      this.transferFailed = true
      throw error
    } finally {
      if (!this.transferFailed) delete this.transferring
    }
  }
  async handBack(calls: readonly string[]) {
    if (calls.length === 0) return { kind: 'handedBack' as const }
    if (calls.some(call => call !== this.options.turn.preparation.originalPosition))
      throw new TypeError('foreign original model obligation')
    return (await this.transfer()) === 'retained'
      ? { kind: 'handedBack' as const }
      : { kind: 'pending' as const }
  }
}
function ownsOrigin(
  permit: SessionModelTurnOptions['preparation']['permit'],
  origin: DecisionOrigin,
  expected: SessionModelTurnOptions['preparation'],
) {
  return (
    permit === expected.permit &&
    origin.run === expected.run &&
    compareInteger(origin.attempt, expected.attempt) === 0
  )
}
function prepared(prefix: SettlementPrefix, turn: SessionModelTurnOptions) {
  const expected = turn.preparation
  return prefix.entries.some(entry => {
    const read = readSessionFact(entry)
    if (!('fact' in read) || read.fact.kind !== 'call_prepared') return false
    const fact = read.fact
    return (
      fact.run === expected.run &&
      compareInteger(fact.attempt, expected.attempt) === 0 &&
      fact.call === expected.call &&
      fact.originalPosition === expected.originalPosition &&
      fact.stepKey === expected.stepKey
    )
  })
}
async function waitOriginal<T>(
  completion: Promise<T>,
  signal: AbortSignal,
): Promise<{ kind: 'value'; value: T } | { kind: 'detached' }> {
  if (signal.aborted) return { kind: 'detached' }
  let stop!: () => void
  const detached = new Promise<{ kind: 'detached' }>(resolve => {
    stop = () => resolve({ kind: 'detached' })
  })
  signal.addEventListener('abort', stop, { once: true })
  try {
    return await Promise.race([
      completion.then(value => ({ kind: 'value' as const, value })),
      detached,
    ])
  } finally {
    signal.removeEventListener('abort', stop)
  }
}
