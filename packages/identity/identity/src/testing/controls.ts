import type { Duration, Instant } from '@omne-harness/utc-instant'
import type { InvitationTerms, InvitationTermsSource } from '../governance.ts'
import type { IdentityClock, LoginTerms, LoginTermsSource } from '../operations.ts'
import { addDuration } from './time.ts'

export type ManualIdentityClock = Readonly<{
  clock: IdentityClock
  current(): Instant
  advanceBy(duration: Duration): void
  setTo(instant: Instant): void
  makeUnavailable(diagnostic: string): void
  restore(): void
}>

export function manualIdentityClock(start: Instant): ManualIdentityClock {
  let instant = start
  let failure: string | undefined
  const clock: IdentityClock = Object.freeze({
    now: () =>
      Promise.resolve(
        failure === undefined
          ? Object.freeze({ kind: 'read' as const, instant })
          : Object.freeze({ kind: 'unavailable' as const, diagnostic: failure }),
      ),
  })
  return Object.freeze({
    clock,
    current: () => instant,
    advanceBy(duration) {
      const next = addDuration(instant, duration)
      if (next === undefined) throw new RangeError('the clock would leave years 0000 to 9999')
      instant = next
    },
    setTo(next) {
      instant = next
    },
    makeUnavailable(diagnostic) {
      failure = diagnostic
    },
    restore() {
      failure = undefined
    },
  })
}

export type RecordStore = 'accounts' | 'logins' | 'organizations'

export interface RecordStoreFaults {
  unavailable(store: RecordStore): string | undefined
}

export type RecordStoreFaultControl = Readonly<{
  faults: RecordStoreFaults
  makeUnavailable(store: RecordStore, diagnostic: string): void
  restore(): void
}>

export function recordStoreFaults(): RecordStoreFaultControl {
  const down = new Map<RecordStore, string>()
  const faults: RecordStoreFaults = Object.freeze({
    unavailable: (store: RecordStore) => down.get(store),
  })
  return Object.freeze({
    faults,
    makeUnavailable(store, diagnostic) {
      down.set(store, diagnostic)
    },
    restore() {
      down.clear()
    },
  })
}

export type AdjustableLoginTerms = Readonly<{
  source: LoginTermsSource
  set(terms: LoginTerms): void
  makeUnavailable(diagnostic: string): void
  restore(): void
}>

export function adjustableLoginTerms(initial: LoginTerms): AdjustableLoginTerms {
  let terms = initial
  let failure: string | undefined
  const source: LoginTermsSource = Object.freeze({
    read: () =>
      Promise.resolve(
        failure === undefined
          ? Object.freeze({ kind: 'read' as const, terms })
          : Object.freeze({ kind: 'unavailable' as const, diagnostic: failure }),
      ),
  })
  return Object.freeze({
    source,
    set(next) {
      terms = next
    },
    makeUnavailable(diagnostic) {
      failure = diagnostic
    },
    restore() {
      failure = undefined
    },
  })
}

export type AdjustableInvitationTerms = Readonly<{
  source: InvitationTermsSource
  set(terms: InvitationTerms): void
  makeUnavailable(diagnostic: string): void
  restore(): void
}>

export function adjustableInvitationTerms(initial: InvitationTerms): AdjustableInvitationTerms {
  let terms = initial
  let failure: string | undefined
  const source: InvitationTermsSource = Object.freeze({
    read: () =>
      Promise.resolve(
        failure === undefined
          ? Object.freeze({ kind: 'read' as const, terms })
          : Object.freeze({ kind: 'unavailable' as const, diagnostic: failure }),
      ),
  })
  return Object.freeze({
    source,
    set(next) {
      terms = next
    },
    makeUnavailable(diagnostic) {
      failure = diagnostic
    },
    restore() {
      failure = undefined
    },
  })
}
