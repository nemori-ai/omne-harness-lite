// `createClient` (RFC-0015 §6「客户端核心」, #1249 spec 已定 16): one protocol contract and one
// transport give a typed client. Its answers are the contract's outcomes and two local ones:
// `unavailable` (no byte left, twice) and `uncertain` (a byte may have left and no trustworthy
// answer came back). Neither is ever written as a success or a failure.
import type { JsonLimits } from '@omne-harness/json-text'
import type {
  Codec,
  ObservationContract,
  OperationContract,
  ProtocolContract,
} from '@omne-harness/public-contract'
import { defaultLimits } from '../limits.ts'
import type { CallReport, ObserveEnd, ProtocolKey, Transport } from './transport.ts'

type ValueOf<C> = C extends Codec<infer T> ? T : never

export type BodyOf<O extends OperationContract> = ValueOf<O['body']>

/** One answer per outcome of the contract: an outcome with a codec carries its body. */
export type AnswerOf<O extends OperationContract> = {
  [K in keyof O['outcomes'] & string]: O['outcomes'][K] extends Codec<infer T>
    ? { readonly outcome: K; readonly body: T }
    : { readonly outcome: K }
}[keyof O['outcomes'] & string]

export type LocalOutcome = { readonly outcome: 'unavailable' } | { readonly outcome: 'uncertain' }

export type OpenOf<O extends ObservationContract> = ValueOf<O['open']>
export type FrameOf<O extends ObservationContract> = ValueOf<O['frame']>
/** The end reasons of an observation: its own, and the two every observation may end with. */
export type EndOf<O extends ObservationContract> = O['ends'][number] | 'denied' | 'unavailable'

/** How an observation ended, as the iteration's return value. */
export type ObservationEnd<O extends ObservationContract> =
  | { readonly kind: 'ended'; readonly reason: EndOf<O> }
  | { readonly kind: 'refused'; readonly outcome: string }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'uncertain' }
  | { readonly kind: 'aborted' }

export type CallOptions = {
  readonly signal?: AbortSignal
  /** The message id of the call; a fresh `crypto.randomUUID()` when absent. A resend keeps it. */
  readonly messageId?: string
}

export type ObserveOptions = { readonly signal: AbortSignal; readonly messageId?: string }

export type ClientOf<P extends ProtocolContract> = {
  readonly [K in keyof P['operations']]: (
    body: BodyOf<P['operations'][K]>,
    options?: CallOptions,
  ) => Promise<AnswerOf<P['operations'][K]> | LocalOutcome>
} & {
  readonly observe: {
    readonly [K in keyof P['observations']]: (
      open: OpenOf<P['observations'][K]>,
      options: ObserveOptions,
    ) => AsyncGenerator<FrameOf<P['observations'][K]>, ObservationEnd<P['observations'][K]>>
  }
}

/** A body or an opening the contract cannot write: the caller's mistake, never a wire outcome. */
export class ClientRequestError extends Error {
  override readonly name = 'ClientRequestError'
  readonly target: string
  constructor(target: string) {
    super(`${target}: the value does not fit the contract or the limits`)
    this.target = target
  }
}

export type ClientSettings = { readonly limits?: JsonLimits }

const UNAVAILABLE = Object.freeze({ outcome: 'unavailable' as const })
const UNCERTAIN = Object.freeze({ outcome: 'uncertain' as const })

type Outcomes = Readonly<Record<string, Codec<unknown> | true>>

function isEmptyObject(value: CallReport & { kind: 'answered' }): boolean {
  return value.body.kind === 'object' && value.body.entries.length === 0
}

/** Reads an answer by the contract; anything it does not describe is `uncertain`. */
function answerOf(
  outcomes: Outcomes,
  report: CallReport & { kind: 'answered' },
  limits: JsonLimits,
): { readonly outcome: string; readonly body?: unknown } {
  if (!Object.hasOwn(outcomes, report.outcome)) return UNCERTAIN
  const codec = outcomes[report.outcome]
  if (codec === true) return isEmptyObject(report) ? { outcome: report.outcome } : UNCERTAIN
  const read = codec!.read(report.body, limits)
  return read.ok ? { outcome: report.outcome, body: read.value } : UNCERTAIN
}

function endOf(
  contract: ObservationContract,
  end: ObserveEnd,
): ObservationEnd<ObservationContract> {
  switch (end.kind) {
    case 'ended':
      return end.reason === 'denied' ||
        end.reason === 'unavailable' ||
        contract.ends.includes(end.reason)
        ? { kind: 'ended', reason: end.reason }
        : { kind: 'uncertain' }
    case 'not-sent':
      return { kind: 'unavailable' }
    default:
      return end
  }
}

export function createClient<P extends ProtocolContract>(
  protocol: P,
  transport: Transport,
  settings: ClientSettings = {},
): ClientOf<P> {
  const limits = settings.limits ?? defaultLimits
  const key: ProtocolKey = { name: protocol.name, major: protocol.major }
  const target = (name: string): string => `${key.name}/v${key.major}/${name}`

  async function call(
    name: string,
    operation: OperationContract,
    body: unknown,
    options: CallOptions = {},
  ) {
    const written = operation.body.write(body as never, limits)
    if (!written.ok) throw new ClientRequestError(target(name))
    const request = {
      protocol: key,
      operation: name,
      messageId: options.messageId ?? crypto.randomUUID(),
      body: written.value,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    }
    // A send that provably did not leave is sent once more, under the same message id.
    let report = await transport.call(request)
    if (report.kind === 'not-sent') report = await transport.call(request)
    if (report.kind === 'not-sent') return UNAVAILABLE
    if (report.kind === 'uncertain') return UNCERTAIN
    return answerOf(operation.outcomes as Outcomes, report, limits)
  }

  async function* observe(
    name: string,
    contract: ObservationContract,
    open: unknown,
    options: ObserveOptions,
  ): AsyncGenerator<unknown, ObservationEnd<ObservationContract>> {
    const written = contract.open.write(open as never, limits)
    if (!written.ok) throw new ClientRequestError(target(name))
    const stream = transport.observe({
      protocol: key,
      observation: name,
      messageId: options.messageId ?? crypto.randomUUID(),
      open: written.value,
      signal: options.signal,
    })
    let finished = false
    try {
      for (;;) {
        const next = await stream.next()
        if (next.done === true) {
          finished = true
          return endOf(contract, next.value)
        }
        const frame = contract.frame.read(next.value, limits)
        if (!frame.ok) return { kind: 'uncertain' }
        yield frame.value
      }
    } finally {
      // The caller stopped reading, or a frame was outside the contract: close the stream.
      if (!finished) await stream.return({ kind: 'aborted' })
    }
  }

  const client: Record<string, unknown> = {}
  for (const [name, operation] of Object.entries(protocol.operations))
    client[name] = (body: unknown, options?: CallOptions) => call(name, operation, body, options)
  const observers: Record<string, unknown> = {}
  for (const [name, contract] of Object.entries(protocol.observations))
    observers[name] = (open: unknown, options: ObserveOptions) =>
      observe(name, contract, open, options)
  client['observe'] = observers
  return client as ClientOf<P>
}
