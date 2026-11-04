import type { ActionAdmission, AdmissionDecision } from '@omne-harness/agent-contract'
import {
  canonicalText,
  decisionEvidence,
  effectiveArgumentsOf,
  type AdmissionCheck,
  type AdmissionInput,
} from '@omne-harness/authorization'
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import { succeed } from '@omne-harness/operation-result'
import { actionRulesSchema, type ActionRules } from './action-rules.ts'
import { classify } from './principals.ts'

type Request = Parameters<ActionAdmission<unknown>['admit']>[0]
export type AdmissionReader = () => AdmissionCheck | undefined

function unavailable(diagnostic: string): AdmissionDecision {
  return { kind: 'unavailable', diagnostic }
}

/**
 * The rules of the action's tool. `tool` names the tool of the definition the trusted Tool request
 * source described, not the model's spelling of the call: a multi-command tool is declared to the
 * model as `<tool>.<command>`, so a rule on `Shell` covers `Shell.run` and `Shell.info` alike, and a
 * deny on a tool cannot be passed by naming one of its commands.
 */
function ruleFor(rules: ActionRules, input: Request) {
  const matches = rules.rules.filter(
    rule =>
      rule.tool === input.definition.name &&
      (rule.definition == null ||
        (rule.definition.owner === input.definition.owner &&
          rule.definition.name === input.definition.name &&
          rule.definition.revision === input.definition.revision &&
          rule.definition.digest === input.definition.digest)),
  )
  return (
    matches.find(rule => rule.effect === 'deny') ?? matches.find(rule => rule.effect === 'allow')
  )
}

async function decide(
  input: Request,
  rules: ActionRules | undefined,
  read: AdmissionReader,
): Promise<AdmissionDecision> {
  if (rules === undefined)
    return unavailable('no action rule source is installed in this deployment')
  if (input.permissions.length !== 0 || input.decision !== null)
    return unavailable('permission and decision interpreters are not installed')
  const who = classify(input.principal)
  const target = {
    owner: 'agent',
    kind: 'action',
    key: canonicalText([input.execution, input.passage, input.action]),
  }
  const argumentsDigest = effectiveArgumentsOf(input.effectiveArguments)
  if (
    who?.column !== 'work' ||
    !tenantCodec.encode(input.tenant).ok ||
    !tenantEquals(who.principal.tenant, input.tenant)
  ) {
    return {
      kind: 'deny',
      reason: 'session-work-required',
      evidence: decisionEvidence('action-principal', '0', { target, arguments: argumentsDigest }),
    }
  }
  const rule = ruleFor(rules, input)
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
  return actionDecision(identity, rule, rules, target, argumentsDigest)
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
  options?: Readonly<{ actionRules?: unknown; readAdmission: AdmissionReader }>,
): ActionAdmission<unknown> {
  const rules =
    options?.actionRules === undefined ? undefined : actionRulesSchema.parse(options.actionRules)
  const read = options?.readAdmission ?? (() => undefined)
  return Object.freeze({
    admit: async (input: Request) => {
      try {
        return succeed(await decide(input, rules, read))
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
