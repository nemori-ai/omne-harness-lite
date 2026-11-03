// Test double: a transport factory that answers from a script. Every `open` gives a transport;
// `open`, `discover` and `listActions` consume the next step of their kind, in order. A step is
// an immediate value, a `TransportFailure`, or a deferred that the test settles later. The double
// records every call. It does not read the abort signal: the table under test has to keep its
// own time, which is what the connection-bound case checks.
import type {
  ListingPage,
  McpTransport,
  McpTransportFactory,
  TransportFailure,
  TransportMaterial,
} from '@omne-harness/mcp-contract/provider'
import type { Generation, PeerIdentity } from '@omne-harness/mcp-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { Deferred } from './deferred.ts'

export type Scripted<T> = T | TransportFailure | Deferred<T> | Deferred<T | TransportFailure>

export type Step =
  | Readonly<{ open: Scripted<'opened'> }>
  | Readonly<{ discover: Scripted<PeerIdentity> }>
  | Readonly<{ listActions: Scripted<ListingPage> }>

export type Call =
  | Readonly<{ kind: 'open'; material: TransportMaterial }>
  | Readonly<{ kind: 'discover'; generation: Generation }>
  | Readonly<{ kind: 'listActions'; generation: Generation; cursor: string | undefined }>
  | Readonly<{ kind: 'close'; generation: Generation }>

export type ScriptedTransports = McpTransportFactory &
  Readonly<{
    calls: readonly Call[]
    /** How many steps the script still holds. */
    remaining: () => number
  }>

const FAILURE_KINDS: readonly string[] = [
  'not-sent',
  'no-answer',
  'error-answer',
  'answer-malformed',
]

function isTransportFailure(value: object): value is TransportFailure {
  return 'kind' in value && typeof value.kind === 'string' && FAILURE_KINDS.includes(value.kind)
}

function isDeferred<T>(value: Scripted<T>): value is Deferred<T> | Deferred<T | TransportFailure> {
  return typeof value === 'object' && value !== null && 'promise' in value
}

async function outcomeOf<T>(step: Scripted<T>): Promise<Outcome<T, TransportFailure>> {
  const settled = isDeferred(step) ? await step.promise : step
  if (typeof settled === 'object' && settled !== null && isTransportFailure(settled))
    return { failure: settled }
  return { ok: settled }
}

type StepKind = 'open' | 'discover' | 'listActions'

function notScripted(method: string): never {
  throw new Error(`scripted transport: ${method} is not scripted in this wave`)
}

export function scriptedTransports(script: readonly Step[]): ScriptedTransports {
  const queue = [...script]
  const calls: Call[] = []
  /** Takes the next step; it has to be of `kind`, or the script does not fit the test. */
  const take = (kind: StepKind): Step => {
    const head = queue.shift()
    if (head === undefined || !(kind in head))
      throw new Error(
        `scripted transport: expected a ${kind} step, got ${head === undefined ? 'end of script' : Object.keys(head).join()}`,
      )
    return head
  }
  const transportOf = (generation: Generation): McpTransport => ({
    generation,
    async discover() {
      calls.push({ kind: 'discover', generation })
      const step = take('discover')
      return 'discover' in step ? outcomeOf(step.discover) : notScripted('discover')
    },
    async listActions(cursor) {
      calls.push({ kind: 'listActions', generation, cursor })
      const step = take('listActions')
      return 'listActions' in step ? outcomeOf(step.listActions) : notScripted('listActions')
    },
    call: () => notScripted('call'),
    cancelRequest: () => notScripted('cancelRequest'),
    getTask: () => notScripted('getTask'),
    updateTask: () => notScripted('updateTask'),
    getTaskResult: () => notScripted('getTaskResult'),
    cancelTask: () => notScripted('cancelTask'),
    async close() {
      calls.push({ kind: 'close', generation })
    },
  })
  return {
    calls,
    remaining: () => queue.length,
    async open(material) {
      calls.push({ kind: 'open', material })
      const head = queue[0]
      if (head !== undefined && 'open' in head) {
        queue.shift()
        const opened = await outcomeOf(head.open)
        if ('failure' in opened) return opened
      }
      return { ok: transportOf(material.generation) }
    },
  }
}
