// Controllable injections for tests: a clock that moves only when the test moves it, a login terms
// source that the test can change, and a fault switch that stops a record store from answering.
// None reads the wall clock or carries a built-in value.
import type { Duration, Instant } from '@omne-harness/utc-instant'
import type { IdentityClock, LoginTerms, LoginTermsSource } from '../operations.ts'
import { addDuration } from './time.ts'

export type ManualIdentityClock = Readonly<{
  /** The port to inject into a provider. */
  clock: IdentityClock
  /** The instant the clock reads now, even while it answers unavailable. */
  current(): Instant
  /** Moves the clock by a signed duration. Throws RangeError when the sum leaves years 0000 to 9999. */
  advanceBy(duration: Duration): void
  /** Sets the clock to any instant, earlier ones included. */
  setTo(instant: Instant): void
  /** Makes `now()` answer unavailable until `restore()`. */
  makeUnavailable(diagnostic: string): void
  restore(): void
}>

/** Creates a clock that reads `start` until the test moves it. */
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

/** The two record stores of an identity provider: accounts, and issued logins. */
export type RecordStore = 'accounts' | 'logins'

/**
 * A fault switch that a provider consults before it queries a record store. A diagnostic means the
 * store does not answer this query; `undefined` means it answers.
 */
export interface RecordStoreFaults {
  unavailable(store: RecordStore): string | undefined
}

export type RecordStoreFaultControl = Readonly<{
  /** The switch to inject into a provider. */
  faults: RecordStoreFaults
  /** Makes the store stop answering until `restore()`. */
  makeUnavailable(store: RecordStore, diagnostic: string): void
  /** Makes every store answer again. */
  restore(): void
}>

/** Creates a fault switch with every store answering. */
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
  /** The port to inject into a provider. */
  source: LoginTermsSource
  /** Changes the terms that later reads answer. The value is not checked here: a provider checks it. */
  set(terms: LoginTerms): void
  /** Makes `read()` answer unavailable until `restore()`. */
  makeUnavailable(diagnostic: string): void
  restore(): void
}>

/** Creates a terms source that answers `initial` until the test changes it. */
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
