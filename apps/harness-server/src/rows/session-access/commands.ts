import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { Principal } from '@omne-harness/access-cordis-contract'
import {
  accessCallsKey,
  type AccessCallsService,
} from '@omne-harness/access-cordis-contract/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import { fail, type Outcome, succeed } from '@omne-harness/operation-result'
import { createSessionCommandSource, type ModelChoice } from '@omne-harness/session-adapters'
import type { PrincipalFacts } from '@omne-harness/session-access'
import type { Asker } from '@omne-harness/slash-command-contract'
import {
  commandEntrySourcesKey,
  type CommandEntrySourcesService,
} from '@omne-harness/slash-command-cordis-contract/cordis'

const SESSION = Object.freeze({ name: 'session', major: 1 })
const MODEL = Object.freeze({ name: 'model', major: 1 })

const REASONS: Readonly<Record<string, string>> = {
  modality: '读不了这段会话里的内容',
  locked: '被锁定',
  scope: '不在这个租户能用的范围里',
}

type Listed = Readonly<{
  route: string
  selectable: boolean
  reasons: readonly string[]
  credential: string
  enabled?: boolean
}>

function choiceOf(model: Listed): ModelChoice {
  const why = model.reasons.map(reason => REASONS[reason] ?? reason).join('；')
  const unavailable =
    model.enabled === false ? '租户关掉了它' : model.selectable ? undefined : why || '此刻不能选'
  return {
    name: model.route,
    ...(unavailable === undefined ? {} : { unavailable }),
    ...(model.credential === 'missing' ? { note: '还没有凭据' } : {}),
  }
}

/** One operation done in process as the asker's own login: the operation judges it as it judges a button. */
function asking(ctx: Context, facts: PrincipalFacts) {
  return async (
    asker: Asker<unknown>,
    protocol: Readonly<{ name: string; major: number }>,
    operation: string,
    body: Readonly<Record<string, unknown>>,
  ): Promise<Outcome<Readonly<{ outcome: string; body: unknown }>, 'unavailable'>> => {
    const fact = facts.describe(asker.principal as Principal)
    const calls = ctx.get(accessCallsKey) as AccessCallsService | undefined
    const tenant = fact === undefined ? undefined : tenantCodec.encode(fact.tenant)
    if (fact === undefined || calls === undefined || tenant === undefined || !tenant.ok)
      return fail('unavailable')
    const answer = await calls.call({
      protocol,
      operation,
      body,
      login: fact.login,
      tenant: tenant.value,
      id: `command:${operation}`,
    })
    return answer.kind === 'answered' && answer.outcome !== 'basis-unavailable'
      ? succeed({ outcome: answer.outcome, body: answer.body })
      : fail('unavailable')
  }
}

/** The commands the session brings, put on the command entry sources as an official source. */
export function sessionCommandsPlugin(facts: PrincipalFacts): Plugin.Object {
  return {
    name: 'session-access.commands',
    inject: [commandEntrySourcesKey],
    apply(ctx: Context) {
      const ask = asking(ctx, facts)
      const located = (asker: Asker<unknown>) => ({ tenant: asker.tenant, session: asker.session })
      const source = createSessionCommandSource<unknown>({
        // A read the operation refuses gives no revision: the change is then refused by the operation itself.
        async permissionRevision(asker) {
          const read = await ask(asker, SESSION, 'read-permission-mode', located(asker))
          if (!('ok' in read)) return read
          const { revision } = (read.ok.body ?? {}) as { revision?: unknown }
          return succeed(typeof revision === 'string' ? revision : '')
        },
        async models(asker) {
          const read = await ask(asker, MODEL, 'list-models', { tenant: asker.tenant })
          if (!('ok' in read) || read.ok.outcome !== 'succeeded') return fail('unavailable')
          return succeed((read.ok.body as { models: readonly Listed[] }).models.map(choiceOf))
        },
        async selectedModel(asker) {
          const read = await ask(asker, SESSION, 'read-model-selection', located(asker))
          if (!('ok' in read) || read.ok.outcome !== 'succeeded') return fail('unavailable')
          return succeed((read.ok.body as { model: string }).model)
        },
      })
      const sources = ctx.get(commandEntrySourcesKey) as CommandEntrySourcesService<unknown>
      sources.contribute(source, { official: true })
    },
  }
}
