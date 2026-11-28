import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { ToolCallChild, ToolProtocol } from '@omne-harness/tool-protocol'

type Client = Pick<ClientOf<ToolProtocol>, 'list-call-children'>

/** The positions under a call as this view keeps them: the last table read, or why none was. */
export type CallChildrenView =
  | Readonly<{ kind: 'unread' }>
  | Readonly<{ kind: 'listed'; items: readonly ToolCallChild[] }>
  | Readonly<{ kind: 'unreadable'; reason: string }>

/** A table longer than this many pages is shown up to here. */
const MAX_PAGES = 20

type Entry = { view: CallChildrenView; listeners: Set<() => void>; timer: number | null }

// Reads the whole table again while the view is shown; a read that fails keeps the table read before.
export class CallChildrenStore {
  private readonly entries = new Map<string, Entry>()
  private readonly client: Client
  private readonly every: number

  constructor(client: Client, every = 2000) {
    this.client = client
    this.every = every
  }

  read(tenant: string, reference: string): CallChildrenView {
    return this.entries.get(`${tenant}\u0000${reference}`)?.view ?? { kind: 'unread' }
  }

  subscribe(tenant: string, reference: string, listener: () => void): () => void {
    const key = `${tenant}\u0000${reference}`
    const entry: Entry = this.entries.get(key) ?? {
      view: { kind: 'unread' },
      listeners: new Set(),
      timer: null,
    }
    this.entries.set(key, entry)
    entry.listeners.add(listener)
    if (entry.timer === null) {
      void this.refresh(tenant, reference)
      entry.timer = window.setInterval(() => void this.refresh(tenant, reference), this.every)
    }
    return () => {
      entry.listeners.delete(listener)
      if (entry.listeners.size > 0 || entry.timer === null) return
      window.clearInterval(entry.timer)
      this.entries.delete(key)
    }
  }

  async refresh(tenant: string, reference: string): Promise<void> {
    const entry = this.entries.get(`${tenant}\u0000${reference}`)
    const owner = readTenantText(tenant)
    if (entry === undefined || owner === undefined) return
    const items: ToolCallChild[] = []
    let cursor: string | null = null
    let failed: string | null = null
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const answer = await Promise.resolve()
        .then(() => this.client['list-call-children']({ tenant: owner, reference, cursor }))
        .catch(() => ({ outcome: 'unavailable' as const }))
      if (answer.outcome !== 'succeeded') {
        failed = answer.outcome
        break
      }
      items.push(...answer.body.items)
      cursor = answer.body.next
      if (cursor === null) break
    }
    if (failed === null) entry.view = { kind: 'listed', items }
    else if (entry.view.kind !== 'listed') entry.view = { kind: 'unreadable', reason: failed }
    for (const listener of entry.listeners) listener()
  }
}
