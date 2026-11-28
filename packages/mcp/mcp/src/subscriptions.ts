import { fail, succeed } from '@omne-harness/operation-result'
import type {
  EventSubscriptions,
  EventType,
  McpClock,
  McpConfig,
  McpPorts,
  SubscriptionView,
} from '@omne-harness/mcp-contract'
import type { SubscriptionKey, SubscriptionRow } from '@omne-harness/mcp-contract/provider'
import type { EventTypes } from './event-types.ts'
import type { ChangeFeed } from './internal/changes.ts'
import type { Pause } from './internal/follow.ts'
import { createSubscriptionLinks, UNKNOWN, type Prepared } from './internal/links.ts'
import { ask } from './internal/port.ts'
import type { ConnectionTable } from './internal/table.ts'
import type { TaskTimer } from './watch.ts'

export type SubscriptionsDependencies<P, S> = Readonly<{
  ports: McpPorts<P, S>
  config: McpConfig<P>
  table: ConnectionTable<P>
  clock: McpClock
  changes: ChangeFeed
  eventTypes: EventTypes<P>
  pause: Pause
  timer: TaskTimer
}>

export type ClosableSubscriptions<P> = EventSubscriptions<P> & Readonly<{ close(): void }>

const RETRIES = 3

const viewOf = (key: SubscriptionKey, row: SubscriptionRow): SubscriptionView => ({
  name: key.name,
  arguments: row.arguments,
  delivery: row.delivery,
  state: row.state,
  reason: row.reason,
  subscribers: row.subscribers.length,
})

const deliveryOf = (type: EventType): 'push' | 'poll' | undefined =>
  type.delivery.includes('push') ? 'push' : type.delivery.includes('poll') ? 'poll' : undefined

/** The subscriptions of omne to the events of endpoints: made on the first subscriber, removed with the last, received while they stand. */
export function createEventSubscriptions<P, S>(
  deps: SubscriptionsDependencies<P, S>,
): ClosableSubscriptions<P> {
  const { changes } = deps
  const { prepare, keyOf, typeFor, resume, stopReceiving, close } = createSubscriptionLinks(deps)

  const read = (prepared: Prepared<P>, key: SubscriptionKey) =>
    ask(() => prepared.records.read(key), fail('unavailable' as const))

  const write = (
    prepared: Prepared<P>,
    key: SubscriptionKey,
    row: SubscriptionRow,
    expected: number | 'absent',
  ) => ask(() => prepared.records.write(key, row, expected), fail('unavailable' as const))

  return {
    async subscribe(access, ref, request) {
      const opened = await prepare(access, ref, request.connectBound)
      if ('failure' in opened) return opened
      const { prepared, admitted } = opened.ok
      const type = await typeFor(prepared, admitted, request.name)
      if ('failure' in type) return type
      const delivery = deliveryOf(type.ok)
      if (delivery === undefined) return fail({ kind: 'not-subscribable', reason: 'webhook-only' })
      const key = keyOf(prepared, request.name, request.arguments)
      for (let tries = 0; tries < RETRIES; tries += 1) {
        const current = await read(prepared, key)
        if ('failure' in current) return fail(UNKNOWN)
        const existing = current.ok === 'absent' ? undefined : current.ok
        if (existing?.subscribers.includes(request.subscriber) === true) {
          resume(prepared, ref, key, false)
          return succeed(viewOf(key, existing))
        }
        const row: SubscriptionRow = existing
          ? {
              ...existing,
              subscribers: [...existing.subscribers, request.subscriber],
              revision: existing.revision + 1,
            }
          : {
              endpoint: ref.name,
              delivery,
              arguments: request.arguments,
              cursor: null,
              state: 'receiving',
              reason: null,
              subscribers: [request.subscriber],
              revision: 1,
            }
        const written = await write(prepared, key, row, existing?.revision ?? 'absent')
        if ('failure' in written && written.failure === 'unavailable') return fail(UNKNOWN)
        if ('failure' in written) continue
        resume(prepared, ref, key, existing === undefined)
        changes.changed(access.tenant, 'events')
        return succeed(viewOf(key, row))
      }
      return fail(UNKNOWN)
    },

    async unsubscribe(access, ref, request) {
      const opened = await prepare(access, ref)
      if ('failure' in opened) return opened
      const { prepared } = opened.ok
      const key = keyOf(prepared, request.name, request.arguments)
      for (let tries = 0; tries < RETRIES; tries += 1) {
        const current = await read(prepared, key)
        if ('failure' in current) return fail(UNKNOWN)
        if (current.ok === 'absent' || !current.ok.subscribers.includes(request.subscriber))
          return succeed('not-subscribed')
        const row = current.ok
        const subscribers = row.subscribers.filter(each => each !== request.subscriber)
        if (subscribers.length === 0) {
          stopReceiving(key)
          const removed = await ask(
            () => prepared.records.remove(key),
            fail('unavailable' as const),
          )
          if ('failure' in removed) return fail(UNKNOWN)
          changes.changed(access.tenant, 'events')
          return succeed('unsubscribed')
        }
        const next = { ...row, subscribers, revision: row.revision + 1 }
        const written = await write(prepared, key, next, row.revision)
        if ('failure' in written && written.failure === 'unavailable') return fail(UNKNOWN)
        if ('failure' in written) continue
        changes.changed(access.tenant, 'events')
        return succeed('unsubscribed')
      }
      return fail(UNKNOWN)
    },

    async list(access, ref) {
      const opened = await prepare(access, ref)
      if ('failure' in opened) return opened
      const { prepared } = opened.ok
      const listed = await ask(
        () => prepared.records.list(access.tenant),
        fail('unavailable' as const),
      )
      if ('failure' in listed) return fail(UNKNOWN)
      const account = JSON.stringify(prepared.account)
      const mine = listed.ok.filter(
        ({ key }) => key.holding === prepared.holding && JSON.stringify(key.account) === account,
      )
      for (const { key, row } of mine)
        if (row.state !== 'terminated') resume(prepared, ref, key, false)
      return succeed(mine.map(({ key, row }) => viewOf(key, row)))
    },

    async read(access, ref, request) {
      const opened = await prepare(access, ref, request.connectBound)
      if ('failure' in opened) return opened
      const { prepared } = opened.ok
      const key = keyOf(prepared, request.name, request.arguments)
      const current = await read(prepared, key)
      if ('failure' in current) return fail(UNKNOWN)
      if (current.ok === 'absent') return fail({ kind: 'not-subscribed' })
      if (current.ok.state !== 'terminated') resume(prepared, ref, key, false)
      const items = await ask(
        () => prepared.records.occurrences(key, request.after, request.limit),
        fail('unavailable' as const),
      )
      if ('failure' in items) return fail(UNKNOWN)
      return succeed({ subscription: viewOf(key, current.ok), items: items.ok })
    },

    close,
  }
}
