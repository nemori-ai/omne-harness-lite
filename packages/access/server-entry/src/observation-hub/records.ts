// The observation records of one instance (RFC-0015 §5「观察中枢」): the slot before the stream
// (claim, then attach), the per-login and per-instance bounds, replacement under one key, one login
// check per round, the end of a login's observations, and the end of all of them at stop. It knows
// no protocol: the caller gives the key, the text of the `ended` frame and the login to count, and
// the session observation of the existing location keeps its cancel and its retained records here.
// Moved from `src/observation.ts` (#1249 spec 已定 2); only those three inputs became parameters.
import type { SseStream } from './sse.ts'

/** The end reasons of the hub itself, the same for every observation (RFC-0015 §3). */
export type HubEndReason =
  | 'observer-cancelled'
  | 'observer-replaced'
  | 'denied'
  | 'unavailable'
  | 'capacity'

/** The answer of one login check: still valid, no longer valid, or not judgeable now. */
export type LoginCheck = 'valid' | 'denied' | 'unavailable'

export type CancelState = 'ended' | 'not-found'

/** The hub's reasons and the caller's own, `O` (the session observation adds `refresh-exhausted`). */
export type EndReason<O extends string = never> = HubEndReason | O

/** What the records report about an end; the caller maps it onto its own diagnostics. */
export type RecordsEvent<O extends string = never> = Readonly<{ kind: 'ended' | 'cleanup-failed'; reason: EndReason<O> }>

export type RecordsInput<O extends string = never> = Readonly<{
  limits: Readonly<{ perLogin: number; perInstance: number; cancelRetentionMs: number }>
  /** The length of one round: the wait between two login checks of one observation. */
  loginCheckIntervalMs: number
  report?: (event: RecordsEvent<O>) => void
}>

/** How an observation left the active set: a frame reason, or the connection close. */
export type Ended<O extends string = never> = EndReason<O> | 'connection-closed'

export type ClaimInput<O extends string = never> = Readonly<{
  key: string
  /** The login the per-login bound counts. Absent: the observation needs no login and counts only per instance. */
  loginKey?: string
  /** Checks the observation's login again; it runs once per round while the stream is open. */
  checkLogin?: () => Promise<LoginCheck>
  /** The text of the `ended` event for a reason. */
  endFrame: (reason: EndReason<O>) => string
  /** Called once, when the observation leaves the active set. */
  onEnded?: (ended: Ended<O>) => void
}>

type Active<O extends string = never> = ClaimInput<O> & {
  /** The timer of the next login check, while one is armed. */
  checkTimer: NodeJS.Timeout | undefined
  /** The stream, once the HTTP layer has opened it. A claim holds the slot before that. */
  stream: SseStream | undefined
  /** Set once the observation left the active set. */
  ended: Ended<O> | undefined
}

/** A slot held for one observation between the capacity decision and the opened stream. */
export interface ObservationClaim<O extends string = never> {
  /** Hands the opened stream to the claim. An end that arrived meanwhile is written now. */
  attach(stream: SseStream): void
  /** Ends this observation with `reason`; a second end changes nothing. */
  end(reason: EndReason<O>): void
  /** Gives the slot back without a frame: the observation was never established. */
  discard(): void
}

export interface ObservationRecords<O extends string = never> {
  /**
   * Takes the slot for a new observation, or answers `undefined` when its login or this instance
   * is at capacity. The one `key` would replace does not count and is ended on success. The
   * decision and the count change happen in the same synchronous step, so two requests cannot
   * both be admitted over the bound.
   */
  claim(input: ClaimInput<O>): ObservationClaim<O> | undefined
  /** Ends an active observation, or answers from the retained record. */
  cancel(key: string, reason: EndReason<O>): CancelState
  /** Ends every active observation of one login with `reason`. */
  endLogin(loginKey: string, reason: EndReason<O>): void
  /**
   * Ends every active observation with `reason` and resolves when the streams attached so far
   * finished. A claim whose stream has not attached yet gets its frame at attach.
   */
  endAll(reason: EndReason<O>): Promise<void>
}

