import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { SessionProtocol } from '@omne-harness/session-protocol'
import { notSent } from './session-driver.ts'

type Client = Pick<ClientOf<SessionProtocol>, 'read-pending' | 'read-waiting-calls'>
type Succeeded<K extends keyof Client> = Extract<
  Awaited<ReturnType<Client[K]>>,
  { outcome: 'succeeded' }
>['body']
export type QueuedInput = Succeeded<'read-pending'>['inputs'][number]
export type WaitingCallItem = Succeeded<'read-waiting-calls'>['calls'][number]

/** What Session answered last, or why it could not be read. Unreadable is never shown as none. */
export type WorkRead<T> =
  | Readonly<{ kind: 'unread' }>
  | Readonly<{ kind: 'read'; value: T }>
  | Readonly<{ kind: 'unreadable'; outcome: string }>

export type SessionWork = Readonly<{
  pending: WorkRead<Readonly<{ inputs: readonly QueuedInput[]; more: boolean }>>
  calls: WorkRead<readonly WaitingCallItem[]>
}>

export const UNREAD_WORK: SessionWork = { pending: { kind: 'unread' }, calls: { kind: 'unread' } }

const PAGE_LIMIT = 20

type Entry = { work: SessionWork; issued: number; listeners: Set<() => void> }

const keyOf = (tenant: string, session: string): string => `${tenant}\u0000${session}`

// Session is the authority: this keeps what its two reads answered, and the newest read wins.
export class SessionWorkStore {
  private readonly entries = new Map<string, Entry>()
  private readonly client: Client

  constructor(client: Client) {
    this.client = client
  }

  read(tenant: string, session: string): SessionWork {
    return this.entries.get(keyOf(tenant, session))?.work ?? UNREAD_WORK
  }

  subscribe(tenant: string, session: string, listener: () => void): () => void {
    const key = keyOf(tenant, session)
    const entry = this.entries.get(key) ?? { work: UNREAD_WORK, issued: 0, listeners: new Set() }
    this.entries.set(key, entry)
    entry.listeners.add(listener)
    return () => {
      entry.listeners.delete(listener)
      if (entry.listeners.size === 0) this.entries.delete(key)
    }
  }

  async refresh(tenant: string, session: string): Promise<void> {
    const entry = this.entries.get(keyOf(tenant, session))
    const owner = readTenantText(tenant)
    if (entry === undefined || owner === undefined) return
    entry.issued += 1
    const token = entry.issued
    const target = { tenant: owner, session }
    const [pending, calls] = await Promise.all([
      notSent(() => this.client['read-pending']({ ...target, after: null, limit: PAGE_LIMIT })),
      notSent(() => this.client['read-waiting-calls'](target)),
    ])
    if (entry.issued !== token || this.entries.get(keyOf(tenant, session)) !== entry) return
    entry.work = {
      pending:
        pending.outcome === 'succeeded'
          ? {
              kind: 'read',
              value: { inputs: pending.body.inputs, more: pending.body.next !== null },
            }
          : { kind: 'unreadable', outcome: pending.outcome },
      calls:
        calls.outcome === 'succeeded'
          ? { kind: 'read', value: calls.body.calls }
          : { kind: 'unreadable', outcome: calls.outcome },
    }
    for (const listener of entry.listeners) listener()
  }
}
