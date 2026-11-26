import type { ModelInvocationRef } from '@omne-harness/model-contract'
import type { SessionAccess } from '@omne-harness/session-contract'
import type { StreamRef } from '@omne-harness/stream-arrival'
import {
  callViewOf,
  FrameTranslator,
  type CallView,
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
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable' }>

export interface SessionObservation<P> {
  open(
    input: Readonly<{ access: SessionAccess<P>; signal: AbortSignal }>,
  ): Promise<SessionObservationOpen>
}

type Cause = 'open' | 'interval' | 'notice'

type Stream =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'observing'; subscription: StreamSubscription }>
  | Readonly<{ kind: 'reobserve'; target: Target }>

type Selection =
  | Readonly<{ kind: 'stream'; ref: StreamRef; call: CallView }>
  | Readonly<{ kind: 'none'; call: CallView }>
  | Readonly<{ kind: 'end'; reason: SessionObservationEnd }>

type Step = Readonly<{ frames: SessionObservationFrame[]; end?: SessionObservationEnd }>

type Entry = StreamEvent | 'notice'

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

// What the session stands at: a client shows these, and they reach no history read.
const STANDING_KINDS = [
  'session.model-selected',
  'session.mode-changed',
  'session.workspace-changed',
  'session.archived',
  'session.unarchived',
] as const

export function createSessionObservation<P>(
  ports: SessionObservationPorts<P>,
): SessionObservation<P> {
  const wakers = new Set([...LOCATE_KINDS, ...STANDING_KINDS, ...ports.historyKinds])
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
      let call: CallView = { phase: null, attempts: null }
      let closedRef: StreamRef | null = null

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

      async function timed<T>(milliseconds: number, other: Promise<T>): Promise<T | 'elapsed'> {
        const { timer, elapsed } = startWait(milliseconds)
        const answer = await Promise.race([elapsed, other])
        endWait(timer)
        return answer
      }

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
          ...call,
          target: stream.kind === 'none' ? null : { projection: 'model-output-v1' },
        })
        return frame === null ? [] : [frame]
      }

      // The one place a subscription begins; after teardown none does, since a read under way may still come back.
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

      async function select(reference: ModelInvocationRef): Promise<Selection> {
        const answer = await timed(
          ports.policy.currentTimeout,
          ports.streams.current({ access: viewer, reference }),
        )
        if (answer === 'elapsed') {
          ports.diagnose({ code: 'observation.current-timeout', detail: reference })
          return { kind: 'none', call }
        }
        if ('failure' in answer) {
          const failure = answer.failure
          if (failure.kind === 'denied') return { kind: 'end', reason: 'denied' }
          if (failure.kind === 'invalid' && failure.reason !== 'not-accepted')
            return { kind: 'end', reason: 'unavailable' }
          return { kind: 'none', call }
        }
        const current = answer.ok.current
        if (current === null || current.ref === closedRef)
          return { kind: 'none', call: callViewOf(answer.ok.state) }
        return { kind: 'stream', ref: current.ref, call: callViewOf(answer.ok.state) }
      }

      async function located(result: LocateResult, cause: Cause): Promise<Step> {
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
        call = selection.call
        if (selection.kind === 'stream') {
          dropTarget()
          subscribe({ reference: next.mainCall, ref: selection.ref })
          budget.reset()
          return { frames: state() }
        }
        if (!callChanged) return quiet(cause)
        dropTarget()
        budget.tick()
        return { frames: [...state(), { kind: 'refreshing' }] }
      }

      function quiet(cause: Cause): Step {
        const frames = state()
        if (cause === 'interval') {
          budget.tick()
          frames.push({ kind: 'refreshing' })
        }
        return { frames }
      }

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
            : translator.delta(frame.value, call.phase ?? frame.value.state.phase)
        if (value === null) return { frames: [], end: 'unavailable' }
        call = callViewOf(frame.kind === 'snapshot' ? frame.value.value.state : frame.value.state)
        budget.reset()
        return { frames: [...state(), value] }
      }

      function ended(reason: Extract<StreamEvent['frame'], { kind: 'ended' }>['reason']): Step {
        switch (reason) {
          case 'denied':
            return { frames: [], end: 'denied' }
          case 'capacity':
          case 'unavailable':
            return interrupted([])
          default:
            return lost([])
        }
      }

      function lost(gap: SessionObservationFrame[]): Step {
        if (stream.kind === 'observing') closedRef = stream.subscription.target.ref
        dropTarget()
        budget.tick()
        return { frames: [...gap, ...state(), { kind: 'refreshing' }] }
      }

      function interrupted(gap: SessionObservationFrame[]): Step {
        if (stream.kind === 'observing') {
          const target = stream.subscription.target
          stream.subscription.drop()
          stream = { kind: 'reobserve', target }
        }
        budget.tick()
        return { frames: [...gap, { kind: 'refreshing' }] }
      }

      async function advance(): Promise<Step | null> {
        const entry = inbox.shift()
        if (entry === 'notice') {
          if (!locator.take()) return null
          const step = await located(await locator.locate(), 'notice')
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
