// The observation hub (RFC-0015 §5「观察中枢」, #1249 spec 已定 2 to 7): what is the same for every
// observation at the new address. It takes the slot, lets the frame source decide whether to open,
// writes the frames as SSE events, bounds the bytes not yet written, checks the login each round,
// and ends the observation on every way it can end. `leave` is called in one place, once, after
// the `ended` frame is written out or the grace ran out: a take-down completes only then.
import type { ServerResponse } from 'node:http'
import type { FrameSource } from '@omne-harness/access-cordis-contract'
import { writeJsonText, type JsonLimits, type JsonValue } from '@omne-harness/json-text'
import type { ObservationContract } from '@omne-harness/public-contract'
import { EMPTY_BODY, writeAnswer } from '../pipeline/answer.ts'
import { watchCall } from '../pipeline/watch.ts'
import type { Entered } from '../registry/registry.ts'
import type { Clock } from '../settle/settle.ts'
import {
  createObservationRecords,
  type Ended,
  type EndReason,
  type LoginCheck,
  type ObservationClaim,
} from './records.ts'
import { SseStream } from './sse.ts'

/** The error points of the hub, reported through the pipeline's `access.diagnostics`. */
export type HubDiagnosticCode =
  | 'access.observation-full'
  | 'access.frame-source-fault'
  | 'access.frame-rejected'
  | 'access.frame-queue-full'

/** The values the hub needs, given by `http.ts` at construction. */
export type HubSettings = Readonly<{
  limits: Readonly<{ perLogin: number; perInstance: number }>
  heartbeatMs: number
  /** The length of one round: the wait between two login checks of one observation. */
  loginCheckIntervalMs: number
  /** The upper bound of the bytes of one observation's events not yet written out. */
  frameQueueBytes: number
  /** How long an `ended` frame may take to be written out before the connection is cut. */
  graceMs: number
  clock: Clock
  writeLimits: JsonLimits
}>

/** One observation the pipeline hands over after step 9. */
export type HubOpen = Readonly<{
  entered: Entered
  contract: ObservationContract
  source: FrameSource<ObservationContract>
  principal: unknown
  messageId: string
  open: unknown
  /** Same key, same observation: a new one replaces the old one. */
  key: string
  /** The login the per-login bound counts and the round checks. Absent for `identity: 'none'`. */
  loginKey?: string
  checkLogin?: () => Promise<LoginCheck>
  /** Reports one successful business access; called once, after the first frame is queued. */
  reportAccess?: () => void
  note: (code: HubDiagnosticCode) => void
  res: ServerResponse
}>

export type ObservationHub = Readonly<{
  /** Serves one observation; settles after it ended and `leave` was called. */
  open: (input: HubOpen) => Promise<void>
  /** Ends every observation with `unavailable` (the entry stops). */
  endAll: () => Promise<void>
}>

type Reason = EndReason<string>

/**
 * Marks frames the hub takes at the pace they are written out: the next frame is pulled only once
 * the last one left the write queue, so the backlog stays with the frame source. Only the entry's
 * own availability source carries it; the package entry does not export it, so a domain's
 * observation is always pulled as soon as a frame is there and its backlog meets the byte bound.
 */
export const PACED = Symbol('server-entry: paced frames')

function isPaced(frames: object): boolean {
  return (frames as { readonly [PACED]?: unknown })[PACED] === true
}

function text(fields: readonly (readonly [string, JsonValue])[]): string {
  return writeJsonText({ kind: 'object', entries: fields.map(([key, value]) => ({ key, value })) })
}

const endedText = (reason: string): string =>
  text([
    ['kind', { kind: 'string', value: 'ended' }],
    ['reason', { kind: 'string', value: reason }],
  ])

const frameText = (frame: JsonValue): string =>
  text([
    ['kind', { kind: 'string', value: 'frame' }],
    ['frame', frame],
  ])

/** A frame source may end with its own reasons or the two of the hub it meets itself. */
function endsWithin(contract: ObservationContract, reason: unknown): reason is string {
  return (
    typeof reason === 'string' &&
    (reason === 'denied' || reason === 'unavailable' || contract.ends.includes(reason))
  )
}

type Step =
  | Readonly<{ kind: 'frame'; value: unknown }>
  | Readonly<{ kind: 'done'; value: unknown }>
  | Readonly<{ kind: 'threw' }>
  | Readonly<{ kind: 'ended' }>

/** How the frame source's step ends the observation; `undefined` when it already ended elsewhere. */
function endOf(
  step: Exclude<Step, { kind: 'frame' }>,
  contract: ObservationContract,
): Readonly<{ reason: Reason; code?: HubDiagnosticCode }> | undefined {
  switch (step.kind) {
    case 'ended':
      return undefined
    case 'threw':
      return { reason: 'unavailable', code: 'access.frame-source-fault' }
    case 'done':
      return endsWithin(contract, step.value)
        ? { reason: step.value }
        : { reason: 'unavailable', code: 'access.frame-source-fault' }
  }
}

type Frames = AsyncGenerator<unknown, unknown>

/** The next step of the frame source, or the end that came first. */
function nextStep(frames: Frames, ended: Promise<Step>): Promise<Step> {
  return Promise.race<Step>([
    frames.next().then(
      (result): Step =>
        result.done === true
          ? { kind: 'done', value: result.value }
          : { kind: 'frame', value: result.value },
      (): Step => ({ kind: 'threw' }),
    ),
    ended,
  ])
}

