import type { ActionAdmission, AdmissionDecision } from '@omne-harness/agent-contract'
import {
  canonicalText,
  decisionEvidence,
  effectiveArgumentsOf,
  type AdmissionCheck,
  type AdmissionInput,
} from '@omne-harness/authorization'
import { succeed } from '@omne-harness/operation-result'
import type {
  Adoption,
  ToolActionGate,
  ToolActionResolution,
  ToolGate,
} from '@omne-harness/tool-contract'
import type { ToolCallLabeling } from '../../entry/tool-action-resolution.ts'
import { actionRulesSchema, toolActionRule, type ActionRules } from './action-rules.ts'
import {
  applyAnswer,
  type Applied,
  type AuthorizationWriter,
  type JudgeAgain,
} from './answer-effects.ts'
import { answerEffect, askedDecision, type AnswerEffect } from './release-asking.ts'
import type { TenantPicks } from './tenant-picks.ts'
import { sessionWorkOf } from '../tool-runtime/session-work.ts'
import {
  agentPermissionOperation,
  type ToolPermissionAction,
  type ToolPermissionCheck,
} from './current-tool-permission.ts'
import type { AdmittedAction } from './admitted-targets.ts'
import { agentActionConsumer } from './authorization-facts.ts'

type Request = Parameters<ActionAdmission<unknown>['admit']>[0]
export type AdmissionReader = () => AdmissionCheck | undefined
export type ToolPermissionReader = () => ToolPermissionCheck | undefined
export type ResolutionReader = () => ToolActionResolution<unknown> | undefined
export type { AuthorizationWriter } from './answer-effects.ts'
type Readers = Readonly<{
  readAdmission: AdmissionReader
  readAuthorizations?: () => AuthorizationWriter | undefined
  readPermission: ToolPermissionReader
  readResolution: ResolutionReader
  readLabeling?: () => ToolCallLabeling | undefined
  /** The tenant's own setting of a gate; absent, the deployment gives no lasting option. */
  readPicks?: () => TenantPicks | undefined
  carried?: (action: AdmittedAction, target: Adoption | null) => void
}>

function unavailable(diagnostic: string): AdmissionDecision {
  return { kind: 'unavailable', diagnostic }
}

function undecidable(diagnostic: string): AdmissionDecision {
  return { kind: 'undecidable', diagnostic }
}

type Judged = Readonly<{
  definition: ToolPermissionAction['definition']
  effectiveArguments: string
  gate: ToolActionGate
  carrier?: true
  carried?: Readonly<{ definition: ToolPermissionAction['definition']; effectiveArguments: string }>
}>
type Gates = readonly [Judged, ...Judged[]]

// What admission judges is the action the call performs: a carrier only for a prohibition, then its target.
async function judgedOf(
  input: Request,
  principal: ToolPermissionAction['principal'],
  readResolution: ResolutionReader,
  carried: Readers['carried'],
): Promise<Gates | AdmissionDecision> {
  const own = { definition: input.definition, effectiveArguments: input.effectiveArguments }
  const resolution = readResolution()
  if (resolution === undefined)
    return unavailable('the action resolution dependency is unavailable')
  const resolved = await resolution.resolve({
    principal,
    tenant: input.tenant,
    name: input.original.name,
    definition: input.definition,
    effectiveArguments: input.effectiveArguments,
  })
  if ('failure' in resolved) return unavailable('the action could not be resolved now')
  const action = resolved.ok
  if (action.kind === 'own') return [{ ...own, gate: action.gate }]
  const made = { work: input.execution, position: input.action }
  carried?.(made, action.kind === 'carried' ? action.target.definition : null)
  // A call that performs no action is judged as a carrier: it answers the argument error itself.
  if (action.kind === 'argument-error') return [{ ...own, gate: action.gate, carrier: true }]
  const { target } = action
  return [
    { ...own, gate: action.carrier.gate, carrier: true },
    {
      definition: target.definition,
      effectiveArguments: target.effectiveArguments,
      gate: target.gate,
      carried: own,
    },
  ]
}

