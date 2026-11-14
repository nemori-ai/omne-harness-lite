import type { SseStream } from './sse.ts'

export type HubEndReason =
  | 'observer-cancelled'
  | 'observer-replaced'
  | 'denied'
  | 'unavailable'
  | 'capacity'

export type LoginCheck = 'valid' | 'denied' | 'unavailable'

export type CancelState = 'ended' | 'not-found'

export type EndReason<O extends string = never> = HubEndReason | O

export type RecordsEvent<O extends string = never> = Readonly<{
  kind: 'ended' | 'cleanup-failed'
  reason: EndReason<O>
}>

export type RecordsInput<O extends string = never> = Readonly<{
  limits: Readonly<{ perLogin: number; perInstance: number; cancelRetentionMs: number }>
  loginCheckIntervalMs: number
  report?: (event: RecordsEvent<O>) => void
}>

export type Ended<O extends string = never> = EndReason<O> | 'connection-closed'

export type ClaimInput<O extends string = never> = Readonly<{
  key: string
  loginKey?: string
  checkLogin?: () => Promise<LoginCheck>
  endFrame: (reason: EndReason<O>) => string
  onEnded?: (ended: Ended<O>) => void
}>

type Active<O extends string = never> = ClaimInput<O> & {
  checkTimer: NodeJS.Timeout | undefined
  stream: SseStream | undefined
  ended: Ended<O> | undefined
}

export interface ObservationClaim<O extends string = never> {
  attach(stream: SseStream): void
  end(reason: EndReason<O>): void
  discard(): void
}

export interface ObservationRecords<O extends string = never> {
  claim(input: ClaimInput<O>): ObservationClaim<O> | undefined
  cancel(key: string, reason: EndReason<O>): CancelState
  endLogin(loginKey: string, reason: EndReason<O>): void
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
    if (observation.stream !== undefined) writeEnd(observation, observation.stream, reason)
  }

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
      for (const observation of Array.from(active.values()))
        if (observation.loginKey === loginKey) end(observation, reason)
    },
    async endAll(reason) {
      const current = Array.from(active.values())
      const attached = current.flatMap(observation =>
        observation.stream === undefined ? [] : [observation.stream.finished],
      )
      for (const observation of current) end(observation, reason)
      await Promise.all(attached)
    },
  }
}
