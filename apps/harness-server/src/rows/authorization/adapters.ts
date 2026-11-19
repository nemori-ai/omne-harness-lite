import {
  canonicalText,
  effectiveArgumentsOf,
  noArguments,
  type AdmissionCheck,
  type AdmissionDecision,
  type AdmissionInput,
  type EffectiveArguments,
  type SystemActionAuthorization,
  type SystemActionDecision,
  type SystemActionRequest,
} from '@omne-harness/authorization'
import type {
  AgentAccessCheck,
  AgentAccessDecision,
  DecisionCards,
  DurableEvidence,
} from '@omne-harness/agent-contract'
import type { ActingForTenantPrincipal, SystemPrincipal } from '@omne-harness/identity'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type {
  IntakeSubject,
  MutationName,
  SessionAccessCheck,
  SessionAccessDecision,
  SessionAccessRequest,
} from '@omne-harness/session-contract'
import {
  readsAcrossTenant,
  resolveCell,
  type BranchInput,
  type ResolvedCell,
  type SystemPurpose,
} from './cells.ts'
import { AGENT_POLICY } from './agent-policy.ts'
import { SESSION_POLICY } from './session-policy.ts'
import {
  preparePermissionWrite,
  qualifyPermissionWrite,
  type PreparedPermissionWrite,
  type SessionPermissionLogin,
} from './session-permission-write.ts'
import type { AskedGate } from './current-tool-permission.ts'
import { gateOfAnswer } from './release-asking.ts'

import { classOf } from '../../model/principals.ts'
import { classify, SESSION_WORK_OWNER } from './principals.ts'
export { LOGIN_WORK_OWNER, SESSION_WORK_OWNER } from './principals.ts'
export { createActionAdmission } from './action-admission.ts'
export { createToolAccessGuard } from './tool-access.ts'

export type AccessPorts = Readonly<{
  admission: AdmissionCheck
  /** Where the answers people gave on cards are read back; absent, no authorization is written. */
  cards?: () => DecisionCards<unknown> | undefined
  systemActions: SystemActionAuthorization
  login: SessionPermissionLogin
}>

type Verdict = SessionAccessDecision & AgentAccessDecision

type Plan =
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
  | Readonly<{
      kind: 'member'
      input: AdmissionInput
      permissionWrite?: PreparedPermissionWrite
      cardDecision?: CardDecision
    }>
  | Readonly<{ kind: 'matrix'; request: SystemActionRequest }>

const DENIED: Plan = Object.freeze({ kind: 'denied' })

/** The card answer an authorization expression claims: the write stands only on that answer. */
type CardDecision = Readonly<{
  card: DurableEvidence
  source: DurableEvidence
  options: readonly string[]
  gate: AskedGate | null
}>

function tenantText(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new TypeError('the tenant is not a minted tenant')
  return encoded.value
}

function actsFor(who: NonNullable<ReturnType<typeof classify>>, tenant: TenantId | null): boolean {
  if (who.column === 'system') return true
  return tenant !== null && tenantEquals(who.principal.tenant, tenant)
}

type Builders = Readonly<{
  member(principal: ActingForTenantPrincipal): AdmissionInput | null
  matrix(purpose: SystemPurpose, principal: SystemPrincipal): SystemActionRequest | null
}>

function planCell(
  cell: ResolvedCell,
  who: NonNullable<ReturnType<typeof classify>>,
  build: Builders,
): Plan {
  switch (cell.verdict) {
    case 'deny':
      return DENIED
    case 'member': {
      if (who.column === 'system') return DENIED
      const input = build.member(who.principal)
      return input === null ? DENIED : { kind: 'member', input }
    }
    case 'matrix': {
      if (who.column !== 'system') return DENIED
      const request = build.matrix(cell.purpose, who.principal)
      return request === null ? DENIED : { kind: 'matrix', request }
    }
    default: {
      const _exhaustive: never = cell
      return _exhaustive
    }
  }
}

const OUTSIDE_CONTRACT = 'a dependency of the access check answered outside its contract'

function unavailable(diagnostic: string): Verdict {
  return Object.freeze({ kind: 'unavailable', diagnostic })
}

function fromDecision(decision: AdmissionDecision | SystemActionDecision): Verdict {
  switch (decision.kind) {
    case 'allowed':
      return Object.freeze({ kind: 'allowed', evidence: decision.evidence })
    case 'denied':
      return Object.freeze({ kind: 'denied' })
    case 'unavailable':
      return unavailable(decision.diagnostic)
    default:
      return unavailable(OUTSIDE_CONTRACT)
  }
}

type MemberPlan = Extract<Plan, { kind: 'member' }>