export function createObservationHub(settings: HubSettings): ObservationHub {
  const records = createObservationRecords<string>({
    limits: { ...settings.limits, cancelRetentionMs: 0 },
    loginCheckIntervalMs: settings.loginCheckIntervalMs,
  })

  /**
   * Waits for the `ended` frame to be written out, or cuts the connection after the grace. A cut
   * connection closes the stream, so both ways settle through `finished`.
   */
  const drained = async (stream: SseStream, res: ServerResponse): Promise<void> => {
    const cancel = settings.clock.schedule(settings.graceMs, () => res.destroy())
    await stream.finished
    cancel()
  }

  /**
   * Lets the frame source decide whether to open. A refusal, a fault or a take-down is answered
   * here; a caller who went away gets nothing. Returns the frames when it opened; otherwise the
   * caller aborts `source` at once, which is the moment the wait was interrupted.
   */
  async function decide(input: HubOpen, source: AbortController): Promise<Frames | undefined> {
    const { entered, res, messageId, note } = input
    const watch = watchCall(entered.signal, res)
    const decided = await watch.attend(() =>
      input.source(
        { principal: input.principal as never, messageId, signal: source.signal },
        input.open,
      ),
    )
    watch.release()
    if (decided.kind === 'done' && decided.value.outcome === 'succeeded')
      return decided.value.frames
    if (decided.kind === 'interrupted' && decided.by === 'gone') return undefined
    if (decided.kind === 'threw') note('access.frame-source-fault')
    const outcome = decided.kind === 'done' ? decided.value.outcome : 'basis-unavailable'
    // writeAnswer closes the connection of every denied answer.
    writeAnswer(res, { outcome, body: EMPTY_BODY, messageId, close: false })
    return undefined
  }

  /** Ends the observation by the frame source's last step, unless it already ended elsewhere. */
  function endBy(
    input: HubOpen,
    claim: ObservationClaim<string>,
    step: Exclude<Step, { kind: 'frame' }>,
  ): void {
    const end = endOf(step, input.contract)
    if (end === undefined) return
    if (end.code !== undefined) input.note(end.code)
    claim.end(end.reason)
  }

  /** Queues one frame as an event. A frame outside the contract ends the observation instead. */
  function put(
    input: HubOpen,
    claim: ObservationClaim<string>,
    stream: SseStream,
    frame: unknown,
  ): boolean {
    const written = input.contract.frame.write(frame, settings.writeLimits)
    if (!written.ok) {
      input.note('access.frame-rejected')
      claim.end('unavailable')
      return false
    }
    stream.event(frameText(written.value))
    return true
  }

  /** Writes frames until the observation ends, by its source, its observer or anything else. */
  async function pump(
    input: HubOpen,
    claim: ObservationClaim<string>,
    stream: SseStream,
    frames: Frames,
    ended: Promise<Step>,
  ): Promise<void> {
    const paced = isPaced(frames)
    // Reported once, after the first frame is queued.
    let report = input.reportAccess
    for (;;) {
      const step = await nextStep(frames, ended)
      if (step.kind !== 'frame') return endBy(input, claim, step)
      if (!put(input, claim, stream, step.value)) return
      report?.()
      report = undefined
      if (stream.queuedFrameBytes > settings.frameQueueBytes) {
        // The observer is not reading: no frame can reach it, so the connection goes too.
        input.note('access.frame-queue-full')
        claim.end('capacity')
        input.res.destroy()
        return
      }
      if (paced) await Promise.race([stream.written(), ended])
    }
  }

  async function open(input: HubOpen): Promise<void> {
    const { entered, res, messageId } = input
    let markEnded: () => void = () => {}
    const ended = new Promise<Step>(resolve => {
      markEnded = () => resolve({ kind: 'ended' })
    })
    const claim = records.claim({
      key: input.key,
      ...(input.loginKey === undefined ? {} : { loginKey: input.loginKey }),
      ...(input.checkLogin === undefined ? {} : { checkLogin: input.checkLogin }),
      endFrame: endedText,
      onEnded: (_ended: Ended<string>) => markEnded(),
    })
    if (claim === undefined) {
      input.note('access.observation-full')
      writeAnswer(res, { outcome: 'basis-unavailable', body: EMPTY_BODY, messageId, close: false })
      return entered.leave()
    }
    // The frame source sees one signal: the take-down, the caller going away, or the end.
    const source = new AbortController()
    const frames = await decide(input, source)
    if (frames === undefined) {
      claim.discard()
      source.abort()
      return entered.leave()
    }
    const stream = new SseStream(res, settings.heartbeatMs)
    stream.open(200, undefined, { 'omne-message-id': messageId })
    claim.attach(stream)
    const onAbort = (): void => claim.end('unavailable')
    entered.signal.addEventListener('abort', onAbort)
    if (entered.signal.aborted) onAbort()
    await pump(input, claim, stream, frames, ended)
    entered.signal.removeEventListener('abort', onAbort)
    source.abort()
    // The frame source winds down in its own time; its end reason no longer matters.
    void frames.return(undefined).catch(() => {})
    await drained(stream, res)
    entered.leave()
  }

  return {
    open,
    endAll: () => records.endAll('unavailable'),
  }
}
