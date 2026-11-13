// 一次观察 (RFC-0015 §8, §13): the only exit of frames. It runs the two axes of §13: the locate
// axis (the Locator reads the log; the observation asks the Model for the current stream when there
// is no target or the main call changed) and the stream axis (a StreamSubscription per target). It
// asks the refresh budget when to look again, and on abort tears down its own reads, notices,
// subscription and waits. It never cancels a Model call and writes nothing.
import type { CallState } from '@omne-harness/model-contract'
import type { SessionAccess } from '@omne-harness/session-contract'
import type { StreamRef } from '@omne-harness/stream-arrival'
import {
  FrameTranslator,
  type SessionObservationEnd,
  type SessionObservationFrame,
} from './frames.ts'
import { Locator, LOCATE_KINDS, type Located, type LocateResult } from './locate.ts'
import type { SessionObservationPorts } from './ports.ts'
import { RefreshBudget } from './refresh-budget.ts'
import { StreamSubscription, type StreamEvent, type Target } from './stream-subscription.ts'

export type SessionObservationOpen =
  | Readonly<{
      kind: 'opened'
      frames: AsyncGenerator<SessionObservationFrame, SessionObservationEnd | undefined>
    }>
  /** The log read was refused, the session does not exist, or its identity is not valid: one answer. */
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable' }>

export interface SessionObservation<P> {
  open(
    input: Readonly<{ access: SessionAccess<P>; signal: AbortSignal }>,
  ): Promise<SessionObservationOpen>
}

/** What started a locate: the first one, an interval that ran out, or a notice. */
type Cause = 'open' | 'interval' | 'notice'

/** The stream axis: no target, observing one, or waiting to observe the same one again. */
type Stream =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'observing'; subscription: StreamSubscription }>
  | Readonly<{ kind: 'reobserve'; target: Target }>

/** What the Model answered for the main call: a stream to observe, nothing to observe, or an end. */
type Selection =
  | Readonly<{ kind: 'stream'; ref: StreamRef; phase: CallState['phase'] }>
  | Readonly<{ kind: 'none'; phase: CallState['phase'] | null }>
  | Readonly<{ kind: 'end'; reason: SessionObservationEnd }>

/** Frames to send, then, when the observation ends, the reason. */
type Step = Readonly<{ frames: SessionObservationFrame[]; end?: SessionObservationEnd }>

/** What the loop takes in arrival order: a stream event, or a commit notice. */
type Entry = StreamEvent | 'notice'

/** Wakes the loop and keeps stream events and notices in the order they came. */
class Inbox {
  readonly #events: Entry[] = []
  #wake: (() => void) | undefined

  push(event: Entry): void {
    this.#events.push(event)
    this.poke()
  }

  poke(): void {
    const wake = this.#wake
    this.#wake = undefined
    wake?.()
  }

  shift(): Entry | undefined {
    return this.#events.shift()
  }

  /** Resolves at the next push or poke. */
  idle(): Promise<'woken'> {
    return new Promise(resolve => {
      this.#wake = () => resolve('woken')
    })
  }
}

function targetOf(stream: Stream): Target | null {
  switch (stream.kind) {
    case 'none':
      return null
    case 'observing':
      return stream.subscription.target
    case 'reobserve':
      return stream.target
  }
}

