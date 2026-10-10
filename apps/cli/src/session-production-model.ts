import { randomUUID } from 'node:crypto'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { jsonNumberSource } from '@omne-harness-lite/content-blocks'
import { setTimeout as wait } from 'node:timers/promises'
import { isOk, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { instantToRfc3339, type Clock } from '@omne-harness-lite/offer-expiry'
import {
  interpretCallHistory,
  openRouterCredentialRedactionConfig,
  type SettlementContention,
  type SettlementScheduler,
} from '@omne-harness-lite/model-request-runtime'
import { createSessionRunHistory } from '@omne-harness-lite/session-runtime-local'
import { readSessionModelCalibration } from './session-model-calibration.ts'
import { sessionImageCodec } from './session-image-codec.ts'
import { modelImageBalancedV1 } from '@omne-harness-lite/pi-ai-transport'
import type { SessionNativeModelPoolOptions } from './session-native-model.ts'

export const sessionModelContention: SettlementContention = {
  name: 'cli-session',
  limits: { submissions: 4, elapsedMs: 10_000, retainedBytes: 1_048_576, concurrent: 8 },
  decide(input) {
    return ExactDecimal.from(input.submissions).compare(ExactDecimal.from(4)) >= 0 ||
      ExactDecimal.from(input.elapsedMs).compare(ExactDecimal.from(10_000)) >= 0
      ? { stop: true }
      : { proceed: { waitMs: 0 } }
  },
}
export const sessionModelScheduler: SettlementScheduler = {
  nowMonotonicMs: () => Number(process.hrtime.bigint() / 1_000_000n),
  wait(milliseconds, signal) {
    const stop = new AbortController()
    const delay = Number(jsonNumberSource(milliseconds))
    if (!Number.isSafeInteger(delay) || delay < 0) throw new TypeError('invalid settlement wait')
    const completion = wait(delay, undefined, {
      signal: AbortSignal.any([signal, stop.signal]),
    }).then(
      () => 'elapsed' as const,
      error => {
        if (!stop.signal.aborted && !signal.aborted) throw error
        return 'cancelled' as const
      },
    )
    return {
      completion,
      stopped: completion.then(
        () => undefined,
        () => undefined,
      ),
      requestStop: () => stop.abort(),
    }
  },
}
export function sessionClock(clock: Clock) {
  return async () => {
    const value = await clock.now()
    if (value === 'unavailable') throw new Error('Session clock unavailable')
    return instantToRfc3339(value)
  }
}
export const sessionModelHistory: ReturnType<SessionNativeModelPoolOptions['sources']>['history'] =
  {
    call: (prefix, callId) => interpretCallHistory({ prefix, callId }),
    failure: () => ({ unavailable: true as const }),
    calibration: readSessionModelCalibration,
    run: (prefix, run, attempt) => createSessionRunHistory(prefix.source)(prefix, run, attempt),
  }
export const sessionModelRecovery = {
  authorize: async () => ({ unavailable: true as const }),
  enter: async () => ({ unavailable: true as const }),
}

/** The application selects transport policy; the original Session driver supplies per-Run authority. */
export function productionSessionModel(
  directory: NonNullable<SessionNativeModelPoolOptions['directory']>,
  modelIds: readonly string[],
  diagnostic: (error: unknown) => void,
): SessionNativeModelPoolOptions {
  return {
    directory,
    modelIds,
    network: {
      imagePreparation: { policy: modelImageBalancedV1, codec: sessionImageCodec },
      policy: {
        maxConnections: 8,
        idleConnectionTimeoutMs: 60_000,
        connectTimeoutMs: 15_000,
        maxErrorBodyBytes: 8192,
        maxSseEventBytes: 1_048_576,
        credentialRedaction: openRouterCredentialRedactionConfig,
      },
    },
    retirement: {
      waitMilliseconds: 30_000,
      force: false,
      schedule(milliseconds, callback) {
        const timer = setTimeout(callback, milliseconds)
        return () => clearTimeout(timer)
      },
    },
    contentPolicy: { maxConcurrentWrites: 4, maxContentBytes: 1_048_576 },
    maxFactScopes: 16,
    sources(_calls, clock) {
      return {
        callAccess: { check: async () => ({ unavailable: true }) },
        sessions: { bind: async () => ({ failure: 'unavailable' }) },
        maxScopes: 16,
        settlementContention: sessionModelContention,
        settlementScheduler: sessionModelScheduler,
        policy: {
          now: sessionClock(clock),
          schedule(milliseconds, callback) {
            const timer = setTimeout(callback, milliseconds)
            return () => clearTimeout(timer)
          },
          firstContentTimeoutMs: 120_000,
          idleContentTimeoutMs: 30_000,
          statusCauseTable: {
            401: 'credential_unavailable',
            403: 'request_rejected',
            429: 'upstream_unavailable',
            500: 'upstream_unavailable',
            502: 'upstream_unavailable',
            503: 'upstream_unavailable',
          },
          credentialRedaction: openRouterCredentialRedactionConfig,
          diagnostic,
        },
        tokenMargin: { multiplier: 1.1, reserveTokens: 64 },
        identities: {
          call: randomUUID,
          response: randomUUID,
          message() {
            const value = parseOpaqueIdentifier(randomUUID(), 'MessageId')
            if (!isOk(value)) throw new Error('Generated MessageId rejected')
            return value.ok
          },
        },
        history: {
          ...sessionModelHistory,
          call: (prefix, callId) => interpretCallHistory({ prefix, callId }),
        },
        recovery: sessionModelRecovery,
        reservationWaitPolicy: { maxWaitersPerCall: 4, timeoutMs: 10_000 },
        acknowledgementCleanup: { next: () => ({ stop: true }) },
        diagnostic,
      }
    },
  }
}
