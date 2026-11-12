// The shape a domain hands to the access entry (RFC-0015 §5「登记表与贡献」): a protocol contract
// plus one handler for each operation and one frame source for each observation. Every type here
// comes from the contract, so a handler that disagrees with it does not compile.
import type {
  Codec,
  ObservationContract,
  OperationContract,
  ProtocolContract,
} from '@omne-harness/public-contract'

/** A protocol on the registry: its name and major version. */
export type ProtocolKey = { readonly name: string; readonly major: number }

declare const loginIdentityBrand: unique symbol
declare const principalBrand: unique symbol
/**
 * The login identity the pipeline recognised. Opaque until access is joined to identity; only the
 * pipeline creates one.
 */
export type LoginIdentity = { readonly [loginIdentityBrand]: 'LoginIdentity' }
/**
 * The subject acting for a tenant that the pipeline issued. Opaque until access is joined to
 * identity; only the pipeline creates one.
 */
export type Principal = { readonly [principalBrand]: 'Principal' }

/** What the handler receives as its caller, by the `identity` column of the contract. */
export type PrincipalFor<I extends OperationContract['identity']> = I extends 'none'
  ? undefined
  : I extends 'login'
    ? LoginIdentity
    : Principal

type ValueOf<C> = C extends Codec<infer T> ? T : never

/** The local body of an operation. */
export type BodyOf<O extends OperationContract> = ValueOf<O['body']>

/**
 * The answers a handler may give: one per outcome of the contract. An outcome with a codec carries
 * its body; a fixed outcome carries none.
 */
export type AnswerOf<O extends OperationContract> = {
  [K in keyof O['outcomes'] & string]: O['outcomes'][K] extends Codec<infer T>
    ? { readonly outcome: K; readonly body: T }
    : { readonly outcome: K }
}[keyof O['outcomes'] & string]

export type CallContext<O extends OperationContract> = {
  readonly principal: PrincipalFor<O['identity']>
  readonly messageId: string
  /** Aborted when the protocol is taken down while this call is in flight. */
  readonly signal: AbortSignal
}

/**
 * One operation of the domain. A handler that knows nothing was committed answers
 * `basis-unavailable` itself; a failure it throws is answered by the effect rule.
 */
export type OperationHandler<O extends OperationContract> = (
  call: CallContext<O>,
  body: BodyOf<O>,
) => Promise<AnswerOf<O>>

export type ObservationContext<O extends ObservationContract> = {
  readonly principal: PrincipalFor<O['identity']>
  readonly messageId: string
  readonly signal: AbortSignal
}
export type OpenOf<O extends ObservationContract> = ValueOf<O['open']>
export type FrameOf<O extends ObservationContract> = ValueOf<O['frame']>
/** The end reasons of an observation: its own, or the two of the hub that a frame source meets itself. */
export type EndOf<O extends ObservationContract> = O['ends'][number] | 'denied' | 'unavailable'

/** One observation of the domain: decides whether to open, then yields frames until it ends. */
export type FrameSource<O extends ObservationContract> = (
  context: ObservationContext<O>,
  open: OpenOf<O>,
) => Promise<
  | { readonly outcome: 'succeeded'; readonly frames: AsyncGenerator<FrameOf<O>, EndOf<O>> }
  | { readonly outcome: 'denied' | 'invalid' | 'basis-unavailable' }
>

/** What a domain mounts on the registry. It covers every operation and observation of `protocol`. */
export type AccessContribution<P extends ProtocolContract> = {
  readonly protocol: P
  readonly operations: {
    readonly [K in keyof P['operations']]: OperationHandler<P['operations'][K]>
  }
  readonly observations: {
    readonly [K in keyof P['observations']]: FrameSource<P['observations'][K]>
  }
}

/** Thrown when a protocol of the same name and major version is already mounted. */
export class AccessAssemblyError extends Error {
  readonly protocol: ProtocolKey
  constructor(protocol: ProtocolKey) {
    super(`protocol ${protocol.name}/v${protocol.major} is already mounted`)
    this.name = 'AccessAssemblyError'
    this.protocol = protocol
  }
}