type Judging = Readonly<{
  input: Request
  rules: ActionRules
  principal: ToolPermissionAction['principal']
  session: string
  identity: Awaited<ReturnType<AdmissionCheck['check']>>
  target: AdmissionInput['target']
  argumentsDigest: AdmissionInput['arguments']
  permission: ToolPermissionCheck | undefined
  labeling: ToolCallLabeling | undefined
  picks: TenantPicks | undefined
}>

function permissionAction(judging: Judging, gate: Judged, of: ToolGate): ToolPermissionAction {
  const { input } = judging
  return {
    principal: judging.principal,
    tenant: input.tenant,
    operation: agentPermissionOperation(input),
    definition: { ...gate.definition },
    effectiveArguments: gate.effectiveArguments,
    gate: { ...of },
    ...(gate.carrier ? { carrier: true as const } : {}),
    origin: {
      kind: 'agent-action',
      execution: input.execution,
      passage: input.passage,
      action: input.action,
      advance: structuredClone(input.advance),
      original: structuredClone(input.original),
      ...(gate.carried === undefined ? {} : { carrier: structuredClone(gate.carried) }),
      // An action that comes with a person's answer reads what the answer wrote, not what the pass read.
      ...(input.batch === undefined || input.decision !== null
        ? {}
        : { pass: canonicalText([input.batch.id, input.batch.pass]) }),
    },
  }
}

const NO_LASTING = Object.freeze({ allow: false, deny: false })

function lastingOf(judging: Judging, gate: Judged, of: ToolGate) {
  if (judging.picks === undefined) return NO_LASTING
  const { principal, input } = judging
  return judging.picks.writable({
    principal,
    tenant: input.tenant,
    definition: gate.definition,
    gate: of,
  })
}

// One gate passes its action rule (a carrier with no rule passes it) and then its current permission.
async function judgeGate(judging: Judging, gate: Judged): Promise<AdmissionDecision> {
  const { rules } = judging
  const rule = toolActionRule(rules, gate.definition)
  const decision = actionDecision(
    judging.identity,
    rule,
    rules,
    judging.target,
    judging.argumentsDigest,
  )
  if (decision.kind !== 'allow' && !(gate.carrier && decision.kind === 'undecidable'))
    return decision
  const ruled = decision.kind === 'allow' ? decision.evidence : null
  if (gate.gate.kind === 'ungated')
    return {
      kind: 'allow',
      evidence: decisionEvidence('action-ungated', rules.revision, {
        rule: ruled,
        permission: null,
      }),
    }
  const of = gate.gate.gate
  if (judging.permission === undefined)
    return unavailable('the current permission dependency is unavailable')
  const current = await judging.permission.check(permissionAction(judging, gate, of))
  if (current.kind === 'ask') {
    const lasting = await lastingOf(judging, gate, of)
    if (lasting === 'unavailable')
      return unavailable('the tenant setting of the gate could not be read now')
    return askedDecision(judging.labeling, {
      input: judging.input,
      principal: judging.principal,
      session: judging.session,
      definition: gate.definition,
      effectiveArguments: gate.effectiveArguments,
      gateTitle: of.title,
      evidence: current.evidence,
      gate: current.gate,
      lasting,
    })
  }
  if (current.kind !== 'allow') return current
  const { by, grant } = current.release
  return {
    kind: 'allow',
    evidence: decisionEvidence(
      canonicalText({ decision: 'action-current-permission', by, grant }),
      rules.revision,
      { rule: ruled, permission: current.evidence, release: current.release },
    ),
  }
}

type Admitting = Readonly<{
  who: NonNullable<ReturnType<typeof sessionWorkOf>>
  target: AdmissionInput['target']
  argumentsDigest: AdmissionInput['arguments']
  effect: Exclude<AnswerEffect, { kind: 'decided' }> | null
}>

