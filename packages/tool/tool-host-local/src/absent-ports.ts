// The ports that the first host does not provide (D-07): `toolDecisions`, `toolResourceResponses`
// and `toolChildren`. Every method answers a named `unavailable` that says which operation was
// asked. None throws and none answers an empty success, so a caller cannot take absence for an
// answer such as "no wait" or "no children".
import { fail, type Outcome } from '@omne-harness/operation-result'
import type { ToolFailure } from '@omne-harness/tool-contract'
import type {
  ToolChildren,
  ToolDecisionBridge,
  ToolResourceResponses,
} from '@omne-harness/tool-contract/provider'

/** The methods of a port, each named once. A method missing here fails the type check. */
type MethodSet<T> = { readonly [K in keyof T]-?: true }

const DECISION_METHODS = {
  inspectOperation: true,
  ensure: true,
  inspect: true,
  invalidate: true,
  resolve: true,
} as const satisfies MethodSet<ToolDecisionBridge<unknown>>

const RESOURCE_METHODS = {
  inspectOperation: true,
  ensure: true,
  inspect: true,
  expire: true,
  invalidate: true,
  resolve: true,
} as const satisfies MethodSet<ToolResourceResponses<unknown>>

const CHILD_METHODS = {
  reserve: true,
  admitted: true,
  retain: true,
  list: true,
  close: true,
  closure: true,
  confirmBarrier: true,
  finish: true,
} as const satisfies MethodSet<ToolChildren<unknown>>

function absentPort<T extends object>(port: string, methods: MethodSet<T>): T {
  const answer = (method: string): Promise<Outcome<never, ToolFailure>> =>
    Promise.resolve(
      fail({
        kind: 'unavailable',
        dependency: port,
        diagnostic: `${port}.${method} is not provided by this host`,
      }),
    )
  const methodsOut: Record<string, () => Promise<Outcome<never, ToolFailure>>> = {}
  for (const method of Object.keys(methods)) methodsOut[method] = () => answer(method)
  // Every method of `T` is listed in `methods` and answers a failure, which every `Reply` admits.
  return Object.freeze(methodsOut) as unknown as T
}

export type AbsentToolPorts<P> = Readonly<{
  toolDecisions: ToolDecisionBridge<P>
  toolResourceResponses: ToolResourceResponses<P>
  toolChildren: ToolChildren<P>
}>

/** The three ports in absence. */
export function createAbsentToolPorts<P>(): AbsentToolPorts<P> {
  return Object.freeze({
    toolDecisions: absentPort<ToolDecisionBridge<P>>('toolDecisions', DECISION_METHODS),
    toolResourceResponses: absentPort<ToolResourceResponses<P>>(
      'toolResourceResponses',
      RESOURCE_METHODS,
    ),
    toolChildren: absentPort<ToolChildren<P>>('toolChildren', CHILD_METHODS),
  })
}
