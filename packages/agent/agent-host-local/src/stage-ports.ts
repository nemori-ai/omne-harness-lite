// The six locally required dependencies of the factory (agent-host-local docs/cordis.md "局部依赖与可选
// 依赖"): each port the factory gets reads its provider from the host's Context at every call. A
// provider that is absent answers `unavailable` at once, named after its key, and the factory never
// waits for Cordis PENDING. No call keeps an old provider: the next call reads the provider again.
//
// Limit: the stage child fiber (`ctx.inject([key], cb)`) of the design is not opened; the call runs
// on the provider that `ctx.get` returned. An absent provider answers with a `Reply` failure, which
// is the shape of every method of the five Agent ports. The members of `ToolRuntime` whose answer is
// not a `Reply` (invoke, commands) get the same value: the Tool stage of the Agent loop is not
// assembled in this version (wave B, AG-19).
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

/** The keys of the locally required dependencies. */
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

/** The member at `path` of the provider of `key` now, with the object that owns it. */
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

/**
 * A port of type `T` over the provider of `key`. Each method call reads the provider; an absent
 * provider answers `unavailable`. The port has no `then`, so it is never taken for a promise.
 */
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
  // The proxy forwards every method call to the provider of the same port type.
  return at([]) as T
}
