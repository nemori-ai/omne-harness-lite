import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { SessionProtocol } from '@omne-harness/session-protocol'
import { notSent } from './session-driver.ts'

type Client = Pick<ClientOf<SessionProtocol>, 'read-permission-mode' | 'change-permission-mode'>
type Answer<K extends keyof Client> = Awaited<ReturnType<Client[K]>>
export type PermissionMode = Extract<
  Answer<'read-permission-mode'>,
  { outcome: 'succeeded' }
>['body']['mode']

/** The permission mode of one session as Session answered it last. */
export type ModeView =
  | Readonly<{ kind: 'unread' }>
  | Readonly<{ kind: 'read'; mode: PermissionMode; revision: string }>
  | Readonly<{ kind: 'unreadable'; reason: string }>

export const MODE_LABELS: Readonly<Record<PermissionMode, string>> = {
  never: '需要时拒绝',
  auto_permission: '需要时问我',
  'bypass-permissions': '跳过询问',
}

// A change not known to have landed is said as not known; the mode shown is read again (C2).
export function changeText(answer: Answer<'change-permission-mode'>): string {
  switch (answer.outcome) {
    case 'succeeded':
      return `已改为「${MODE_LABELS[answer.body.mode]}」`
    case 'no-change':
      return `本来就是「${MODE_LABELS[answer.body.mode]}」`
    case 'conflict':
      return '模式刚被改过，已重新读取，请再选一次'
    case 'unknown':
      return '不知道改没改成，已重新读取'
    default:
      return `没有改成：${answer.outcome}`
  }
}

type Entry = { view: ModeView; listeners: Set<() => void> }

// Session is the authority: the store reads the mode again after every change it asks.
export class PermissionModeStore {
  private readonly entries = new Map<string, Entry>()
  private readonly client: Client

  constructor(client: Client) {
    this.client = client
  }

  read(tenant: string, session: string): ModeView {
    return this.entries.get(keyOf(tenant, session))?.view ?? { kind: 'unread' }
  }

  subscribe(tenant: string, session: string, listener: () => void): () => void {
    const key = keyOf(tenant, session)
    const entry = this.entries.get(key) ?? { view: { kind: 'unread' }, listeners: new Set() }
    this.entries.set(key, entry)
    entry.listeners.add(listener)
    return () => entry.listeners.delete(listener)
  }

  async load(tenant: string, session: string): Promise<void> {
    const owner = readTenantText(tenant)
    const answer =
      owner === undefined
        ? ({ outcome: 'invalid' } as const)
        : await notSent(() => this.client['read-permission-mode']({ tenant: owner, session }))
    this.show(
      tenant,
      session,
      answer.outcome === 'succeeded'
        ? { kind: 'read', ...answer.body }
        : { kind: 'unreadable', reason: answer.outcome },
    )
  }

  async change(tenant: string, session: string, mode: PermissionMode): Promise<string> {
    const owner = readTenantText(tenant)
    const shown = this.read(tenant, session)
    if (owner === undefined) return '没有送达：租户读不懂'
    if (shown.kind !== 'read') return '当前模式还没读到，没有改'
    const answer = await notSent(() =>
      this.client['change-permission-mode']({
        tenant: owner,
        session,
        mode,
        expectedRevision: shown.revision,
      }),
    )
    await this.load(tenant, session)
    return changeText(answer)
  }

  private show(tenant: string, session: string, view: ModeView): void {
    const entry = this.entries.get(keyOf(tenant, session))
    if (entry === undefined) return
    entry.view = view
    for (const listener of entry.listeners) listener()
  }
}

const keyOf = (tenant: string, session: string): string => JSON.stringify([tenant, session])
