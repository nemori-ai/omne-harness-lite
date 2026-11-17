import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { SessionProtocol } from '@omne-harness/session-protocol'
import { notSent } from './session-driver.ts'

type Client = Pick<
  ClientOf<SessionProtocol>,
  'archive-session' | 'unarchive-session' | 'list-archived-sessions'
>
type Answer<K extends keyof Client> = Awaited<ReturnType<Client[K]>>
type Listed = Extract<Answer<'list-archived-sessions'>, { outcome: 'succeeded' }>['body']
export type ArchivedItem = Listed['sessions'][number]

/** The archived list as Session answered it last, for the title text it was asked with. */
export type ArchivedView =
  | Readonly<{ kind: 'unread' }>
  | Readonly<{ kind: 'listed'; title: string; page: Listed }>
  | Readonly<{ kind: 'unreadable'; title: string; reason: string }>

const BY: Readonly<Record<NonNullable<ArchivedItem['archivedBy']>, string>> = {
  person: '有人归档',
  auto: '闲置后自动归档',
  parent: '随上级会话归档',
}

export const archivedByText = (item: ArchivedItem): string =>
  item.archivedBy === null ? '归档方式不明' : BY[item.archivedBy]

// What was withdrawn is said as withdrawn: a call asked to stop is not one proven stopped (C28).
export function archiveText(answer: Answer<'archive-session'>): string {
  if (answer.outcome !== 'succeeded') return `归档没有完成：${answer.outcome}`
  if (answer.body.kind === 'already-archived') return '它已经归档了'
  const { runs, backgroundCalls } = answer.body
  const parts = [
    ...(runs === 0 ? [] : [`收起 ${runs} 轮`]),
    ...(backgroundCalls === 0 ? [] : [`撤回 ${backgroundCalls} 项后台调用`]),
  ]
  return parts.length === 0 ? '已归档' : `已归档；${parts.join('，')}`
}

export function unarchiveText(answer: Answer<'unarchive-session'>): string {
  if (answer.outcome !== 'succeeded') return `撤销归档没有完成：${answer.outcome}`
  return answer.body.kind === 'unarchived' ? '已撤销归档' : '它没有归档'
}

type Entry = { view: ArchivedView; listeners: Set<() => void> }

// Session is the authority: the store reads the archived list again after every change it asks.
export class ArchiveStore {
  private readonly entries = new Map<string, Entry>()
  private readonly client: Client

  constructor(client: Client) {
    this.client = client
  }

  read(tenant: string): ArchivedView {
    return this.entries.get(tenant)?.view ?? { kind: 'unread' }
  }

  subscribe(tenant: string, listener: () => void): () => void {
    const entry = this.entries.get(tenant) ?? { view: { kind: 'unread' }, listeners: new Set() }
    this.entries.set(tenant, entry)
    entry.listeners.add(listener)
    return () => entry.listeners.delete(listener)
  }

  async load(tenant: string, title: string, more = false): Promise<void> {
    const owner = readTenantText(tenant)
    const shown = this.read(tenant)
    const cursor = more && shown.kind === 'listed' ? shown.page.next : null
    const titleContains = title.trim() === '' ? null : title.trim()
    const answer =
      owner === undefined
        ? ({ outcome: 'invalid' } as const)
        : await notSent(() =>
            this.client['list-archived-sessions']({ tenant: owner, cursor, titleContains }),
          )
    const view: ArchivedView =
      answer.outcome !== 'succeeded'
        ? { kind: 'unreadable', title, reason: answer.outcome }
        : cursor !== null && shown.kind === 'listed'
          ? {
              kind: 'listed',
              title,
              page: { ...answer.body, sessions: [...shown.page.sessions, ...answer.body.sessions] },
            }
          : { kind: 'listed', title, page: answer.body }
    const entry = this.entries.get(tenant)
    if (entry === undefined) return
    entry.view = view
    for (const listener of entry.listeners) listener()
  }

  async archive(tenant: string, session: string): Promise<string> {
    const owner = readTenantText(tenant)
    if (owner === undefined) return '归档没有送达：租户读不懂'
    const controlId = crypto.randomUUID()
    const answer = await notSent(() =>
      this.client['archive-session']({ tenant: owner, session, controlId }),
    )
    await this.reload(tenant)
    return archiveText(answer)
  }

  async unarchive(tenant: string, session: string): Promise<string> {
    const owner = readTenantText(tenant)
    if (owner === undefined) return '撤销归档没有送达：租户读不懂'
    const controlId = crypto.randomUUID()
    const answer = await notSent(() =>
      this.client['unarchive-session']({ tenant: owner, session, controlId }),
    )
    await this.reload(tenant)
    return unarchiveText(answer)
  }

  private async reload(tenant: string): Promise<void> {
    const shown = this.read(tenant)
    if (shown.kind !== 'unread') await this.load(tenant, shown.title)
  }
}