/** Session observation over its ports. */
export function createSessionObservation<P>(
  ports: SessionObservationPorts<P>,
): SessionObservation<P> {
  const wakers = new Set([...LOCATE_KINDS, ...ports.historyKinds])
  return {
    async open({ access, signal }) {
      const locator = new Locator(access, ports)
      const inbox = new Inbox()
      const timers = new Set<AbortController>()
      let stream: Stream = { kind: 'none' }
      const unsubscribe = ports.notices(
        { tenant: access.tenant, session: access.session },
        kinds => {
          if (!kinds.some(kind => wakers.has(kind))) return
          locator.note()
          inbox.push('notice')
        },
      )
      let closed = false
      const teardown = (): void => {
        if (closed) return
        closed = true
        signal.removeEventListener('abort', teardown)
        unsubscribe()
        if (stream.kind === 'observing') stream.subscription.drop()
        for (const timer of timers) timer.abort()
        inbox.poke()
      }
      signal.addEventListener('abort', teardown)
      const first = await locator.open()
      if (first.kind !== 'located') {
        teardown()
        return first
      }
      const budget = new RefreshBudget(ports.policy, ports.diagnose)
      const translator = new FrameTranslator()
      const viewer = { principal: access.principal, tenant: access.tenant }
      let view: Located = first.view
      let phase: CallState['phase'] | null = null
      let closedRef: StreamRef | null = null

      /** A wait of `milliseconds` under a timer that teardown aborts; it settles only when it runs out. */
      function startWait(
        milliseconds: number,
      ): Readonly<{ timer: AbortController; elapsed: Promise<'elapsed'> }> {
        const timer = new AbortController()
        timers.add(timer)
        const elapsed = ports
          .wait(milliseconds, timer.signal)
          .then(answer =>
            answer === 'elapsed' ? ('elapsed' as const) : new Promise<never>(() => undefined),
          )
        return { timer, elapsed }
      }

      function endWait(timer: AbortController): void {
        timer.abort()
        timers.delete(timer)
      }

      /** `other`, unless a wait of `milliseconds` runs out first. */
      async function timed<T>(milliseconds: number, other: Promise<T>): Promise<T | 'elapsed'> {
        const { timer, elapsed } = startWait(milliseconds)
        const answer = await Promise.race([elapsed, other])
        endWait(timer)
        return answer
      }

      /**
       * The wait before the observation looks again while it has no subscription. It begins once
       * and goes on across wake-ups. While a target waits to be observed again, a notice is
       * handled and the same wait is still the one that runs out, so commits cannot push the next
       * subscription back. With no target, a notice is itself a look, and `advance` begins the
       * wait anew after it.
       */
      let due:
        | Readonly<{ timer: AbortController; delay: number; elapsed: Promise<'elapsed'> }>
        | undefined

      function dueWait(): NonNullable<typeof due> {
        if (due === undefined) {
          const delay = budget.delay()
          due = { ...startWait(delay), delay }
        }
        return due
      }

      function clearDue(): void {
        if (due === undefined) return
        endWait(due.timer)
        due = undefined
      }

      function state(): SessionObservationFrame[] {
        const frame = translator.state({
          run: view.run,
          revision: view.revision,
          phase,
          target: stream.kind === 'none' ? null : { projection: 'model-output-v1' },
        })
        return frame === null ? [] : [frame]
      }

      /** The one place a subscription begins. After the teardown none does: a read that was under way may still come back. */
      function subscribe(target: Target): void {
        if (closed) return
        clearDue()
        stream = {
          kind: 'observing',
          subscription: new StreamSubscription(
            target,
            ports.observer as SessionObservationPorts<unknown>['observer'],
            viewer,
            event => inbox.push(event),
          ),
        }
      }

      function dropTarget(): void {
        if (stream.kind === 'observing') stream.subscription.drop()
        stream = { kind: 'none' }
      }

      /** Asks the Model for the current stream of `reference`, waiting at most `currentTimeout`. */
      async function select(reference: string): Promise<Selection> {
        const answer = await timed(
          ports.policy.currentTimeout,
          ports.streams.current({ access: viewer, reference: reference as never }),
        )
        if (answer === 'elapsed') {
          ports.diagnose({ code: 'observation.current-timeout', detail: reference })
          return { kind: 'none', phase }
        }
        if ('failure' in answer) {
          const failure = answer.failure
          if (failure.kind === 'denied') return { kind: 'end', reason: 'denied' }
          if (failure.kind === 'invalid' && failure.reason !== 'not-accepted')
            return { kind: 'end', reason: 'unavailable' }
          return { kind: 'none', phase }
        }
        const current = answer.ok.current
        if (current === null || current.ref === closedRef)
          return { kind: 'none', phase: answer.ok.state.phase }
        return { kind: 'stream', ref: current.ref, phase: answer.ok.state.phase }
      }

      /** The result table of §13 for one locate. */
      async function located(result: LocateResult, cause: Cause): Promise<Step> {
        // The observer left while the log was read: the result is dropped and the Model is not asked.
        if (closed) return { frames: [] }
        if (result.kind !== 'located') return { frames: [], end: result.kind }
        const next = result.view
        const callChanged = next.mainCall !== view.mainCall
        view = next
        const target = targetOf(stream)
        if (result.transient === true && target !== null)
          ports.diagnose({ code: 'observation.locate-transient', detail: target.reference })
        if (next.mainCall === null || next.mainCall === target?.reference) return quiet(cause)
        const selection = await select(next.mainCall)
        if (selection.kind === 'end') return { frames: [], end: selection.reason }
        phase = selection.phase
        if (selection.kind === 'stream') {
          dropTarget()
          subscribe({ reference: next.mainCall, ref: selection.ref })
          budget.reset()
          return { frames: state() }
        }
        // A target always has the main call of the view before this locate, so with no new main
        // call there is no target here: nothing new.
        if (!callChanged) return quiet(cause)
        dropTarget()
        budget.tick()
        return { frames: [...state(), { kind: 'refreshing' }] }
      }

      /** Nothing new for the stream axis: state on a change; refreshing only for an interval. */
      function quiet(cause: Cause): Step {
        const frames = state()
        if (cause === 'interval') {
          budget.tick()
          frames.push({ kind: 'refreshing' })
        }
        return { frames }
      }

      /** The stream axis of §13 for one event. */
      function streamed(event: StreamEvent): Step {
        if (stream.kind !== 'observing' || event.subscription !== stream.subscription) {
          ports.diagnose({ code: 'observation.late-discarded', detail: event.frame.kind })
          return { frames: [] }
        }
        const { frame } = event
        switch (frame.kind) {
          case 'snapshot':
          case 'delta':
            return content(frame)
          case 'gap':
            return frame.reason === 'buffer'
              ? interrupted([{ kind: 'gap', reason: 'buffer' }])
              : lost([{ kind: 'gap', reason: frame.reason }])
          case 'ended':
            return ended(frame.reason)
          case 'lost':
            return lost([])
        }
      }

      function content(frame: Extract<StreamEvent['frame'], { kind: 'snapshot' | 'delta' }>): Step {
        const value =
          frame.kind === 'snapshot'
            ? translator.snapshot(frame.value)
            : translator.delta(frame.value, phase ?? frame.value.state.phase)
        if (value === null) return { frames: [], end: 'unavailable' }
        phase = frame.kind === 'snapshot' ? frame.value.value.state.phase : frame.value.state.phase
        budget.reset()
        return { frames: [...state(), value] }
      }

      /** An `ended` of the producer, by the public contract's table of sources and frames. */
      function ended(reason: Extract<StreamEvent['frame'], { kind: 'ended' }>['reason']): Step {
        switch (reason) {
          case 'denied':
            return { frames: [], end: 'denied' }
          case 'capacity':
          case 'unavailable':
            return interrupted([])
          default:
            // observer-closed included: after its own abort the subscription delivers nothing, so
            // from the current one it can only mean the producer closed it; that is the stream ending.
            return lost([])
        }
      }

      /** The target stream ended: back to no target, then wait. */
      function lost(gap: SessionObservationFrame[]): Step {
        if (stream.kind === 'observing') closedRef = stream.subscription.target.ref
        dropTarget()
        budget.tick()
        return { frames: [...gap, ...state(), { kind: 'refreshing' }] }
      }

      /** The subscription broke but the target stands: observe it again after the interval. */
      function interrupted(gap: SessionObservationFrame[]): Step {
        if (stream.kind === 'observing') {
          const target = stream.subscription.target
          stream.subscription.drop()
          stream = { kind: 'reobserve', target }
        }
        budget.tick()
        return { frames: [...gap, { kind: 'refreshing' }] }
      }

      /** The next step of the loop, or null to look again. */
      async function advance(): Promise<Step | null> {
        const entry = inbox.shift()
        if (entry === 'notice') {
          if (!locator.take()) return null
          const step = await located(await locator.locate(), 'notice')
          // With no target the notice took the place of the wait: having just looked, the wait
          // for the next look begins anew. The wait to observe a target again goes on.
          if (stream.kind === 'none') clearDue()
          return step
        }
        if (entry !== undefined) return streamed(entry)
        if (stream.kind === 'observing') {
          await inbox.idle()
          return null
        }
        if (budget.exhausted()) return { frames: [], end: 'refresh-exhausted' }
        const wait = dueWait()
        if ((await Promise.race([wait.elapsed, inbox.idle()])) !== 'elapsed') return null
        clearDue()
        budget.waited(wait.delay)
        if (stream.kind === 'reobserve') {
          subscribe(stream.target)
          return null
        }
        return located(await locator.locate(), 'interval')
      }

      async function* frames(): AsyncGenerator<
        SessionObservationFrame,
        SessionObservationEnd | undefined
      > {
        try {
          if (signal.aborted) return undefined
          let step: Step | null = await located(first, 'open')
          for (;;) {
            if (signal.aborted) return undefined
            if (step !== null) {
              for (const frame of step.frames) {
                yield frame
                if (signal.aborted) return undefined
              }
              if (step.end !== undefined) return step.end
            }
            step = await advance()
          }
        } finally {
          teardown()
        }
      }
      return { kind: 'opened', frames: frames() }
    },
  }
}
