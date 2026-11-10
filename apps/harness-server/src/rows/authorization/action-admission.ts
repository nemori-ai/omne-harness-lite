import type { ActionAdmission, AdmissionDecision } from '@omne-harness/agent-contract'
import {
  canonicalText,
  decisionEvidence,
  effectiveArgumentsOf,
  type AdmissionCheck,
  type AdmissionInput,
} from '@omne-harness/authorization'
import { succeed } from '@omne-harness/operation-result'
import { actionRulesSchema, toolActionRule, type ActionRules } from './action-rules.ts'
import { sessionWorkOf } from '../tool-runtime/session-work.ts'
import {
  agentPermissionOperation,
  type ToolPermissionAction,
  type ToolPermissionCheck,
} from './current-tool-permission.ts'

type Request = Parameters<ActionAdmission<unknown>['admit']>[0]
export type AdmissionReader = () => AdmissionCheck | undefined
export type ToolPermissionReader = () => ToolPermissionCheck | undefined

function unavailable(diagnostic: string): AdmissionDecision {
  return { kind: 'unavailable', diagnostic }
}

/**
 * The rules of the action's tool. `tool` names the tool of the definition the trusted Tool request
 * source described, not the model's spelling of the call. A multi-command tool is one declaration
 * whose call names the command (D-94), so a rule on `Shell` covers every Shell command, and a deny
 * on a tool cannot be passed by naming one of its commands.
 */
function ruleFor(rules: ActionRules, input: Request) {
  return toolActionRule(rules, input.definition)
}

async function decide(
  input: Request,
  rules: ActionRules | undefined,
  read: AdmissionReader,
  readPermission: ToolPermissionReader,
): Promise<AdmissionDecision> {
  if (rules === undefined)
    return unavailable('no action rule source is installed in this deployment')
  if (input.permissions.length !== 0 || input.decision !== null)
    return unavailable('permission and decision interpreters are not installed')
  const who = sessionWorkOf(input.principal, input.tenant)
  const target = {
    owner: 'agent',
    kind: 'action',
    key: canonicalText([input.execution, input.passage, input.action]),
  }
  const argumentsDigest = effectiveArgumentsOf(input.effectiveArguments)
  if (who === undefined) {
    return {
      kind: 'deny',
      reason: 'session-work-required',
      evidence: decisionEvidence('action-principal', '0', { target, arguments: argumentsDigest }),
    }
  }
  const rule = ruleFor(rules, input)
  const permissionAction: ToolPermissionAction = {
    principal: who.principal,
    tenant: input.tenant,
    operation: agentPermissionOperation(input),
    definition: { ...input.definition },
    effectiveArguments: input.effectiveArguments,
    origin: {
      kind: 'agent-action',
      execution: input.execution,
      passage: input.passage,
      action: input.action,
      advance: structuredClone(input.advance),
      original: structuredClone(input.original),
    },
  }
  const request: AdmissionInput = {
    access: { principal: who.principal, tenant: input.tenant },
    operation: { owner: 'agent', name: 'admit-action' },
    target,
    arguments: argumentsDigest,
    requires: [],
    permit: null,
  }
  const admission = read()
  if (admission === undefined) return unavailable('the action admission dependency is unavailable')
  const identity = await admission.check(request)
  const decision = actionDecision(identity, rule, rules, target, argumentsDigest)
  if (decision.kind !== 'allow') return decision
  const permission = readPermission()
  if (permission === undefined)
    return unavailable('the current permission dependency is unavailable')
  const current = await permission.check(permissionAction)
  return current.kind === 'allow'
    ? {
        kind: 'allow',
        evidence: decisionEvidence('action-current-permission', rules.revision, {
          rule: decision.evidence,
          permission: current.evidence,
        }),
      }
    : current
}

function actionDecision(
  identity: Awaited<ReturnType<AdmissionCheck['check']>>,
  rule: ReturnType<typeof ruleFor>,
  rules: ActionRules,
  target: AdmissionInput['target'],
  argumentsDigest: AdmissionInput['arguments'],
): AdmissionDecision {
  if (identity.kind === 'unavailable')
    return unavailable('the action identity check is unavailable')
  if (identity.kind === 'denied')
    return { kind: 'deny', reason: identity.reason, evidence: identity.evidence }
  if (identity.kind !== 'allowed')
    return unavailable('the action identity check answered outside its contract')
  if (rule === undefined) return unavailable('no action rule matches this action')
  const evidence = decisionEvidence(`action-rule/${rule.id}`, rules.revision, {
    rule,
    target,
    arguments: argumentsDigest,
    identity: identity.evidence,
  })
  return rule.effect === 'deny'
    ? { kind: 'deny', reason: `rule/${rule.id}`, evidence }
    : { kind: 'allow', evidence }
}

/** One immutable rule generation; dependencies are acquired anew for each action. */
export function createActionAdmission(
  options?: Readonly<{
    actionRules?: unknown
    readAdmission: AdmissionReader
    readPermission?: ToolPermissionReader
  }>,
): ActionAdmission<unknown> {
  const rules =
    options?.actionRules === undefined ? undefined : actionRulesSchema.parse(options.actionRules)
  const read = options?.readAdmission ?? (() => undefined)
  const readPermission = options?.readPermission ?? (() => undefined)
  return Object.freeze({
    admit: async (input: Request) => {
      try {
        return succeed(await decide(input, rules, read, readPermission))
      } catch {
        return succeed(
          unavailable(
            'the action admission request or dependency failed; exception text is not reported',
          ),
        )
      }
    },
  })
}
