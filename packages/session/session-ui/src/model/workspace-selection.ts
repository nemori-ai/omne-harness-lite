import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { SessionProtocol } from '@omne-harness/session-protocol'
import { Cells, OfferedChoices, type ChoicesView, type Listing } from './offered-choices.ts'
import { notSent } from './session-driver.ts'

type Client = Pick<ClientOf<SessionProtocol>, 'read-workspace-selection' | 'select-workspace'>
type Answer<K extends keyof Client> =
  | Awaited<ReturnType<Client[K]>>
  | Readonly<{ outcome: 'unavailable' }>
type Read = Extract<Answer<'read-workspace-selection'>, { outcome: 'succeeded' }>['body']

export type WorkspaceTarget = Readonly<{ workspace: string; instance: string }>
/** One instance a session may stand at; the label is what a person reads for it. */
export type WorkspaceChoice = WorkspaceTarget &
  Readonly<{ label: string; selectable: boolean; note: string | null }>
export type WorkspaceChoiceListing = Listing<WorkspaceChoice>

/** What the session interface needs from whoever lists workspaces. It does not know who that is. */
export interface WorkspaceChoiceSource {
  list(tenant: string): Promise<WorkspaceChoiceListing>
}
/** Where the application assembly hands a list of workspaces to the session interface. */
export interface WorkspaceChoiceHolder {
  attach(source: WorkspaceChoiceSource): () => void
}

export type WorkspaceSelectionView =
  | Readonly<{ kind: 'unread' }>
  | (Readonly<{ kind: 'read' }> & Read)
  | Readonly<{ kind: 'unreadable'; reason: string }>

const UNREAD = { kind: 'unread' } as const

const REASONS: Readonly<Record<string, string>> = {
  'not-permitted': '没有在这个工作区里工作的权限',
  'instance-unavailable': '这个实例现在用不了',
}

export const reasonText = (reason: string): string => REASONS[reason] ?? reason

export function selectText(answer: Answer<'select-workspace'>): string {
  switch (answer.outcome) {
    case 'succeeded':
      return answer.body.directory === null
        ? '已不选工作区，回到默认的工作目录'
        : `已换到 ${answer.body.directory}`
    case 'invalid':
      return `没有换：${reasonText(answer.body.reason)}`
    case 'archived':
      return '没有换：会话已归档'
    case 'frozen':
      return '没有换：会话已冻结'
    case 'unknown':
      return '不知道换没换成，已重新读取'
    case 'unavailable':
      return '连不上服务，没有换'
    default:
      return `没有换成：${answer.outcome}`
  }
}

export const sameTarget = (a: WorkspaceTarget | null, b: WorkspaceTarget | null): boolean =>
  a === null || b === null ? a === b : a.workspace === b.workspace && a.instance === b.instance

// Session is the authority on where a session works, the attached source on what can be picked.
export class WorkspaceSelectionStore implements WorkspaceChoiceHolder {
  private readonly selections = new Cells<WorkspaceSelectionView>(UNREAD)
  private readonly offered = new OfferedChoices<WorkspaceChoice>()
  private readonly client: Client
  private readonly newId: () => string

  constructor(client: Client, newId: () => string = () => crypto.randomUUID()) {
    this.client = client
    this.newId = newId
  }

  read(tenant: string, session: string): WorkspaceSelectionView {
    return this.selections.read(keyOf(tenant, session))
  }

  subscribe(tenant: string, session: string, listener: () => void): () => void {
    return this.selections.subscribe(keyOf(tenant, session), listener)
  }

  async load(tenant: string, session: string): Promise<void> {
    const owner = readTenantText(tenant)
    const answer =
      owner === undefined
        ? ({ outcome: 'invalid' } as const)
        : await notSent(() => this.client['read-workspace-selection']({ tenant: owner, session }))
    this.selections.show(
      keyOf(tenant, session),
      answer.outcome === 'succeeded'
        ? { kind: 'read', ...answer.body }
        : { kind: 'unreadable', reason: answer.outcome },
    )
  }

  async select(
    tenant: string,
    session: string,
    workspace: WorkspaceTarget | null,
  ): Promise<string> {
    const owner = readTenantText(tenant)
    if (owner === undefined) return '没有送达：租户读不懂'
    const answer = await notSent(() =>
      this.client['select-workspace']({
        tenant: owner,
        session,
        controlId: this.newId(),
        workspace,
      }),
    )
    await this.load(tenant, session)
    return selectText(answer)
  }

  choices(tenant: string): ChoicesView<WorkspaceChoice> {
    return this.offered.choices(tenant)
  }

  subscribeChoices(tenant: string, listener: () => void): () => void {
    return this.offered.subscribe(tenant, listener)
  }

  loadChoices(tenant: string): Promise<void> {
    return this.offered.load(tenant)
  }

  attach(source: WorkspaceChoiceSource): () => void {
    return this.offered.attach(source)
  }
}

const keyOf = (tenant: string, session: string): string => JSON.stringify([tenant, session])
