import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { ToolProtocol } from '@omne-harness/tool-protocol'

type Client = Pick<ClientOf<ToolProtocol>, 'read-call-output'>

/** What a call has written so far as this view keeps it: the text read and where to read on. */
export type CallOutputView =
  | Readonly<{ kind: 'unread' }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'text'; text: string; sealed: boolean }>
  | Readonly<{ kind: 'unreadable'; reason: string }>

/** At most this much of the newest output stays on screen. */
export const KEPT_CHARS = 8000

type Entry = {
  view: CallOutputView
  after: string | null
  listeners: Set<() => void>
  timer: number | null
}

// Reads on from the last position while the view is shown; Tool is the authority, this is a tail.
export class CallOutputStore {
  private readonly entries = new Map<string, Entry>()
  private readonly client: Client
  private readonly every: number

  constructor(client: Client, every = 2000) {
    this.client = client
    this.every = every
  }

  read(tenant: string, reference: string): CallOutputView {
    return this.entries.get(`${tenant}\u0000${reference}`)?.view ?? { kind: 'unread' }
  }

  subscribe(tenant: string, reference: string, listener: () => void): () => void {
    const key = `${tenant}\u0000${reference}`
    const entry: Entry = this.entries.get(key) ?? {
      view: { kind: 'unread' },
      after: null,
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
    const answer = await Promise.resolve()
      .then(() => this.client['read-call-output']({ tenant: owner, reference, after: entry.after }))
      .catch(() => ({ outcome: 'unavailable' as const }))
    if (answer.outcome !== 'succeeded') entry.view = { kind: 'unreadable', reason: answer.outcome }
    else if (answer.body.kind === 'none') entry.view = { kind: 'none' }
    else {
      const before = entry.view.kind === 'text' ? entry.view.text : ''
      const text = `${before}${answer.body.text}`.slice(-KEPT_CHARS)
      entry.view = { kind: 'text', text, sealed: answer.body.kind === 'sealed' }
      entry.after = answer.body.through
    }
    for (const listener of entry.listeners) listener()
  }
}