async function executeMember(plan: MemberPlan, ports: AccessPorts): Promise<Verdict> {
  const decision = fromDecision(await ports.admission.check(plan.input))
  if (decision.kind !== 'allowed') return decision
  if (plan.cardDecision !== undefined)
    return answeredOnCard(plan.cardDecision, plan.input, decision, ports.cards?.())
  return plan.permissionWrite !== undefined
    ? qualifyPermissionWrite(plan.permissionWrite, decision.evidence, ports.login)
    : decision
}

async function execute(plan: Plan, ports: AccessPorts): Promise<Verdict> {
  switch (plan.kind) {
    case 'denied':
      return Object.freeze({ kind: 'denied' })
    case 'unavailable':
      return unavailable(plan.diagnostic)
    case 'member':
      return executeMember(plan, ports)
    case 'matrix':
      return fromDecision(await ports.systemActions.check(plan.request))
    default:
      return unavailable(OUTSIDE_CONTRACT)
  }
}

async function answer(plan: () => Plan, ports: AccessPorts): Promise<Verdict> {
  let planned: Plan
  try {
    planned = plan()
  } catch {
    return unavailable('the access check could not read the request')
  }
  try {
    return await execute(planned, ports)
  } catch {
    return unavailable(
      'a dependency of the access check threw an exception; its message is not reported',
    )
  }
}

const MUTATIONS = {
  accept: true,
  startRun: true,
  claim: true,
  reload: true,
  recordMessage: true,
  preserveResult: true,
  completeConsumption: true,
  completeExternalConsumption: true,
  bindExternalCall: true,
  commitDerived: true,
  release: true,
  control: true,
  finishRun: true,
  create: true,
  completeInitialization: true,
  change: true,
  setRelation: true,
  configureAutoArchive: true,
  considerAutoArchive: true,
  recordIdle: true,
  addTodo: true,
  markTodoComplete: true,
  removeTodo: true,
  interrupt: true,
  cancelRun: true,
  stopCall: true,
  retryRun: true,
  freeze: true,
  receive: true,
} as const satisfies Readonly<Record<MutationName, true>>

function isMutation(operation: string): operation is MutationName {
  return Object.hasOwn(MUTATIONS, operation)
}

type SessionTargetKind = SessionAccessRequest<unknown>['target']['kind']

function targetKindOf(operation: SessionAccessRequest<unknown>['operation']): SessionTargetKind {
  switch (operation) {
    case 'pending':
    case 'directory.list':
      return 'tenant'
    case 'references':
      return 'resident-references'
    case 'releasedScopes':
      return 'released-scopes'
    default:
      return 'session'
  }
}

type CommandFacts = Readonly<{
  arguments: EffectiveArguments
  branch: BranchInput
  fact: unknown
}>

const NO_COMMAND: CommandFacts = Object.freeze({
  arguments: noArguments(),
  branch: Object.freeze({}),
  fact: null,
})

function commandFacts(
  command: Extract<SessionAccessRequest<unknown>['target'], { command: unknown }>['command'],
): CommandFacts {
  const args = effectiveArgumentsOf(command)
  switch (command.kind) {
    case 'accept':
      return { arguments: args, branch: { routed: command.input.value.kind }, fact: null }
    case 'receive':
      return {
        arguments: args,
        branch: { fact: command.input.fact.kind },
        fact: command.input.fact,
      }
    case 'change':
      return {
        arguments: args,
        branch: { declaration: command.input.declaration.kind },
        fact: null,
      }
    default:
      return { arguments: args, branch: {}, fact: null }
  }
}

// The answer the person gave on the card is read back where it was recorded, not taken from the command.
async function answeredOnCard(
  claimed: CardDecision,
  input: AdmissionInput,
  allowed: Verdict,
  cards: DecisionCards<unknown> | undefined,
): Promise<Verdict> {
  if (cards === undefined) return unavailable('the decision cards are not installed')
  const read = await cards.read({ ...input.access, card: claimed.card })
  if ('failure' in read) return unavailable('the card answer could not be read now')
  const reply = read.ok
  const answered =
    reply.kind === 'chosen' &&
    claimed.options.includes(reply.option) &&
    canonicalText(reply.evidence) === canonicalText(claimed.source)
  // A lasting authorization names the gate of its card, with the basis the card holds.
  const sameGate =
    claimed.gate === null ||
    (reply.kind === 'chosen' &&
      canonicalText(gateOfAnswer(reply.value)) === canonicalText(claimed.gate))
  return answered && sameGate ? allowed : Object.freeze({ kind: 'denied' })
}

// The answers each expression may stand on; an answer for always also releases this once when unwritten.
const OPTIONS_OF: Readonly<Record<string, readonly string[]>> = {
  'once/grant': ['allow-once', 'allow-always'],
  'session/grant': ['allow-session'],
  'session/revoke': ['deny-always'],
}

