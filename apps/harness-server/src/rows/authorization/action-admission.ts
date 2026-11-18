import type { ActionAdmission, AdmissionDecision } from '@omne-harness/agent-contract'
import {
  canonicalText,
  decisionEvidence,
  effectiveArgumentsOf,
  type AdmissionCheck,
  type AdmissionInput,
} from '@omne-harness/authorization'
import { succeed } from '@omne-harness/operation-result'
import type { ToolActionResolution } from '@omne-harness/tool-contract'
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
export type ResolutionReader = () => ToolActionResolution<unknown> | undefined

function unavailable(diagnostic: string): AdmissionDecision {
  return { kind: 'unavailable', diagnostic }
}

function undecidable(diagnostic: string): AdmissionDecision {
  return { kind: 'undecidable', diagnostic }
}

function ruleFor(rules: ActionRules, gate: Pick<Judged, 'definition'>) {
  return toolActionRule(rules, gate.definition)
}

type Judged = Readonly<{
  definition: ToolPermissionAction['definition']
  effectiveArguments: string
  carrier?: true
  carried?: Readonly<{ definition: ToolPermissionAction['definition']; effectiveArguments: string }>
}>

// What admission judges is the action the call performs: a carrier only for a prohibition, then its target.
async function judgedOf(
  input: Request,
  principal: ToolPermissionAction['principal'],
  readResolution: ResolutionReader,
): Promise<readonly Judged[] | AdmissionDecision> {
  const own = { definition: input.definition, effectiveArguments: input.effectiveArguments }
  const resolution = readResolution()
  if (resolution === undefined)
    return unavailable('the action resolution dependency is unavailable')
  const resolved = await resolution.resolve({
    principal,
    tenant: input.tenant,
    name: input.original.name,
    effectiveArguments: input.effectiveArguments,
  })
  if ('failure' in resolved)
    // A carried call naming no valid target runs only the carrier, which answers the argument error.
    return resolved.failure.kind === 'invalid' && input.original.name === 'Tools'
      ? [{ ...own, carrier: true }]
      : unavailable('the action could not be resolved now')
  if (resolved.ok.kind === 'own') return [own]
  const { target } = resolved.ok
  return [
    { ...own, carrier: true },
    {
      definition: target.definition,
      effectiveArguments: target.effectiveArguments,
      carried: own,
    },
  ]
}

async function decide(
  input: Request,
  rules: ActionRules | undefined,
  read: AdmissionReader,
  readPermission: ToolPermissionReader,
  readResolution: ResolutionReader,
): Promise<AdmissionDecision> {
  if (rules === undefined)
    return undecidable('no action rule source is installed in this deployment')
  if (input.permissions.length !== 0 || input.decision !== null)
    return undecidable('permission and decision interpreters are not installed')
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
  const admission = read()
  if (admission === undefined) return unavailable('the action admission dependency is unavailable')
  const identity = await admission.check({
    access: { principal: who.principal, tenant: input.tenant },
    operation: { owner: 'agent', name: 'admit-action' },
    target,
    arguments: argumentsDigest,
    requires: [],
    permit: null,
  })
  const judged = await judgedOf(input, who.principal, readResolution)
  if (!Array.isArray(judged)) return judged as AdmissionDecision
  const permission = readPermission()
  let allowed: AdmissionDecision | undefined
  for (const gate of judged as readonly Judged[]) {
    const decision = actionDecision(identity, ruleFor(rules, gate), rules, target, argumentsDigest)
    if (decision.kind !== 'allow' && !(gate.carrier && decision.kind === 'undecidable'))
      return decision
    if (permission === undefined)
      return unavailable('the current permission dependency is unavailable')
    const current = await permission.check({
      principal: who.principal,
      tenant: input.tenant,
      operation: agentPermissionOperation(input),
      definition: { ...gate.definition },
      effectiveArguments: gate.effectiveArguments,
      ...(gate.carrier ? { carrier: true as const } : {}),
      origin: {
        kind: 'agent-action',
        execution: input.execution,
        passage: input.passage,
        action: input.action,
        advance: structuredClone(input.advance),
        original: structuredClone(input.original),
        ...(gate.carried === undefined ? {} : { carrier: structuredClone(gate.carried) }),
      },
    })
    if (current.kind !== 'allow') return current
    allowed = {
      kind: 'allow',
      evidence: decisionEvidence('action-current-permission', rules.revision, {
        rule: decision.kind === 'allow' ? decision.evidence : null,
        permission: current.evidence,
      }),
    }
  }
  return allowed ?? undecidable('the call performs no action')
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
    return undecidable('the action identity check answered outside its contract')
  if (rule === undefined) return undecidable('no action rule matches this action')
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

export function createActionAdmission(
  options: Readonly<{
    actionRules?: unknown
    readAdmission: AdmissionReader
    readPermission: ToolPermissionReader
    readResolution: ResolutionReader
  }>,
): ActionAdmission<unknown> {
  const rules =
    options.actionRules === undefined ? undefined : actionRulesSchema.parse(options.actionRules)
  const { readAdmission: read, readPermission, readResolution } = options
  return Object.freeze({
    admit: async (input: Request) => {
      try {
        return succeed(await decide(input, rules, read, readPermission, readResolution))
      } catch {
        return succeed(
          undecidable(
            'the action admission request or dependency failed; exception text is not reported',
          ),
        )
      }
    },
  })
}
