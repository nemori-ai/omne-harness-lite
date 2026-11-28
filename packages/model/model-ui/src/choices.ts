import type { ModelProtocol } from '@omne-harness/model-protocol'
import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'

type Client = Pick<ClientOf<ModelProtocol>, 'list-models'>
type Answer = Awaited<ReturnType<Client['list-models']>>
type Listed = Extract<Answer, { outcome: 'succeeded' }>['body']['models'][number]

/** One model as a person picks from it: its route, whether it can be picked, and a word on it. */
export type ModelChoice = Readonly<{
  route: string
  selectable: boolean
  note: string | null
  reasoningEfforts: NonNullable<Listed['reasoningEfforts']>
  /** The effort the tenant set for this model, taken when a session chose none. */
  defaultReasoningEffort?: NonNullable<Listed['defaultReasoningEffort']>
  /** How many blocks of the session it was listed for this model cannot take. */
  blocks?: number
}>

export type ModelChoiceListing =
  | Readonly<{ kind: 'listed'; choices: readonly ModelChoice[] }>
  | Readonly<{ kind: 'unavailable'; reason: string }>

/** The models of a tenant for whoever shows a choice of them. The wording is Model's own. */
export interface ModelChoices {
  list(tenant: string, session?: string): Promise<ModelChoiceListing>
}

const REASONS: Readonly<Record<Listed['reasons'][number], string>> = {
  modality: '不支持文字',
  locked: '被锁定',
  scope: '不在这个租户能用的范围里',
}
const REFUSALS: Readonly<Record<string, string>> = {
  denied: '没有权限看模型的列表',
  'basis-unavailable': '模型的列表暂时读不到',
}

// A model that lacks its credential can still be picked; the note says a call cannot go out yet.
export function noteOf(
  model: Pick<Listed, 'selectable' | 'reasons' | 'credential' | 'enabled' | 'blocks'>,
): string | null {
  if (model.blocks !== undefined)
    return `不能选：读不了这段会话里的 ${String(model.blocks.length)} 块内容`
  if (!model.selectable) {
    const reasons = [
      ...(model.enabled === false ? ['没有启用'] : []),
      ...model.reasons.map(reason => REASONS[reason]),
    ]
    return reasons.length === 0 ? '现在不能选' : `不能选：${reasons.join('、')}`
  }
  return model.credential === 'missing' ? '还没有配置凭据，选了也暂时调不了' : null
}

export function createModelChoices(client: Client): ModelChoices {
  return {
    async list(tenant, session) {
      const owner = readTenantText(tenant)
      if (owner === undefined) return { kind: 'unavailable', reason: '租户读不懂' }
      let answer: Answer
      try {
        answer = await client['list-models']({
          tenant: owner,
          ...(session === undefined ? {} : { session }),
        })
      } catch {
        return { kind: 'unavailable', reason: '没有送达' }
      }
      if (answer.outcome !== 'succeeded')
        return { kind: 'unavailable', reason: REFUSALS[answer.outcome] ?? answer.outcome }
      const choices = answer.body.models.map(model => ({
        route: model.route,
        selectable: model.selectable,
        note: noteOf(model),
        reasoningEfforts: model.reasoningEfforts ?? [],
        ...(model.defaultReasoningEffort === undefined
          ? {}
          : { defaultReasoningEffort: model.defaultReasoningEffort }),
        ...(model.blocks === undefined ? {} : { blocks: model.blocks.length }),
      }))
      return { kind: 'listed', choices }
    },
  }
}
