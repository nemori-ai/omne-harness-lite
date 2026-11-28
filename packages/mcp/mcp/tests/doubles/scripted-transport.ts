import type {
  EventListingPage,
  ListingPage,
  McpTransport,
  McpTransportFactory,
  TransportFailure,
  TransportMaterial,
} from '@omne-harness/mcp-contract/provider'
import type {
  Generation,
  PeerIdentity,
  ResourceContent,
  SkillListingPage,
} from '@omne-harness/mcp-contract'
import type { JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/operation-result'
import type { Deferred } from './deferred.ts'

export type Scripted<T> = T | TransportFailure | Deferred<T> | Deferred<T | TransportFailure>

export type Step =
  | Readonly<{ open: Scripted<'opened'> }>
  | Readonly<{ discover: Scripted<PeerIdentity> }>
  | Readonly<{ listActions: Scripted<ListingPage> }>
  | Readonly<{ listEventTypes: Scripted<EventListingPage> }>
  | Readonly<{ listSkills: Scripted<SkillListingPage> }>
  | Readonly<{ getSkill: Scripted<JsonValue> }>
  | Readonly<{ readResource: Scripted<ResourceContent> }>
  | Readonly<{ close: Deferred<'closed'> }>

export type Call =
  | Readonly<{ kind: 'open'; material: TransportMaterial }>
  | Readonly<{ kind: 'discover'; generation: Generation }>
  | Readonly<{ kind: 'listActions'; generation: Generation; cursor: string | undefined }>
  | Readonly<{ kind: 'listEventTypes'; generation: Generation; cursor: string | undefined }>
  | Readonly<{ kind: 'listSkills'; generation: Generation; cursor: string | undefined }>
  | Readonly<{ kind: 'getSkill' | 'readResource'; generation: Generation; uri: string }>
  | Readonly<{ kind: 'close'; generation: Generation }>

export type ScriptedTransports = McpTransportFactory &
  Readonly<{
    calls: readonly Call[]
    remaining: () => number
  }>

const FAILURE_KIND_TABLE = {
  'not-sent': true,
  'no-answer': true,
  'error-answer': true,
  'answer-malformed': true,
} satisfies Record<TransportFailure['kind'], true>
const FAILURE_KINDS: readonly string[] = Object.keys(FAILURE_KIND_TABLE)

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

type StepKind =
  | 'open'
  | 'discover'
  | 'listActions'
  | 'listEventTypes'
  | 'listSkills'
  | 'getSkill'
  | 'readResource'

function notScripted(method: string): never {
  throw new Error(`scripted transport: ${method} is not scripted in this wave`)
}

export function scriptedTransports(
  script: readonly Step[],
  trace: (event: string) => void = () => undefined,
): ScriptedTransports {
  const queue = [...script]
  const calls: Call[] = []
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
    async listEventTypes(cursor) {
      calls.push({ kind: 'listEventTypes', generation, cursor })
      const step = take('listEventTypes')
      return 'listEventTypes' in step
        ? outcomeOf(step.listEventTypes)
        : notScripted('listEventTypes')
    },
    async listSkills(cursor) {
      calls.push({ kind: 'listSkills', generation, cursor })
      const step = take('listSkills')
      return 'listSkills' in step ? outcomeOf(step.listSkills) : notScripted('listSkills')
    },
    async getSkill(uri) {
      calls.push({ kind: 'getSkill', generation, uri })
      const step = take('getSkill')
      return 'getSkill' in step ? outcomeOf(step.getSkill) : notScripted('getSkill')
    },
    async readResource(uri) {
      calls.push({ kind: 'readResource', generation, uri })
      const step = take('readResource')
      return 'readResource' in step ? outcomeOf(step.readResource) : notScripted('readResource')
    },
    call: () => notScripted('call'),
    cancelRequest: () => notScripted('cancelRequest'),
    getTask: () => notScripted('getTask'),
    updateTask: () => notScripted('updateTask'),
    getTaskResult: () => notScripted('getTaskResult'),
    cancelTask: () => notScripted('cancelTask'),
    async close() {
      calls.push({ kind: 'close', generation })
      const head = queue[0]
      if (head !== undefined && 'close' in head) {
        queue.shift()
        await head.close.promise
      }
      trace('transport.close')
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
