import type {
  ConsumerRef,
  LiveCommand,
  LiveFrame,
  MediaFrame,
  MediaWrite,
  ModelCallId,
  ModelModality,
  ModelOperationId,
  Termination,
} from '@omne-harness/model-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type { LiveFact, LiveSession, ModelClock } from '@omne-harness/model-contract/provider'
import {
  connecting,
  step,
  submit,
  type LiveBody,
  type LiveAccount,
  type LiveDeadline,
  type LiveDeliveryAnswer,
  type LiveEffect,
  type LiveInput,
  type LiveSubmit,
} from './body.ts'

/** Hands one run of numbered events to the consumer frozen at admission, and says what became of it. */
export interface LiveEventPort {
  deliver(
    input: Readonly<{
      tenant: TenantId
      call: ModelCallId
      consumer: ConsumerRef
      from: number
      to: number
      frames: readonly LiveFrame[]
    }>,
    signal: AbortSignal,
  ): Promise<LiveDeliveryAnswer>
  /** The body of the call has gone: the result of the call may be pushed now. */
  exited(target: Readonly<{ tenant: TenantId; call: ModelCallId }>): void
}
export type LiveDeadlines = Readonly<{
  openMs: number
  closeMs: number
  drainMs: number
  redeliverMs: number
}>
export type LiveRunnerInput = Readonly<{
  tenant: TenantId
  call: ModelCallId
  consumer: ConsumerRef
  session: LiveSession
  capacity: number
  takes: readonly ModelModality[]
  deadlines: LiveDeadlines
  clock: ModelClock
  port: LiveEventPort
  /** The receiver refused the events: record a cancel of the call, as a work guard would. */
  refuse(): Promise<void>
}>
export type LiveEnd = Readonly<{
  termination: Termination
  last: number
  account: LiveAccount | null
}>

const after = (now: string, ms: number) => new Date(Date.parse(now) + ms).toISOString()

/** Runs one live body: reads its session, carries out each effect, and keeps its deadlines. */
export class LiveRunner {
  private body: LiveBody
  private readonly stopping = new AbortController()
  private readonly timers = new Map<LiveDeadline, AbortController>()
  private readonly ended = Promise.withResolvers<LiveEnd>()
  private readonly done = Promise.withResolvers<void>()
  private readonly media = new Set<(frame: MediaFrame) => void>()
  private iterator: AsyncIterator<LiveFact> | undefined
  private readonly input: LiveRunnerInput

  constructor(input: LiveRunnerInput) {
    this.input = input
    this.body = connecting(input.capacity)
  }

  start(): Promise<LiveEnd> {
    this.arm('open', after(this.input.clock.now(), this.input.deadlines.openMs))
    void this.read()
    return this.ended.promise
  }
  get exited(): Promise<void> {
    return this.done.promise
  }
  get phase(): LiveBody['phase'] {
    return this.body.phase
  }

  /** A command whose modalities the call takes: taken once while open, seen again by its identity. */
  command(id: ModelOperationId, command: LiveCommand): LiveSubmit {
    const answer = submit(this.body, id, command)
    if (answer.kind === 'receipt') this.apply(answer.step)
    return answer
  }
  onMedia(listener: (frame: MediaFrame) => void): () => void {
    this.media.add(listener)
    return () => this.media.delete(listener)
  }
  writeMedia(frame: MediaFrame): MediaWrite {
    if (!this.input.takes.includes(frame.modality)) return { refused: 'modality' }
    return this.body.phase === 'open' ? this.input.session.input.media(frame) : 'dropped'
  }
  feed(input: LiveInput): void {
    this.apply(step(this.body, input))
  }

  private async read(): Promise<void> {
    try {
      this.iterator = this.input.session.facts[Symbol.asyncIterator]()
      for (;;) {
        const next = await this.iterator.next()
        if (next.done) break
        this.fact(next.value)
      }
    } catch {
      // A body that cannot read its session has lost the connection.
    }
    this.feed({ kind: 'lost' })
  }

  private fact(fact: LiveFact): void {
    const at = this.input.clock.now()
    switch (fact.kind) {
      case 'opened':
        return this.feed({ kind: 'opened', at, expiresAt: fact.expiresAt })
      case 'event':
        return this.feed({ kind: 'event', at, event: fact.event })
      case 'command':
        return this.feed({ kind: 'outcome', at, id: fact.id, outcome: fact.outcome })
      case 'media':
        for (const listener of this.media) listener(fact.frame)
        return
      case 'account':
        return this.feed({ kind: 'account', account: { event: fact.event, value: fact.value } })
      case 'closed':
        return this.feed({ kind: 'closed' })
    }
  }

  private apply(next: ReturnType<typeof step>): void {
    this.body = next.body
    for (const effect of next.effects) {
      try {
        this.effect(effect)
      } catch {
        this.feed({ kind: 'lost' })
      }
    }
  }

  private effect(effect: LiveEffect): void {
    switch (effect.kind) {
      case 'send':
        this.input.session.input.send(effect.command, effect.id)
        return
      case 'close':
        return this.input.session.input.close()
      case 'drop':
        return this.drop()
      case 'deliver':
        return void this.deliver(effect)
      case 'record-control':
        return void this.input.refuse()
      case 'settle': {
        const { termination, last, account } = effect
        return this.ended.resolve({ termination, last, account })
      }
      case 'deadline':
        return this.armAfter(effect.which, effect.at)
      case 'exit':
        this.disarm()
        this.stopping.abort()
        return this.done.resolve()
    }
  }

  private drop(): void {
    this.disarm()
    void this.iterator?.return?.()
  }

  private disarm(): void {
    for (const timer of this.timers.values()) timer.abort()
    this.timers.clear()
  }

  private armAfter(which: LiveDeadline, at: string | undefined): void {
    const { closeMs, drainMs } = this.input.deadlines
    this.arm(which, at ?? after(this.input.clock.now(), which === 'close' ? closeMs : drainMs))
  }

  private arm(which: LiveDeadline, instant: string): void {
    this.timers.get(which)?.abort()
    const timer = new AbortController()
    this.timers.set(which, timer)
    void this.input.clock.waitUntil(instant, timer.signal).then(elapsed => {
      if (elapsed === 'elapsed') this.feed({ kind: 'deadline', which })
    })
  }

  private async deliver(effect: Extract<LiveEffect, { kind: 'deliver' }>): Promise<void> {
    let answer: LiveDeliveryAnswer
    try {
      answer = await this.input.port.deliver(
        {
          tenant: this.input.tenant,
          call: this.input.call,
          consumer: this.input.consumer,
          from: effect.from,
          to: effect.to,
          frames: effect.frames,
        },
        this.stopping.signal,
      )
    } catch {
      answer = 'unknown'
    }
    if (answer === 'unknown' || answer === 'waiting') {
      const instant = after(this.input.clock.now(), this.input.deadlines.redeliverMs)
      await this.input.clock.waitUntil(instant, this.stopping.signal)
    }
    this.feed({ kind: 'answer', answer })
  }
}
