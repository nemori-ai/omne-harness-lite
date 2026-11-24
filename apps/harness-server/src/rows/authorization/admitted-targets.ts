import type { Context } from '@deepseek-ai/cordis'
import { canonicalDigest } from '@omne-harness/tool'
import type { Adoption } from '@omne-harness/tool-contract'

/** The action that made a call, as the Agent names it on its admission and on the call's consumer. */
export type AdmittedAction = Readonly<{ work: string; position: string }>

const LIMIT = 4096
const admitted = new WeakMap<Context, Map<string, string | null>>()
const keyOf = ({ work, position }: AdmittedAction) => `${work}\n${position}`

/** What a `Tools` call was admitted to carry: its target's adoption, or null when it carried none. The last judging stands. */
export function rememberAdmittedTarget(
  ctx: Context,
  action: AdmittedAction,
  target: Adoption | null,
): void {
  const kept = admitted.get(ctx.root) ?? new Map<string, string | null>()
  admitted.set(ctx.root, kept)
  const key = keyOf(action)
  kept.delete(key)
  kept.set(key, target === null ? null : canonicalDigest(target))
  const oldest = kept.size > LIMIT ? kept.keys().next().value : undefined
  if (oldest !== undefined) kept.delete(oldest)
}

/** Whether the call of this action was admitted to carry exactly this target. Nothing kept is no. */
export function wasAdmittedTarget(ctx: Context, action: AdmittedAction, target: Adoption): boolean {
  return admitted.get(ctx.root)?.get(keyOf(action)) === canonicalDigest(target)
}
