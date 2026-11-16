import type { JsonLimits } from '@omne-harness/json-text'
import type {
  Codec,
  ObservationContract,
  OperationContract,
  ProtocolContract,
} from '@omne-harness/public-contract'
import { defaultLimits } from '../limits.ts'
import type { CallReport, CallRequest, ObserveEnd, ProtocolKey, Transport } from './transport.ts'

type ValueOf<C> = C extends Codec<infer T> ? T : never

export type BodyOf<O extends OperationContract> = ValueOf<O['body']>

export type AnswerOf<O extends OperationContract> = {
  [K in keyof O['outcomes'] & string]: O['outcomes'][K] extends Codec<infer T>
    ? { readonly outcome: K; readonly body: T }
    : { readonly outcome: K }
}[keyof O['outcomes'] & string]

export type LocalOutcome = { readonly outcome: 'unavailable' } | { readonly outcome: 'uncertain' }

export type OpenOf<O extends ObservationContract> = ValueOf<O['open']>
export type FrameOf<O extends ObservationContract> = ValueOf<O['frame']>
export type EndOf<O extends ObservationContract> = O['ends'][number] | 'denied' | 'unavailable'

export type ObservationEnd<O extends ObservationContract> =
  | { readonly kind: 'ended'; readonly reason: EndOf<O> }
  | { readonly kind: 'refused'; readonly outcome: string }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'uncertain' }
  | { readonly kind: 'aborted' }

export type CallOptions = {
  readonly signal?: AbortSignal
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

export class ClientRequestError extends Error {
  override readonly name = 'ClientRequestError'
  readonly target: string
  constructor(target: string) {
    super(`${target}: the value does not fit the contract or the limits`)
    this.target = target
  }
}

export type ReadRetry = {
  readonly delayMs: (failures: number, elapsedMs: number) => number | null
  readonly wait: (ms: number, signal: AbortSignal | undefined) => Promise<void>
}

export type ClientSettings = { readonly limits?: JsonLimits; readonly readRetry?: ReadRetry }

const now = (): number =>
  /* wall-clock: operation-timing -- The elapsed time of a read is a monotonic duration from its first ask. */ performance.now()

const UNAVAILABLE = Object.freeze({ outcome: 'unavailable' as const })
const UNCERTAIN = Object.freeze({ outcome: 'uncertain' as const })

type Outcomes = Readonly<Record<string, Codec<unknown> | true>>

function isNotReadable(answer: { readonly outcome: string }): boolean {
  return (
    answer.outcome === 'unavailable' ||
    answer.outcome === 'uncertain' ||
    answer.outcome === 'basis-unavailable'
  )
}

function isEmptyObject(value: CallReport & { kind: 'answered' }): boolean {
  return value.body.kind === 'object' && value.body.entries.length === 0
}

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
  if (Object.hasOwn(protocol.operations, 'observe'))
    throw new TypeError(
      `${target('observe')}: an operation cannot take the name of the observations`,
    )

  async function ask(operation: OperationContract, request: CallRequest) {
    let report = await transport.call(request)
    if (report.kind === 'not-sent') report = await transport.call(request)
    if (report.kind === 'not-sent') return UNAVAILABLE
    if (report.kind === 'uncertain') return UNCERTAIN
    return answerOf(operation.outcomes as Outcomes, report, limits)
  }

  async function call(
    name: string,
    operation: OperationContract,
    body: unknown,
    options: CallOptions = {},
  ) {
    const written = operation.body.write(body as never, limits)
    if (!written.ok) throw new ClientRequestError(target(name))
    const request: CallRequest = {
      protocol: key,
      operation: name,
      messageId: options.messageId ?? crypto.randomUUID(),
      body: written.value,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    }
    const retry = operation.effect === 'read' ? settings.readRetry : undefined
    const started = now()
    let answer = await ask(operation, request)
    if (retry === undefined) return answer
    const stopped = (): boolean => options.signal?.aborted === true
    for (let failures = 1; isNotReadable(answer); failures += 1) {
      if (stopped()) return answer
      const delay = retry.delayMs(failures, now() - started)
      if (delay === null) return answer
      await retry.wait(delay, options.signal)
      if (stopped()) return answer
      answer = await ask(operation, { ...request, messageId: crypto.randomUUID() })
    }
    return answer
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
    try {
      for (;;) {
        const next = await stream.next()
        if (next.done === true) return endOf(contract, next.value)
        const frame = contract.frame.read(next.value, limits)
        if (!frame.ok) return { kind: 'uncertain' }
        yield frame.value
      }
    } finally {
      await stream.return({ kind: 'aborted' })
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