export function createObservationRecords<O extends string = never>(
  input: RecordsInput<O>,
): ObservationRecords<O> {
  const { limits, loginCheckIntervalMs, report } = input
  const active = new Map<string, Active<O>>()
  const perLogin = new Map<string, number>()
  const retained = new Map<string, NodeJS.Timeout>()

  const count = (loginKey: string | undefined, delta: number): void => {
    if (loginKey === undefined) return
    const next = (perLogin.get(loginKey) ?? 0) + delta
    if (next <= 0) perLogin.delete(loginKey)
    else perLogin.set(loginKey, next)
  }

  const retain = (key: string): void => {
    const existing = retained.get(key)
    if (existing !== undefined) clearTimeout(existing)
    if (limits.cancelRetentionMs === 0) return
    const timer = setTimeout(() => retained.delete(key), limits.cancelRetentionMs)
    timer.unref()
    retained.set(key, timer)
  }

  const hasCapacity = (loginKey: string | undefined, key: string): boolean => {
    const replacing = active.get(key) !== undefined
    const total = active.size - (replacing ? 1 : 0)
    if (total >= limits.perInstance) return false
    if (loginKey === undefined) return true
    const mine = (perLogin.get(loginKey) ?? 0) - (replacing ? 1 : 0)
    return mine < limits.perLogin
  }

  /** Removes the observation from the active set and frees its slot. */
  const forget = (observation: Active<O>, ended: Ended<O>): void => {
    observation.ended = ended
    if (observation.checkTimer !== undefined) {
      clearTimeout(observation.checkTimer)
      observation.checkTimer = undefined
    }
    if (active.get(observation.key) === observation) active.delete(observation.key)
    count(observation.loginKey, -1)
    retain(observation.key)
    observation.onEnded?.(ended)
  }

  /** Writes the `ended` frame and ends the stream. Everything queued before it goes first. */
  const writeEnd = (observation: Active<O>, stream: SseStream, reason: EndReason<O>): void => {
    try {
      if (!stream.closed) {
        stream.event(observation.endFrame(reason))
        stream.end()
      }
      report?.({ kind: 'ended', reason })
    } catch {
      report?.({ kind: 'cleanup-failed', reason })
    }
  }

  const end = (observation: Active<O>, reason: EndReason<O>): void => {
    if (observation.ended !== undefined) return
    forget(observation, reason)
    // Without a stream yet, the frame is written when the stream attaches.
    if (observation.stream !== undefined) writeEnd(observation, observation.stream, reason)
  }

  /**
   * One round: the login check, then the next round. Checks of one observation are serial, and a
   * result that arrives after the observation ended changes nothing.
   */
  const armLoginCheck = (observation: Active<O>): void => {
    if (observation.checkLogin === undefined) return
    const timer = setTimeout(() => {
      observation.checkTimer = undefined
      void checkLogin(observation)
    }, loginCheckIntervalMs)
    timer.unref()
    observation.checkTimer = timer
  }

  const checkLogin = async (observation: Active<O>): Promise<void> => {
    if (observation.ended !== undefined || observation.checkLogin === undefined) return
    let result: LoginCheck
    try {
      result = await observation.checkLogin()
    } catch {
      result = 'unavailable'
    }
    if (observation.ended !== undefined) return
    if (result === 'valid') armLoginCheck(observation)
    else end(observation, result)
  }

  const attach = (observation: Active<O>, stream: SseStream): void => {
    if (observation.stream !== undefined)
      throw new TypeError('server-entry: observation attached twice')
    observation.stream = stream
    const { ended } = observation
    if (ended === 'connection-closed') return
    if (ended !== undefined) {
      writeEnd(observation, stream, ended)
      return
    }
    stream.onClose(() => {
      // The connection closed before an end: that is the cancel; no frame can be written.
      if (observation.ended === undefined) forget(observation, 'connection-closed')
    })
    if (observation.ended === undefined) armLoginCheck(observation)
  }

  return {
    claim(input) {
      if (!hasCapacity(input.loginKey, input.key)) return undefined
      const previous = active.get(input.key)
      if (previous !== undefined) end(previous, 'observer-replaced')
      const observation: Active<O> = {
        ...input,
        checkTimer: undefined,
        stream: undefined,
        ended: undefined,
      }
      active.set(input.key, observation)
      count(input.loginKey, 1)
      return {
        attach: stream => attach(observation, stream),
        end: reason => end(observation, reason),
        discard: () => {
          if (observation.ended === undefined) forget(observation, 'connection-closed')
        },
      }
    },
    cancel(key, reason) {
      const observation = active.get(key)
      if (observation !== undefined) {
        end(observation, reason)
        return 'ended'
      }
      return retained.has(key) ? 'ended' : 'not-found'
    },
    endLogin(loginKey, reason) {
      // `end` removes from `active`, so the list is taken first.
      for (const observation of Array.from(active.values()))
        if (observation.loginKey === loginKey) end(observation, reason)
    },
    async endAll(reason) {
      // `end` removes from `active`, so the list is taken first.
      const current = Array.from(active.values())
      const attached = current.flatMap(observation =>
        observation.stream === undefined ? [] : [observation.stream.finished],
      )
      for (const observation of current) end(observation, reason)
      await Promise.all(attached)
    },
  }
}