function cardDecisionOf(target: SessionAccessRequest<unknown>['target']): CardDecision | null {
  if (!('command' in target) || target.command.kind !== 'change') return null
  const { declaration } = target.command.input
  if (declaration.kind !== 'authorization-expression') return null
  const { scope, direction, source } = declaration.expression
  const options = OPTIONS_OF[`${scope.kind}/${direction}`]
  if (options === undefined) return null
  const gate =
    scope.kind === 'session'
      ? {
          capabilityId: scope.capabilityId,
          enforcementKey: scope.enforcementKey,
          basis: scope.basis,
        }
      : null
  return { card: declaration.authorization, source, options, gate }
}

type SessionTarget = SessionAccessRequest<unknown>['target']

function factsOf(
  operation: keyof typeof SESSION_POLICY,
  target: SessionTarget,
  tenant: TenantId | null,
): CommandFacts | null {
  if (!('command' in target)) return isMutation(operation) ? null : NO_COMMAND
  const { command } = target
  const names =
    isMutation(operation) &&
    command.kind === operation &&
    tenant !== null &&
    tenantEquals(command.input.tenant, tenant) &&
    command.input.session === target.session
  return names ? commandFacts(command) : null
}

type ChangeCommand = Extract<
  Extract<SessionTarget, { command: unknown }>['command'],
  { kind: 'change' }
>

function withCardDecision(planned: MemberPlan, target: SessionTarget): Plan {
  const cardDecision = cardDecisionOf(target)
  return cardDecision === null ? DENIED : { ...planned, cardDecision }
}

function withPermissionWrite(
  planned: MemberPlan,
  command: ChangeCommand,
  who: NonNullable<ReturnType<typeof classify>>,
): Plan {
  if (who.column !== 'login') return DENIED
  const permissionWrite = preparePermissionWrite(command, who.principal)
  return permissionWrite === null ? DENIED : { ...planned, permissionWrite }
}

// Two declarations need more than the cell: each carries the qualification its write stands on.
function qualifiedWrite(
  planned: Plan,
  target: SessionTarget,
  who: NonNullable<ReturnType<typeof classify>>,
): Plan {
  if (planned.kind !== 'member' || !('command' in target) || target.command.kind !== 'change')
    return planned
  switch (target.command.input.declaration.kind) {
    case 'authorization-expression':
      return withCardDecision(planned, target)
    case 'permission-assignment':
      return withPermissionWrite(planned, target.command, who)
    default:
      return planned
  }
}

function planSession(input: SessionAccessRequest<unknown>): Plan {
  const { access, operation, target } = input
  if (typeof operation !== 'string' || !Object.hasOwn(SESSION_POLICY, operation)) return DENIED
  const tenant = 'tenant' in access ? access.tenant : null
  if (target.kind !== targetKindOf(operation)) return DENIED

  const facts = factsOf(operation, target, tenant)
  if (facts === null) return DENIED
  if (target.kind === 'tenant' && (tenant === null || !tenantEquals(target.tenant, tenant)))
    return DENIED

  const who = classify(access.principal)
  if (who === null || !actsFor(who, tenant)) return DENIED
  if (
    who.column === 'work' &&
    target.kind === 'session' &&
    who.principal.work.work !== target.session &&
    !readsAcrossTenant(SESSION_POLICY[operation].work)
  )
    return DENIED

  const cell = resolveCell(SESSION_POLICY[operation][who.column], facts.branch)
  const planned = planCell(cell, who, {
    member: principal => {
      const resource = sessionResource(target)
      if (tenant === null || resource === null) return null
      return {
        access: { principal, tenant },
        operation: { owner: 'session', name: operation },
        target: { owner: 'session', ...resource },
        arguments: facts.arguments,
        requires: [],
        permit: null,
      }
    },
    matrix: (purpose, principal) => sessionMatrixRequest(purpose, principal, target, tenant, facts),
  })
  return qualifiedWrite(planned, target, who)
}

function sessionResource(
  target: SessionAccessRequest<unknown>['target'],
): Readonly<{ kind: string; key: string }> | null {
  switch (target.kind) {
    case 'session':
      return { kind: 'session', key: target.session }
    case 'tenant':
      return { kind: 'tenant', key: tenantText(target.tenant) }
    default:
      return null
  }
}

