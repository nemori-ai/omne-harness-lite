import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { SessionProtocol } from '@omne-harness/session-protocol'
import { Cells, OfferedChoices, type ChoicesView, type Listing } from './offered-choices.ts'
import { notSent } from './session-driver.ts'

type Client = Pick<ClientOf<SessionProtocol>, 'read-model-selection' | 'select-model'>
type Answer<K extends keyof Client> =
  | Awaited<ReturnType<Client[K]>>
  | Readonly<{ outcome: 'unavailable' }>
type Refusal = Extract<Answer<'select-model'>, { outcome: 'invalid' }>['body']['reason']

export type ReasoningEffort = NonNullable<Parameters<Client['select-model']>[0]['reasoningEffort']>
export type ModelChoice = Readonly<{
  route: string
  selectable: boolean
  note: string | null
  reasoningEfforts?: readonly ReasoningEffort[]
}>
export type ModelChoiceListing = Listing<ModelChoice>

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
  | Readonly<{ kind: 'read'; model: string; revision: string; reasoningEffort?: ReasoningEffort }>
  | Readonly<{ kind: 'unreadable'; reason: string }>

const UNREAD = { kind: 'unread' } as const

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
      return answer.body.detail === 'unsupported-effort'
        ? '没有换：这个模型不支持所选推理强度'
        : `没有换：${REFUSALS[answer.body.reason]}`
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

// Session is the authority on a session's model, the attached source on what can be picked.
export class ModelSelectionStore implements ModelChoiceHolder {
  private readonly selections = new Cells<SelectionView>(UNREAD)
  private readonly offered = new OfferedChoices<ModelChoice>()
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

  async select(
    tenant: string,
    session: string,
    model: string,
    reasoningEffort?: ReasoningEffort,
  ): Promise<string> {
    const owner = readTenantText(tenant)
    if (owner === undefined) return '没有送达：租户读不懂'
    const previous = this.read(tenant, session)
    const answer = await notSent(() =>
      this.client['select-model']({
        tenant: owner,
        session,
        controlId: this.newId(),
        model,
        ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
      }),
    )
    await this.load(tenant, session)
    if (answer.outcome === 'succeeded' && previous.kind === 'read' && previous.model === model)
      return `推理强度已设为 ${reasoningEffort ?? '模型默认'}`
    if (answer.outcome === 'invalid' && answer.body.detail === 'unsupported-effort')
      await this.loadChoices(tenant)
    return selectText(answer)
  }

  choices(tenant: string): ChoicesView<ModelChoice> {
    return this.offered.choices(tenant)
  }

  subscribeChoices(tenant: string, listener: () => void): () => void {
    return this.offered.subscribe(tenant, listener)
  }

  loadChoices(tenant: string): Promise<void> {
    return this.offered.load(tenant)
  }

  attach(source: ModelChoiceSource): () => void {
    return this.offered.attach(source)
  }
}

const keyOf = (tenant: string, session: string): string => JSON.stringify([tenant, session])
