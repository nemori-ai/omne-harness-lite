import type { TenantId } from '@omne-harness/legal-identity'
import type { EndpointHolding } from '@omne-harness/mcp-contract'
import type {
  EventRecords,
  GapReason,
  Occurrence,
  StoredOccurrence,
  SubscriptionKey,
  SubscriptionRow,
} from '@omne-harness/mcp-contract/provider'
import { fail, succeed } from '@omne-harness/operation-result'
import type { SubscriptionCells } from './rows-subscriptions.ts'
import { committer, reader, tenantText, type McpSqlOptions } from './store.ts'

const accountText = (key: SubscriptionKey) =>
  key.account.kind === 'anonymous' ? 'anonymous' : `credential:${key.account.binding}`

const cellsOf = (key: SubscriptionKey): SubscriptionCells => ({
  tenant: tenantText(key),
  subKey: JSON.stringify([key.holding, accountText(key), key.name, key.arguments]),
})

function keyOf(tenant: TenantId, subKey: string): SubscriptionKey | undefined {
  const parsed: unknown = JSON.parse(subKey)
  if (!Array.isArray(parsed) || parsed.length !== 4) return undefined
  const [holding, account, name, args] = parsed as unknown[]
  if (typeof holding !== 'string' || typeof name !== 'string' || typeof args !== 'string')
    return undefined
  const binding =
    typeof account === 'string' && account.startsWith('credential:') ? account.slice(11) : null
  return {
    tenant,
    holding: holding as EndpointHolding,
    account: binding === null ? { kind: 'anonymous' } : ({ kind: 'credential', binding } as never),
    name,
    arguments: args,
  }
}

type StoredRow = Readonly<{ revision: number; cursor: string | null; row: SubscriptionRow }>

const rowOf = (stored: StoredRow): SubscriptionRow => ({
  ...stored.row,
  revision: stored.revision,
  cursor: stored.cursor,
})

function occurrenceOf(
  item: Readonly<{ seq: number; kind: string; receivedAt: string; row: unknown }>,
): StoredOccurrence {
  if (item.kind === 'gap')
    return {
      seq: item.seq,
      kind: 'gap',
      receivedAt: item.receivedAt,
      reason: (item.row as { reason: GapReason }).reason,
    }
  return { seq: item.seq, kind: 'event', receivedAt: item.receivedAt, ...(item.row as Occurrence) }
}

/** The subscriptions and the events they took in, over SQL in each tenant's domain; a batch whose commit is not known is unknown. */
export function createSqlEventRecords(options: McpSqlOptions): EventRecords {
  const commit = committer(options)
  const readOf = reader(options)
  const answered = (done: Awaited<ReturnType<typeof commit>>) =>
    done !== null && done.kind === 'answer'
      ? (done.response as { ok?: unknown; failure?: unknown })
      : null
  return {
    async list(tenant) {
      try {
        const text = tenantText({ tenant })
        const found = await readOf(text, 'listSubscriptions', { tenant: text })
        if (found === null) return fail('unavailable')
        const items = found.ok as readonly (StoredRow & { subKey: string })[]
        return succeed(
          items.flatMap(item => {
            const key = keyOf(tenant, item.subKey)
            return key === undefined ? [] : [{ key, row: rowOf(item) }]
          }),
        )
      } catch {
        return fail('unavailable')
      }
    },
    async read(key) {
      try {
        const cells = cellsOf(key)
        const found = await readOf(cells.tenant, 'readSubscription', { key: cells })
        if (found === null) return fail('unavailable')
        return found.ok === 'absent' ? succeed('absent') : succeed(rowOf(found.ok as StoredRow))
      } catch {
        return fail('unavailable')
      }
    },
    async write(key, row, expected) {
      try {
        const cells = cellsOf(key)
        const { revision, cursor, ...rest } = row
        const done = await commit(cells.tenant, 'writeSubscription', {
          cells,
          revision,
          cursor,
          row: rest,
          expected,
        })
        const answer = answered(done)
        if (answer === null) return fail('unavailable')
        return answer.ok === 'written' ? succeed('written') : fail('conflict')
      } catch {
        return fail('unavailable')
      }
    },
    async remove(key) {
      try {
        const cells = cellsOf(key)
        return answered(await commit(cells.tenant, 'removeSubscription', { cells })) === null
          ? fail('unavailable')
          : succeed(true)
      } catch {
        return fail('unavailable')
      }
    },
    async receive(key, batch, bounds) {
      try {
        const cells = cellsOf(key)
        const floor = new Date(Date.parse(batch.at) - bounds.maxAgeMs).toISOString()
        const events = batch.events.map(event => ({ eventId: event.eventId, row: event }))
        const command = {
          cells,
          batch: {
            events,
            cursor: batch.cursor,
            gap: batch.gap,
            at: batch.at,
            floor,
            maxEvents: bounds.maxEvents,
          },
        }
        const done = await commit(cells.tenant, 'receiveEvents', command)
        if (done === null) return fail('unavailable')
        if (done.kind === 'unknown') return fail('unknown')
        const stored = (done.response as { ok?: unknown }).ok
        return stored === 'absent' ? succeed('absent') : succeed({ stored: Number(stored) })
      } catch {
        return fail('unavailable')
      }
    },
    async occurrences(key, after, limit) {
      try {
        const cells = cellsOf(key)
        const found = await readOf(cells.tenant, 'readOccurrences', { key: cells, after, limit })
        if (found === null) return fail('unavailable')
        return succeed(
          (
            found.ok as readonly Readonly<{
              seq: number
              kind: string
              receivedAt: string
              row: unknown
            }>[]
          ).map(occurrenceOf),
        )
      } catch {
        return fail('unavailable')
      }
    },
  }
}
