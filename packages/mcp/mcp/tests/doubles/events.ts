import type { JsonValue } from '@omne-harness/json-text'
import type { EventCatalogRecord, EventsConfig } from '@omne-harness/mcp-contract'
import type {
  EventPollAnswer,
  EventRequest,
  EventStreamMessage,
  ListenEnd,
  TransportFailure,
} from '@omne-harness/mcp-contract/provider'
import {
  createMemoryCatalogStore,
  createMemoryEventRecords,
  endpointRefOf,
  jsonOf,
  peerIdentityOf,
  type MemoryEventRecords,
} from '@omne-harness/mcp-contract/testing'
import type { Outcome } from '@omne-harness/operation-result'
import { assemble } from '../../src/internal/assembly.ts'
import type { Step } from './scripted-transport.ts'
import { reshapedTransports } from './transports.ts'
import { adoptHttp, world, type Settings } from './world.ts'

export const desk = endpointRefOf('desk')

export const EVENTS: EventsConfig = {
  maxEvents: 100,
  maxAgeMs: 86_400_000,
  pollFloorMs: 500,
  backoffCapMs: 4000,
}

export const offering = {
  ...peerIdentityOf(),
  capabilities: jsonOf({ tools: {}, extensions: { 'io.modelcontextprotocol/events': {} } }),
}

export const typeOf = (
  name: string,
  delivery: readonly string[] = ['poll', 'push'],
  inputSchema: unknown = { type: 'object' },
) => jsonOf({ name, description: `${name} happened`, delivery, inputSchema, payloadSchema: {} })

export const eventOf = (eventId: string, name = 'incident.created'): JsonValue =>
  jsonOf({ eventId, name, timestamp: '2026-11-27T22:00:00Z', data: { id: eventId } })

export type Stream = Readonly<{
  request: EventRequest
  signal: AbortSignal
  send(message: EventStreamMessage): void
  end(end: ListenEnd): void
}>

export type Wait = Readonly<{ ms: number; signal: AbortSignal; fire(): void }>

type Poll = Outcome<EventPollAnswer, TransportFailure>

export const settle = () => new Promise(resolve => setTimeout(resolve, 5))

/** A peer whose event requests the test answers: each stream waits for the test, each poll takes the next answer given. */
export function eventWorld(
  options: Readonly<{
    script: readonly Step[]
    records?: MemoryEventRecords
    eventStore?: ReturnType<typeof createMemoryCatalogStore<EventCatalogRecord>>
    settings?: Settings
  }>,
) {
  const w = world({ script: options.script, config: { events: EVENTS } })
  const eventStore = options.eventStore ?? createMemoryCatalogStore<EventCatalogRecord>()
  const records = options.records ?? createMemoryEventRecords()
  const streams: Stream[] = []
  const polls: EventRequest[] = []
  const answers: Poll[] = []
  const pending: ((answer: Poll) => void)[] = []
  const waits: Wait[] = []
  const pauses: number[] = []
  const transports = reshapedTransports(w.ports.transports, () => ({
    pollEvents(request) {
      polls.push(request)
      const next = answers.shift()
      return next === undefined
        ? new Promise<Poll>(resolve => pending.push(resolve))
        : Promise.resolve(next)
    },
    streamEvents(request, signal, observe) {
      return new Promise<ListenEnd>(end => {
        streams.push({ request, signal, send: observe, end })
        signal.addEventListener('abort', () => end({ kind: 'stopped' }), { once: true })
      })
    },
  }))
  adoptHttp(w, desk, {
    auth: 'none',
    ...(options.settings === undefined ? {} : { settings: options.settings }),
  })
  const { services } = assemble(
    { ...w.ports, eventStore, eventRecords: records, transports },
    w.config,
    undefined,
    async ms => {
      pauses.push(ms)
      await new Promise(resolve => setTimeout(resolve, 1))
    },
    (ms, signal) =>
      new Promise<void>(resolve => {
        waits.push({ ms, signal, fire: resolve })
        signal.addEventListener('abort', () => resolve(), { once: true })
      }),
  )
  const answer = (poll: Poll): void => {
    const waiting = pending.shift()
    if (waiting === undefined) answers.push(poll)
    else waiting(poll)
  }
  return { w, services, records, eventStore, streams, polls, answer, waits, pauses }
}
