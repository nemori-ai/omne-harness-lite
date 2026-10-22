// One send of the pi transport. Materialization follows in the next step.
import type {
  FixedModelRequest,
  MaterializedTransport,
  Supplier,
  TransportFailure,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { CheckedConfig, CheckedRoute } from './config.ts'
import type { PiFamilyBinding } from './family.ts'

export type MaterializedHandle = MaterializedTransport

export type MaterializeInput = Readonly<{
  config: CheckedConfig
  route: CheckedRoute
  request: FixedModelRequest
  supplier: Supplier
  binding: PiFamilyBinding
  signal: AbortSignal
}>

export async function materialize(
  _input: MaterializeInput,
): Promise<Outcome<MaterializedHandle, TransportFailure>> {
  return {
    failure: { kind: 'unavailable', dependency: 'pi-transport', diagnostic: 'not-implemented' },
  }
}
