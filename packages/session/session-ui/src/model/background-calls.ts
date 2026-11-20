import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { SessionProtocol } from '@omne-harness/session-protocol'
import { notSent } from './session-driver.ts'

type Client = Pick<ClientOf<SessionProtocol>, 'list-background-calls' | 'stop-call'>
type Listed = Extract<
  Awaited<ReturnType<Client['list-background-calls']>>,
  { outcome: 'succeeded' }
>['body']['calls'][number]
export type BackgroundCallItem = Listed

/** What the pane shows: the list as Session answered it last, or why it could not be read. */
export type BackgroundCallsView =
  | Readonly<{ kind: 'unread' }>
  | Readonly<{ kind: 'listed'; calls: readonly BackgroundCallItem[] }>
  | Readonly<{ kind: 'unreadable'; reason: string }>

/** Calls of the session are in the background, as the list was last read. */
export const hasCalls = (view: BackgroundCallsView): boolean =>
  view.kind === 'listed' && view.calls.length > 0

const STATUS: Readonly<Record<BackgroundCallItem['status'], string>> = {
  queued: '排队中',
  running: '在跑',
  'ended-pending': '已结束，结局在路上',
  stopping: '停止中',
  unknown: '状态未知',
}
const WHO: Readonly<Record<string, string>> = { user: '你', agent: 'agent', system: '系统' }

export const statusText = (call: BackgroundCallItem): string => STATUS[call.status]

// The three steps of a stop stay apart: asked, taken by Tool, proven by Tool (I-3).
export function stopText(call: BackgroundCallItem): string | null {
  const { stop } = call
  if (stop === null) return null
  const why = stop.reason === null ? '' : `：${stop.reason}`
  const who = WHO[stop.initiator] ?? stop.initiator
  if (stop.progress === 'requested') return `${who}已请求停止${why}`
  return stop.progress === 'accepted' ? `停止已受理${why}` : `已证实停下${why}`
}

export function actionText(call: BackgroundCallItem): string {
  const { tool, command, preview } = call.label
  return `${tool}${command === null ? '' : ` ${command}`}${preview === '' ? '' : ` · ${preview}`}`
}

type Entry = { view: BackgroundCallsView; listeners: Set<() => void>; timer: number | null }

// One poll per session while anything shows it; Session is the authority, this keeps a projection.
export class BackgroundCallsStore {
  private readonly entries = new Map<string, Entry>()
  private readonly client: Client
  private readonly every: number

  constructor(client: Client, every = 2000) {
    this.client = client
    this.every = every
  }

  read(tenant: string, session: string): BackgroundCallsView {
    return this.entries.get(`${tenant}\u0000${session}`)?.view ?? { kind: 'unread' }
  }

  subscribe(tenant: string, session: string, listener: () => void): () => void {
    const key = `${tenant}\u0000${session}`
    const entry = this.entries.get(key) ?? {
      view: { kind: 'unread' },
      listeners: new Set(),
      timer: null,
    }
    this.entries.set(key, entry)
    entry.listeners.add(listener)
    if (entry.timer === null) {
      void this.refresh(tenant, session)
      entry.timer = window.setInterval(() => void this.refresh(tenant, session), this.every)
    }
    return () => {
      entry.listeners.delete(listener)
      if (entry.listeners.size > 0 || entry.timer === null) return
      window.clearInterval(entry.timer)
      this.entries.delete(key)
    }
  }

  async refresh(tenant: string, session: string): Promise<void> {
    const owner = readTenantText(tenant)
    const answer =
      owner === undefined
        ? ({ outcome: 'invalid' } as const)
        : await notSent(() => this.client['list-background-calls']({ tenant: owner, session }))
    const entry = this.entries.get(`${tenant}\u0000${session}`)
    if (entry === undefined) return
    entry.view =
      answer.outcome === 'succeeded'
        ? { kind: 'listed', calls: answer.body.calls }
        : { kind: 'unreadable', reason: answer.outcome }
    for (const listener of entry.listeners) listener()
  }

  async stop(tenant: string, session: string, call: BackgroundCallItem): Promise<string> {
    const owner = readTenantText(tenant)
    if (owner === undefined) return '停止没有送达：租户读不懂'
    const answer = await notSent(() =>
      this.client['stop-call']({
        tenant: owner,
        session,
        controlId: crypto.randomUUID(),
        producer: call.producer,
      }),
    )
    await this.refresh(tenant, session)
    return answer.outcome === 'succeeded' ? '已请求停止' : `停止没有送达：${answer.outcome}`
  }
}