async function judgeAdmitted(
  input: Request,
  rules: ActionRules,
  readers: Readers,
  admitting: Admitting,
): Promise<AdmissionDecision> {
  const { who, target, argumentsDigest, effect } = admitting
  const admission = readers.readAdmission()
  if (admission === undefined) return unavailable('the action admission dependency is unavailable')
  const identity = await admission.check({
    access: { principal: who.principal, tenant: input.tenant },
    operation: { owner: 'agent', name: 'admit-action' },
    target,
    arguments: argumentsDigest,
    requires: [],
    permit: null,
  })
  const gates = await judgedOf(input, who.principal, readers.readResolution, readers.carried)
  if ('kind' in gates) return gates
  const judging = {
    input,
    rules,
    principal: who.principal,
    session: who.session,
    identity,
    target,
    argumentsDigest,
    permission: readers.readPermission(),
    labeling: readers.readLabeling?.(),
    picks: readers.readPicks?.(),
  }
  const applied = effect === null ? null : await answered(judging, gates, effect, readers)
  if (applied === null) return judgeGates(judging, gates)
  return applied.kind === 'judge-again'
    ? noticed(await judgeGates(judging, gates), applied)
    : applied
}

const noticed = (answer: AdmissionDecision, { notice }: JudgeAgain): AdmissionDecision =>
  answer.kind === 'allow' ? { ...answer, notice } : answer

async function decide(
  input: Request,
  rules: ActionRules | undefined,
  readers: Readers,
): Promise<AdmissionDecision> {
  if (rules === undefined)
    return undecidable('no action rule source is installed in this deployment')
  if (input.permissions.length !== 0)
    return undecidable('permission interpreters are not installed')
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
      category: 'rule',
      reason: 'session-work-required',
      evidence: decisionEvidence('action-principal', '0', { target, arguments: argumentsDigest }),
    }
  }
  const effect = input.decision === null ? null : answerEffect(input.decision)
  if (effect?.kind === 'decided') return effect.decision
  return judgeAdmitted(input, rules, readers, { who, target, argumentsDigest, effect })
}

// The answer's effect comes first, so judging again reads what it wrote.
function answered(
  judging: Judging,
  gates: Gates,
  effect: Exclude<AnswerEffect, { kind: 'decided' }>,
  readers: Readers,
): Promise<Applied> {
  const { input } = judging
  const last = gates[gates.length - 1]!
  if (last.gate.kind === 'ungated') return Promise.resolve(null)
  const action = {
    principal: judging.principal,
    tenant: input.tenant,
    session: judging.session,
    consumer: agentActionConsumer(input),
    gate: {
      definition: last.definition,
      effectiveArguments: last.effectiveArguments,
      gate: last.gate.gate,
    },
  }
  return applyAnswer(action, effect, {
    authorizations: readers.readAuthorizations?.(),
    picks: judging.picks,
  })
}

async function judgeGates(judging: Judging, gates: Gates): Promise<AdmissionDecision> {
  const [first, ...rest] = gates
  let answer = await judgeGate(judging, first)
  for (const gate of rest) {
    if (answer.kind !== 'allow') return answer
    answer = await judgeGate(judging, gate)
  }
  return answer
}

function actionDecision(
  identity: Awaited<ReturnType<AdmissionCheck['check']>>,
  rule: ReturnType<typeof toolActionRule>,
  rules: ActionRules,
  target: AdmissionInput['target'],
  argumentsDigest: AdmissionInput['arguments'],
): AdmissionDecision {
  if (identity.kind === 'unavailable')
    return unavailable('the action identity check is unavailable')
  if (identity.kind === 'denied')
    return { kind: 'deny', category: 'rule', reason: identity.reason, evidence: identity.evidence }
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
    ? { kind: 'deny', category: 'rule', reason: `rule/${rule.id}`, evidence }
    : { kind: 'allow', evidence }
}

export function createActionAdmission(
  options: Readonly<{ actionRules?: unknown }> & Readers,
): ActionAdmission<unknown> {
  const rules =
    options.actionRules === undefined ? undefined : actionRulesSchema.parse(options.actionRules)
  return Object.freeze({
    admit: async (input: Request) => {
      try {
        return succeed(await decide(input, rules, options))
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
