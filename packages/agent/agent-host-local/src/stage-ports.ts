import type { Context } from '@deepseek-ai/cordis'
import type { Failure } from '@omne-harness/agent-contract'
import {
  agentActionAdmissionKey,
  agentDecisionCardsKey,
  agentExtensionsKey,
  agentMaterialsKey,
  agentReadsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { fail } from '@omne-harness/operation-result'
import { toolRuntimeKey } from '@omne-harness/tool-cordis-contract/cordis'

const STAGE_KEYS = [
  toolRuntimeKey,
  agentExtensionsKey,
  agentDecisionCardsKey,
  agentActionAdmissionKey,
  agentMaterialsKey,
  agentReadsKey,
] as const

export type StageKey = (typeof STAGE_KEYS)[number]

const absent = (key: StageKey): Failure => ({
  kind: 'unavailable',
  owner: key,
  diagnostic: `no provider of ${key} is present`,
})

function memberOf(
  ctx: Context,
  key: StageKey,
  path: readonly string[],
): Readonly<{ owner: unknown; member: unknown }> | undefined {
  const provider: unknown = ctx.get(key)
  if (provider === undefined || provider === null) return undefined
  let owner: unknown = provider
  for (const step of path.slice(0, -1)) owner = Reflect.get(Object(owner), step)
  const last = path.at(-1)
  if (last === undefined) return undefined
  return { owner, member: Reflect.get(Object(owner), last) }
}

export function stagePort<T extends object>(ctx: Context, key: StageKey): T {
  const at = (path: readonly string[]): unknown =>
    new Proxy(function stageMember() {}, {
      get(_target, property) {
        if (typeof property !== 'string' || property === 'then') return undefined
        return at([...path, property])
      },
      apply(_target, _receiver, args: unknown[]) {
        const found = memberOf(ctx, key, path)
        if (found === undefined) return Promise.resolve(fail(absent(key)))
        if (typeof found.member !== 'function')
          return Promise.resolve(
            fail<Failure>({
              kind: 'unavailable',
              owner: key,
              diagnostic: `the provider of ${key} has no method ${path.join('.')}`,
            }),
          )
        return Reflect.apply(found.member, found.owner, args)
      },
    })
  return at([]) as T
}