function sessionMatrixRequest(
  purpose: SystemPurpose,
  principal: SystemPrincipal,
  target: SessionAccessRequest<unknown>['target'],
  tenant: TenantId | null,
  facts: CommandFacts,
): SystemActionRequest | null {
  const base = { principal, scope: 'system', arguments: noArguments() } as const
  switch (purpose) {
    case 'resident-references':
      if (target.kind !== 'resident-references') return null
      return {
        ...base,
        operation: { owner: 'session', name: 'references' },
        target: {
          kind: 'system',
          resource: { owner: 'session', kind: 'resident-references', key: target.key },
        },
      }
    case 'released-scopes':
      if (target.kind !== 'released-scopes') return null
      return {
        ...base,
        operation: { owner: 'session', name: 'releasedScopes' },
        target: {
          kind: 'system',
          resource: { owner: 'session', kind: 'released-scopes', key: 'deployment' },
        },
      }
    case 'pending-sessions':
      if (target.kind !== 'tenant') return null
      return {
        ...base,
        operation: { owner: 'session', name: 'pending' },
        target: {
          kind: 'tenant',
          tenant: target.tenant,
          resource: { owner: 'session', kind: 'tenant', key: tenantText(target.tenant) },
        },
      }
    case 'scope-release-receive':
      if (target.kind !== 'session' || tenant === null || facts.fact === null) return null
      return {
        ...base,
        operation: { owner: 'session', name: 'receive' },
        arguments: effectiveArgumentsOf(facts.fact),
        target: {
          kind: 'tenant',
          tenant,
          resource: { owner: 'session', kind: 'session', key: target.session },
        },
      }
    default:
      return null
  }
}

function intakeSubjectOf(principal: unknown): IntakeSubject | undefined {
  const who = classify(principal)
  if (who?.column === 'login') return { kind: 'member' }
  if (who?.column === 'system') return { kind: 'system', component: who.principal.component }
  return undefined
}

export function createSessionAccessCheck(ports: AccessPorts): SessionAccessCheck<unknown> {
  const check: SessionAccessCheck<unknown>['check'] = async input => {
    const decision = await answer(() => planSession(input), ports)
    const subject =
      decision.kind === 'allowed' ? intakeSubjectOf(input.access.principal) : undefined
    return subject === undefined ? decision : Object.freeze({ ...decision, subject })
  }
  return Object.freeze({ check })
}

type AgentRequest = Parameters<AgentAccessCheck<unknown>['check']>[0]

function agentPrincipalOf(operation: string, principal: unknown): ReturnType<typeof classify> {
  const who = classify(principal)
  if (who !== null || operation !== 'receive-result') return who
  const model = classOf(principal)
  return model?.kind === 'host' ? { column: 'work', principal: model.principal } : null
}

function planAgent(input: AgentRequest): Plan {
  const { access, operation, target } = input
  if (typeof operation !== 'string' || !Object.hasOwn(AGENT_POLICY, operation)) return DENIED
  if (operation.startsWith('compaction.') !== (target.kind === 'compaction')) return DENIED
  if (
    operation === 'read-message-handoff' &&
    target.kind !== 'execution' &&
    target.kind !== 'input-entry'
  )
    return DENIED
  const who = agentPrincipalOf(operation, access.principal)
  if (who === null || !actsFor(who, access.tenant)) return DENIED
  if (
    who.column === 'work' &&
    target.kind === 'scope' &&
    !(target.scope.owner === SESSION_WORK_OWNER && target.scope.record === who.principal.work.work)
  )
    return DENIED
  const targetKey = canonicalText(target)
  const cell = resolveCell(AGENT_POLICY[operation][who.column], {})
  return planCell(cell, who, {
    member: principal => ({
      access: { principal, tenant: access.tenant },
      operation: { owner: 'agent', name: operation },
      target: { owner: 'agent', kind: target.kind, key: targetKey },
      arguments: noArguments(),
      requires: [],
      permit: null,
    }),
    matrix: (purpose, principal) => agentMatrixRequest(purpose, principal, target, access.tenant),
  })
}

function agentMatrixRequest(
  purpose: SystemPurpose,
  principal: SystemPrincipal,
  target: AgentRequest['target'],
  tenant: TenantId,
): SystemActionRequest | null {
  if (target.kind !== 'instance') return null
  let name: 'publish' | 'quiesce' | 'withdraw'
  switch (purpose) {
    case 'agent-instance-publish':
      name = 'publish'
      break
    case 'agent-instance-quiesce':
      name = 'quiesce'
      break
    case 'agent-instance-withdraw':
      name = 'withdraw'
      break
    default:
      return null
  }
  return {
    principal,
    scope: 'system',
    operation: { owner: 'agent', name },
    target: {
      kind: 'tenant',
      tenant,
      resource: { owner: 'agent', kind: 'instance', key: canonicalText(target.instance) },
    },
    arguments: noArguments(),
  }
}

export function createAgentAccessCheck(ports: AccessPorts): AgentAccessCheck<unknown> {
  const check: AgentAccessCheck<unknown>['check'] = input => answer(() => planAgent(input), ports)
  return Object.freeze({ check })
}
