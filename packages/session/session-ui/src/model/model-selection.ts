import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { SessionProtocol } from '@omne-harness/session-protocol'
import { notSent } from './session-driver.ts'

type Client = Pick<ClientOf<SessionProtocol>, 'read-model-selection' | 'select-model'>
type Answer<K extends keyof Client> =
  | Awaited<ReturnType<Client[K]>>
  | Readonly<{ outcome: 'unavailable' }>
type Refusal = Extract<Answer<'select-model'>, { outcome: 'invalid' }>['body']['reason']

export type ModelChoice = Readonly<{ route: string; selectable: boolean; note: string | null }>
export type ModelChoiceListing =
  | Readonly<{ kind: 'listed'; choices: readonly ModelChoice[] }>
  | Readonly<{ kind: 'unavailable'; reason: string }>

/** What the session interface needs from whoever lists models. It does not know who that is. */
export interface ModelChoiceSource {
  list(tenant: string): Promise<ModelChoiceListing>
}
/** Where the application assembly hands a list of models to the session interface. */
export interface ModelChoiceHolder {
  attach(source: ModelChoiceSource): () => void
}

export type SelectionView =
  | Readonly<{ kind: 'unread' }>
  | Readonly<{ kind: 'read'; model: string; revision: string }>
  | Readonly<{ kind: 'unreadable'; reason: string }>

/** The models of a tenant: `absent` while nobody lists them. */
export type ChoicesView =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'unread' }>
  | ModelChoiceListing

const UNREAD = { kind: 'unread' } as const
const ABSENT = { kind: 'absent' } as const

const REFUSALS: Readonly<Record<Refusal, string>> = {
  'unknown-name': '没有这个模型',
  withdrawn: '这个模型已撤下',
  excluded: '这个模型被排除了',
  modality: '这个模型不支持文字',
  locked: '这个模型被锁定',
  scope: '这个模型不在这个租户能用的范围里',
}

export function selectText(answer: Answer<'select-model'>): string {
  switch (answer.outcome) {
    case 'succeeded':
      return answer.body.credential === 'missing'
        ? `已换成 ${answer.body.model}；它还没有配置凭据，暂时调不了`
        : `已换成 ${answer.body.model}`
    case 'invalid':
      return `没有换：${REFUSALS[answer.body.reason]}`
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

class Cells<V> {
  private readonly entries = new Map<string, { value: V; listeners: Set<() => void> }>()
  private readonly initial: V

  constructor(initial: V) {
    this.initial = initial
  }

  read(key: string): V {
    return this.entries.get(key)?.value ?? this.initial
  }

  subscribe(key: string, listener: () => void): () => void {
    const entry = this.entryOf(key)
    entry.listeners.add(listener)
    return () => entry.listeners.delete(listener)
  }

  show(key: string, value: V): void {
    const entry = this.entryOf(key)
    entry.value = value
    for (const listener of entry.listeners) listener()
  }

  keys(): readonly string[] {
    return [...this.entries.keys()]
  }

  private entryOf(key: string) {
    const entry = this.entries.get(key) ?? { value: this.initial, listeners: new Set() }
    this.entries.set(key, entry)
    return entry
  }
}

// Session is the authority on a session's model, the attached source on what can be picked.
export class ModelSelectionStore implements ModelChoiceHolder {
  private readonly selections = new Cells<SelectionView>(UNREAD)
  private readonly lists = new Cells<Exclude<ChoicesView, { kind: 'absent' }>>(UNREAD)
  private source: ModelChoiceSource | null = null
  private readonly client: Client
  private readonly newId: () => string

  constructor(client: Client, newId: () => string = () => crypto.randomUUID()) {
    this.client = client
    this.newId = newId
  }

  read(tenant: string, session: string): SelectionView {
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
        : await notSent(() => this.client['read-model-selection']({ tenant: owner, session }))
    this.selections.show(
      keyOf(tenant, session),
      answer.outcome === 'succeeded'
        ? { kind: 'read', ...answer.body }
        : { kind: 'unreadable', reason: answer.outcome },
    )
  }

  async select(tenant: string, session: string, model: string): Promise<string> {
    const owner = readTenantText(tenant)
    if (owner === undefined) return '没有送达：租户读不懂'
    const answer = await notSent(() =>
      this.client['select-model']({ tenant: owner, session, controlId: this.newId(), model }),
    )
    await this.load(tenant, session)
    return selectText(answer)
  }

  choices(tenant: string): ChoicesView {
    return this.source === null ? ABSENT : this.lists.read(tenant)
  }

  subscribeChoices(tenant: string, listener: () => void): () => void {
    return this.lists.subscribe(tenant, listener)
  }

  async loadChoices(tenant: string): Promise<void> {
    const source = this.source
    if (source === null) return
    const listing = await source
      .list(tenant)
      .catch((): ModelChoiceListing => ({ kind: 'unavailable', reason: '没有送达' }))
    if (this.source === source) this.lists.show(tenant, listing)
  }

  attach(source: ModelChoiceSource): () => void {
    this.replace(source)
    return () => {
      if (this.source === source) this.replace(null)
    }
  }

  // What an earlier source listed is not shown as the list of the next one.
  private replace(source: ModelChoiceSource | null): void {
    this.source = source
    for (const tenant of this.lists.keys()) {
      this.lists.show(tenant, UNREAD)
      void this.loadChoices(tenant)
    }
  }
}

const keyOf = (tenant: string, session: string): string => JSON.stringify([tenant, session])
