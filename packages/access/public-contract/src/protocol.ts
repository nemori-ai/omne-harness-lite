import type { FixedOutcome, Outcome } from './outcome.ts'
import type { Codec } from './rule-codec.ts'

type Identity = 'none' | 'login' | 'acting-tenant'

export type OutcomeBodies = { readonly succeeded: Codec<any> } & {
  readonly [K in Exclude<Outcome, 'succeeded'>]?: K extends FixedOutcome ? true : Codec<any>
}

export type OperationContract<Body = any, Results extends OutcomeBodies = OutcomeBodies> = {
  readonly identity: Identity
  readonly effect: 'read' | 'commit'
  readonly limit: 'small' | 'input'
  readonly body: Codec<Body>
  readonly outcomes: Results
  readonly carriesCredential?: true
  readonly countsAsAccess?: true
}

export type ObservationContract<Open = any, Frame = any, End extends string = string> = {
  readonly identity: Identity
  readonly limit?: 'small' | 'input'
  readonly open: Codec<Open>
  readonly frame: Codec<Frame>
  readonly ends: readonly End[]
  readonly countsAsAccess?: true
}

export type ProtocolContract = {
  readonly name: string
  readonly major: number
  readonly operations: Readonly<Record<string, OperationContract>>
  readonly observations: Readonly<Record<string, ObservationContract>>
}

type PipelineOutcome<O extends OperationContract> =
  | 'protocol-rejected'
  | 'basis-unavailable'
  | ([Exclude<O['identity'], 'none'>] extends [never] ? never : 'denied')
  | ('commit' extends O['effect'] ? 'unknown' : never)

type Flatten<T> = { [K in keyof T]: T[K] } & {}

type WithPipeline<O extends OperationContract> = Flatten<
  Omit<O, 'outcomes'> & {
    readonly outcomes: Flatten<O['outcomes'] & { readonly [K in PipelineOutcome<O>]: true }>
  }
>

export type DefinedProtocol<P extends ProtocolContract> = Flatten<
  Omit<P, 'operations'> & {
    readonly operations: { readonly [N in keyof P['operations']]: WithPipeline<P['operations'][N]> }
  }
>

type Only<T, Allowed extends PropertyKey> = {
  readonly [K in keyof T]: K extends Allowed ? T[K] : never
}
type ClosedOperation<O> = O extends { readonly outcomes: infer R }
  ? Only<O, keyof OperationContract> & { readonly outcomes: Only<R, Outcome> }
  : O
const RESERVED_OPERATION_NAME = 'observe'

type Closed<P extends ProtocolContract> = Only<P, keyof ProtocolContract> & {
  readonly operations: {
    readonly [N in keyof P['operations']]: N extends typeof RESERVED_OPERATION_NAME
      ? never
      : ClosedOperation<P['operations'][N]>
  }
  readonly observations: {
    readonly [N in keyof P['observations']]: Only<P['observations'][N], keyof ObservationContract>
  }
}

function pipelineOutcomes(operation: OperationContract): Partial<Record<FixedOutcome, true>> {
  return {
    'protocol-rejected': true,
    'basis-unavailable': true,
    ...(operation.identity === 'none' ? {} : { denied: true }),
    ...(operation.effect === 'commit' ? { unknown: true } : {}),
  }
}

export function defineProtocol<const P extends ProtocolContract>(
  protocol: P & Closed<P>,
): DefinedProtocol<P> {
  if (Object.hasOwn(protocol.operations, RESERVED_OPERATION_NAME))
    throw new TypeError(
      `${protocol.name}/v${protocol.major}: no operation may be named "${RESERVED_OPERATION_NAME}"`,
    )
  const operations = Object.fromEntries(
    Object.entries(protocol.operations).map(([name, operation]) => [
      name,
      { ...operation, outcomes: { ...operation.outcomes, ...pipelineOutcomes(operation) } },
    ]),
  )
  return { ...protocol, operations } as DefinedProtocol<P>
}
