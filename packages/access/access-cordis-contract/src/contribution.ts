import type {
  Codec,
  ObservationContract,
  OperationContract,
  ProtocolContract,
} from '@omne-harness/public-contract'

export type ProtocolKey = { readonly name: string; readonly major: number }

declare const loginIdentityBrand: unique symbol
declare const principalBrand: unique symbol
export type LoginIdentity = { readonly [loginIdentityBrand]: 'LoginIdentity' }
export type Principal = { readonly [principalBrand]: 'Principal' }

export type PrincipalFor<I extends OperationContract['identity']> = I extends 'none'
  ? undefined
  : I extends 'login'
    ? LoginIdentity
    : Principal

type ValueOf<C> = C extends Codec<infer T> ? T : never

export type BodyOf<O extends OperationContract> = ValueOf<O['body']>

export type AnswerOf<O extends OperationContract> = {
  [K in keyof O['outcomes'] & string]: O['outcomes'][K] extends Codec<infer T>
    ? { readonly outcome: K; readonly body: T }
    : { readonly outcome: K }
}[keyof O['outcomes'] & string]

export type CallContext<O extends OperationContract> = {
  readonly principal: PrincipalFor<O['identity']>
  readonly messageId: string
  readonly signal: AbortSignal
}

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
export type EndOf<O extends ObservationContract> = O['ends'][number] | 'denied' | 'unavailable'

export type FrameSource<O extends ObservationContract> = (
  context: ObservationContext<O>,
  open: OpenOf<O>,
) => Promise<
  | { readonly outcome: 'succeeded'; readonly frames: AsyncGenerator<FrameOf<O>, EndOf<O>> }
  | { readonly outcome: 'denied' | 'invalid' | 'basis-unavailable' }
>

export type AccessContribution<P extends ProtocolContract> = {
  readonly protocol: P
  readonly operations: {
    readonly [K in keyof P['operations']]: OperationHandler<P['operations'][K]>
  }
  readonly observations: {
    readonly [K in keyof P['observations']]: FrameSource<P['observations'][K]>
  }
}

export class AccessAssemblyError extends Error {
  readonly protocol: ProtocolKey
  constructor(protocol: ProtocolKey) {
    super(`protocol ${protocol.name}/v${protocol.major} is already mounted`)
    this.name = 'AccessAssemblyError'
    this.protocol = protocol
  }
}
