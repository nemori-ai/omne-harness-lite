import type { Context } from '@deepseek-ai/cordis'
import { effectiveArgumentsOf } from '@omne-harness/authorization'
import type { AccessVerdict } from '@omne-harness/tool'
import type { CallAccess } from '@omne-harness/tool-contract/provider'
import type { FixedToolRequest, ToolOperationId } from '@omne-harness/tool-contract'
import type { AdmissionReader, ToolPermissionReader } from './action-admission.ts'
import type { ToolPermissionAction, ToolPermissionCheck } from './current-tool-permission.ts'
import { toolActionRule, type ActionRules } from './action-rules.ts'
import { sessionWorkOf } from '../tool-runtime/session-work.ts'

export type ToolTargetPolicy = Readonly<{
  qualify(
    input: CallAccess<unknown> &
      Readonly<{ request: FixedToolRequest; admission: ToolOperationId }>,
  ): Promise<AccessVerdict>
}>
const unavailable = (): AccessVerdict => ({
  kind: 'unavailable',
  diagnostic: 'The current target rule or its authority is unavailable.',
})

function permissionVerdict(
  decision: Awaited<ReturnType<ToolPermissionCheck['check']>>,
): AccessVerdict {
  if (decision.kind === 'deny') return { kind: 'denied', reason: decision.reason }
  return decision.kind === 'allow' ? { kind: 'allowed' } : unavailable()
}

/** The authorization row owns these rules. A target check creates no Agent action. */
export function createToolTargetPolicy(
  rules: ActionRules | undefined,
  read: AdmissionReader,
  readPermission: ToolPermissionReader = () => undefined,
): ToolTargetPolicy {
  return {
    async qualify(input) {
      try {
        const who = sessionWorkOf(input.principal, input.tenant)
        if (who === undefined) return { kind: 'denied', reason: 'session-work-required' }
        const admission = read()
        if (rules === undefined || admission === undefined) return unavailable()
        const permissionAction: ToolPermissionAction = {
          principal: who.principal,
          tenant: input.tenant,
          operation: { owner: 'tool', operationId: input.call },
          definition: { ...input.request.availability.definition.adoption },
          effectiveArguments: input.request.arguments.effective,
          origin: {
            kind: 'tool-call',
            call: input.call,
            admission: input.admission,
            request: structuredClone(input.request),
          },
        }
        const rule = toolActionRule(rules, permissionAction.definition)
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
        if (rule === undefined) return unavailable()
        if (rule.effect === 'deny') return { kind: 'denied', reason: `rule/${rule.id}` }
        const permission = readPermission()
        if (permission === undefined) return unavailable()
        return permissionVerdict(await permission.check(permissionAction))
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
