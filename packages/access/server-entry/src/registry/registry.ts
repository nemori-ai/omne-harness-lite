import type {
  AccessContribution,
  FrameSource,
  OperationHandler,
  ProtocolKey,
} from '@omne-harness/access-cordis-contract'
import type {
  ObservationContract,
  OperationContract,
  ProtocolContract,
} from '@omne-harness/public-contract'

export type Entered = {
  readonly member:
    | {
        readonly kind: 'operation'
        readonly contract: OperationContract
        readonly handler: OperationHandler<any>
      }
    | {
        readonly kind: 'observation'
        readonly contract: ObservationContract
        readonly source: FrameSource<any>
      }
  /** The revision of the protocol the member belongs to. */
  readonly revision: number
  readonly signal: AbortSignal
  readonly leave: () => void
}

/** A protocol the entry serves: its key, the revision of its contract, and the contract itself. */
export type ServedProtocol = ProtocolKey & {
  readonly revision: number
  readonly contract: ProtocolContract
}

export type AvailabilityChange = {
  readonly revision: number
  readonly change: 'mounted' | 'unmounted'
  readonly protocol: ServedProtocol
  /** The protocols that two instances hold at once, after this change. */
  readonly conflicts: readonly ProtocolKey[]
}

export type AvailabilitySubscription = {
  readonly revision: number
  readonly protocols: readonly ServedProtocol[]
  readonly conflicts: readonly ProtocolKey[]
  readonly unsubscribe: () => void
}

/** A call that was not taken: the protocol is not there, two instances hold it, or it has no such name. */
export type Refusal = Readonly<{
  refused: 'not-mounted' | 'not-offered' | 'conflict'
  by?: readonly string[]
}>

export type RegistryForPipeline = {
  readonly enter: (key: ProtocolKey, name: string) => Entered | Refusal
  readonly subscribe: (listener: (change: AvailabilityChange) => void) => AvailabilitySubscription
}

type Mount = <P extends ProtocolContract>(
  contribution: AccessContribution<P>,
) => () => Promise<void>

/** What the entry needs besides the pipeline's part: a way to put its own protocol and take it back. */
export type RegistryForEntry = RegistryForPipeline & { readonly own: Mount }

export type StandaloneRegistry = RegistryForEntry & { readonly mount: Mount }

export function memberOf(
  contribution: AccessContribution<ProtocolContract>,
  name: string,
): Entered['member'] | undefined {
  const { operations, observations } = contribution.protocol
  // Own names only: a name taken from a request must not reach the object prototype.
  if (Object.hasOwn(operations, name))
    return {
      kind: 'operation',
      contract: operations[name] as OperationContract,
      handler: contribution.operations[name] as OperationHandler<any>,
    }
  if (Object.hasOwn(observations, name))
    return {
      kind: 'observation',
      contract: observations[name] as ObservationContract,
      source: contribution.observations[name] as FrameSource<any>,
    }
  return undefined
}
