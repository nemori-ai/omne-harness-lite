import type { FixedOutcome, Outcome } from './outcome.ts'
import type { Codec } from './rule-codec.ts'

type Identity = 'none' | 'login' | 'acting-tenant'

/**
 * Every outcome an operation may answer, with how its body is read and written. `succeeded` is
 * always there. A fixed outcome maps only to `true`: its body is the empty object and a domain
 * cannot give it fields (RFC-0015 I-13).
 */
export type OutcomeBodies = { readonly succeeded: Codec<any> } & {
  readonly [K in Exclude<Outcome, 'succeeded'>]?: K extends FixedOutcome ? true : Codec<any>
}

/** One operation of a protocol contract. */
export type OperationContract<Body = any, Results extends OutcomeBodies = OutcomeBodies> = {
  /** How far the pipeline goes before the handler: no caller, a login, or a login acting for a tenant. */
  readonly identity: Identity
  /** A commit may leave its result unknown; a read cannot. */
  readonly effect: 'read' | 'commit'
  /** The name of the body size limit. The number is deployment configuration. */
  readonly limit: 'small' | 'input'
  readonly body: Codec<Body>
  readonly outcomes: Results
  /** The result carries a login proof, so the generic channel does not forward this operation. */
  readonly carriesCredential?: true
  /** A `succeeded` answer counts as one successful business access. */
  readonly countsAsAccess?: true
}

/** One observation of a protocol contract. */
export type ObservationContract<Open = any, Frame = any, End extends string = string> = {
  readonly identity: Identity
  /** The name of the opening body's size limit, as for an operation. Absent: `small`. */
  readonly limit?: 'small' | 'input'
  readonly open: Codec<Open>
  readonly frame: Codec<Frame>
  /** This observation's own end reasons. The hub's end reasons are the same for every observation and are not listed. */
  readonly ends: readonly End[]
  /** Opening it counts as one successful business access. */
  readonly countsAsAccess?: true
}

/** The operations and observations a domain opens to clients. Both ends use the same value. */
export type ProtocolContract = {
  readonly name: string
  readonly major: number
  readonly operations: Readonly<Record<string, OperationContract>>
  readonly observations: Readonly<Record<string, ObservationContract>>
}

/** The outcomes the pipeline answers for the domain, so every operation has them. */
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

/** `P` with the pipeline's outcomes added to the outcomes of every operation. */
export type DefinedProtocol<P extends ProtocolContract> = Flatten<
  Omit<P, 'operations'> & {
    readonly operations: { readonly [N in keyof P['operations']]: WithPipeline<P['operations'][N]> }
  }
>

/** `T` with every key outside `Allowed` mapped to `never`, so an inferred literal with such a key does not compile. */
type Only<T, Allowed extends PropertyKey> = {
  readonly [K in keyof T]: K extends Allowed ? T[K] : never
}
type ClosedOperation<O> = O extends { readonly outcomes: infer R }
  ? Only<O, keyof OperationContract> & { readonly outcomes: Only<R, Outcome> }
  : O
/** The closed shape check: no field outside the contract types and no outcome outside the table. */
type Closed<P extends ProtocolContract> = Only<P, keyof ProtocolContract> & {
  readonly operations: {
    readonly [N in keyof P['operations']]: ClosedOperation<P['operations'][N]>
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

/**
 * Checks a protocol contract against the closed outcome table and adds, to every operation, the
 * outcomes the pipeline answers: `protocol-rejected` and `basis-unavailable` always, `denied`
 * when the operation needs an identity, `unknown` when it commits. Observations are kept as
 * written. Returns a new value and leaves `protocol` unchanged.
 */
export function defineProtocol<const P extends ProtocolContract>(
  protocol: P & Closed<P>,
): DefinedProtocol<P> {
  const operations = Object.fromEntries(
    Object.entries(protocol.operations).map(([name, operation]) => [
      name,
      { ...operation, outcomes: { ...operation.outcomes, ...pipelineOutcomes(operation) } },
    ]),
  )
  return { ...protocol, operations } as DefinedProtocol<P>
}
