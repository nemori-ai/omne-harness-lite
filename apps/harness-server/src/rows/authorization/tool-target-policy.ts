import type { Context } from '@deepseek-ai/cordis'
import { effectiveArgumentsOf } from '@omne-harness/authorization'
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import type { AccessVerdict } from '@omne-harness/tool'
import type { CallAccess } from '@omne-harness/tool-contract/provider'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import type { AdmissionReader } from './action-admission.ts'
import { toolActionRule, type ActionRules } from './action-rules.ts'
import { classify } from './principals.ts'

export type ToolTargetPolicy = Readonly<{
  qualify(
    input: CallAccess<unknown> & Readonly<{ request: FixedToolRequest }>,
  ): Promise<AccessVerdict>
}>
const unavailable = (): AccessVerdict => ({
  kind: 'unavailable',
  diagnostic: 'The current target rule or its authority is unavailable.',
})

/** The authorization row owns these rules. A target check creates no Agent action. */
export function createToolTargetPolicy(
  rules: ActionRules | undefined,
  read: AdmissionReader,
): ToolTargetPolicy {
  return {
    async qualify(input) {
      try {
        const who = classify(input.principal)
        if (
          who?.column !== 'work' ||
          !tenantCodec.encode(input.tenant).ok ||
          !tenantEquals(who.principal.tenant, input.tenant)
        )
          return { kind: 'denied', reason: 'session-work-required' }
        const admission = read()
        if (rules === undefined || admission === undefined) return unavailable()
        const identity = await admission.check({
          access: { principal: who.principal, tenant: input.tenant },
          operation: { owner: 'tool', name: 'admit' },
          target: { owner: 'tool', kind: 'call', key: input.call },
          arguments: effectiveArgumentsOf(input.request.arguments.effective),
          requires: [],
          permit: null,
        })
        if (identity.kind === 'denied') return { kind: 'denied', reason: identity.reason }
        if (identity.kind !== 'allowed') return unavailable()
        const rule = toolActionRule(rules, input.request.availability.definition.adoption)
        if (rule === undefined) return unavailable()
        return rule.effect === 'allow'
          ? { kind: 'allowed' }
          : { kind: 'denied', reason: `rule/${rule.id}` }
      } catch {
        return unavailable()
      }
    },
  }
}

const current = new WeakMap<Context, ToolTargetPolicy>()
export function installToolTargetPolicy(ctx: Context, policy: ToolTargetPolicy): void {
  if (current.has(ctx.root))
    throw new Error('The target policy is already installed for this root.')
  current.set(ctx.root, policy)
  ctx.effect(
    () => () => {
      if (current.get(ctx.root) === policy) current.delete(ctx.root)
    },
    'authorization.tool-target-policy',
  )
}
export function toolTargetPolicyOf(ctx: Context): ToolTargetPolicy | undefined {
  return current.get(ctx.root)
}
