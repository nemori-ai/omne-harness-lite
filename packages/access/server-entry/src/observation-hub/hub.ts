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

export type HubDiagnosticCode =
  | 'access.observation-full'
  | 'access.frame-source-fault'
  | 'access.frame-rejected'
  | 'access.frame-queue-full'

export type HubSettings = Readonly<{
  limits: Readonly<{ perLogin: number; perInstance: number }>
  heartbeatMs: number
  loginCheckIntervalMs: number
  frameQueueBytes: number
  graceMs: number
  clock: Clock
  writeLimits: JsonLimits
}>

export type HubOpen = Readonly<{
  entered: Entered
  contract: ObservationContract
  source: FrameSource<ObservationContract>
  principal: unknown
  messageId: string
  open: unknown
  key: string
  loginKey?: string
  checkLogin?: () => Promise<LoginCheck>
  reportAccess?: () => void
  note: (code: HubDiagnosticCode) => void
  res: ServerResponse
}>

export type ObservationHub = Readonly<{
  open: (input: HubOpen) => Promise<void>
  endAll: () => Promise<void>
}>

type Reason = EndReason<string>

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

  const drained = async (stream: SseStream, res: ServerResponse): Promise<void> => {
    const cancel = settings.clock.schedule(settings.graceMs, () => res.destroy())
    await stream.finished
    cancel()
  }

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
    writeAnswer(res, { outcome, body: EMPTY_BODY, messageId, close: false })
    return undefined
  }

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

  async function pump(
    input: HubOpen,
    claim: ObservationClaim<string>,
    stream: SseStream,
    frames: Frames,
    ended: Promise<Step>,
  ): Promise<void> {
    const paced = isPaced(frames)
    let report = input.reportAccess
    for (;;) {
      const step = await nextStep(frames, ended)
      if (step.kind !== 'frame') return endBy(input, claim, step)
      if (!put(input, claim, stream, step.value)) return
      report?.()
      report = undefined
      if (stream.queuedFrameBytes > settings.frameQueueBytes) {
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
    void frames.return(undefined).catch(() => {})
    await drained(stream, res)
    entered.leave()
  }

  return {
    open,
    endAll: () => records.endAll('unavailable'),
  }
}
