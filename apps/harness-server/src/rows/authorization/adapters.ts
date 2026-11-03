// The access checks of the `authorization` row (DP-4 §3.4, §3.5; D-AUTH r4 §4.7). Each check turns
// one request into a plan before its first await: the request is copied, bound, classified by the
// shape of its principal and resolved against the policy table. The plan is a denial, an
// `AdmissionCheck` input (tenant admission) or a `SystemActionRequest` (system matrix). Only then
// the dependency is called. The shape of a principal only picks the column; the verifier inside the
// dependency decides whether the principal is trusted. A dependency that throws or answers outside
// its contract gives `unavailable`, never `denied` or `allowed`. Exception text is not reported.
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
import type { AgentAccessCheck, AgentAccessDecision } from '@omne-harness/agent-contract'
import type { ActingForTenantPrincipal, SystemPrincipal } from '@omne-harness/identity'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type {
  MutationName,
  SessionAccessCheck,
  SessionAccessDecision,
  SessionAccessRequest,
} from '@omne-harness/session-contract'
import { resolveCell, type BranchInput, type ResolvedCell, type SystemPurpose } from './cells.ts'
import { AGENT_POLICY } from './agent-policy.ts'
import { SESSION_POLICY } from './session-policy.ts'

import { classify, SESSION_WORK_OWNER } from './principals.ts'
export { LOGIN_WORK_OWNER, SESSION_WORK_OWNER } from './principals.ts'
export { createActionAdmission } from './action-admission.ts'
export { createToolAccessGuard } from './tool-access.ts'

/** The two dependencies of both checks. Both read again on every call. */
export type AccessPorts = Readonly<{
  admission: AdmissionCheck
  systemActions: SystemActionAuthorization
}>

/** The two access checks answer in the same three kinds. */
type Verdict = SessionAccessDecision & AgentAccessDecision

type Plan =
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
  | Readonly<{ kind: 'member'; input: AdmissionInput }>
  | Readonly<{ kind: 'matrix'; request: SystemActionRequest }>

const DENIED: Plan = Object.freeze({ kind: 'denied' })

function tenantText(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new TypeError('the tenant is not a minted tenant')
  return encoded.value
}

/** The tenant of an acting principal against the tenant of the access (policy draft §3 step 4). */
function actsFor(who: NonNullable<ReturnType<typeof classify>>, tenant: TenantId | null): boolean {
  if (who.column === 'system') return true
  return tenant !== null && tenantEquals(who.principal.tenant, tenant)
}

/** What a policy cell needs from the request: the tenant admission input or the matrix request. */
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
    case 'deny-pending':
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

/** Both authorization ports answer with this shape; every other kind is outside the contract. */
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

async function execute(plan: Plan, ports: AccessPorts): Promise<Verdict> {
  switch (plan.kind) {
    case 'denied':
      return Object.freeze({ kind: 'denied' })
    case 'unavailable':
      return unavailable(plan.diagnostic)
    case 'member':
      return fromDecision(await ports.admission.check(plan.input))
    case 'matrix':
      return fromDecision(await ports.systemActions.check(plan.request))
    default:
      return unavailable(OUTSIDE_CONTRACT)
  }
}

/**
 * The shared frame of both checks. `plan` runs before the first await, so the request is fixed
 * before anything else can change it. A throw while planning or while calling a dependency is
 * `unavailable` with a fixed diagnostic that names the step.
 */
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

// ---- Session ----------------------------------------------------------------------------------

/** Every mutation of the Session faces. The `satisfies` makes a new `MutationName` a type error here. */
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
  interrupt: true,
  cancelRun: true,
  stopCall: true,
  freeze: true,
  receive: true,
} as const satisfies Readonly<Record<MutationName, true>>

function isMutation(operation: string): operation is MutationName {
  return Object.hasOwn(MUTATIONS, operation)
}

type SessionTargetKind = SessionAccessRequest<unknown>['target']['kind']

/** The target branch each operation is defined on. */
function targetKindOf(operation: SessionAccessRequest<unknown>['operation']): SessionTargetKind {
  switch (operation) {
    case 'pending':
      return 'tenant'
    case 'references':
      return 'resident-references'
    case 'releasedScopes':
      return 'released-scopes'
    default:
      return 'session'
  }
}

/** What the binding step reads from the command of a Session mutation. */
type CommandFacts = Readonly<{
  arguments: EffectiveArguments
  branch: BranchInput
  /** The `scope-release` fact that a system `receive` is bound to; the matrix row takes its digest. */
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
    default:
      return { arguments: args, branch: {}, fact: null }
  }
}

function planSession(input: SessionAccessRequest<unknown>): Plan {
  const { access, operation, target } = input
  // Own-property lookup: `constructor` and `__proto__` are not operations.
  if (typeof operation !== 'string' || !Object.hasOwn(SESSION_POLICY, operation)) return DENIED
  const tenant = 'tenant' in access ? access.tenant : null
  if (target.kind !== targetKindOf(operation)) return DENIED

  // Policy draft §3 step 2: the command, the target and the access name the same operation.
  let facts = NO_COMMAND
  if ('command' in target) {
    const { command } = target
    if (
      !isMutation(operation) ||
      command.kind !== operation ||
      tenant === null ||
      !tenantEquals(command.input.tenant, tenant) ||
      command.input.session !== target.session
    )
      return DENIED
    facts = commandFacts(command)
  } else if (isMutation(operation)) {
    return DENIED
  }
  if (target.kind === 'tenant' && (tenant === null || !tenantEquals(target.tenant, tenant)))
    return DENIED

  // Steps 3 to 5: column, tenant, and the work binding of a work principal on a Session target.
  const who = classify(access.principal)
  if (who === null || !actsFor(who, tenant)) return DENIED
  if (
    who.column === 'work' &&
    target.kind === 'session' &&
    who.principal.work.work !== target.session
  )
    return DENIED

  const cell = resolveCell(SESSION_POLICY[operation][who.column], facts.branch)
  return planCell(cell, who, {
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
}

/** The `kind` and `key` of the target in the vocabulary of the tenant admission check. */
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
      // The agent purposes and the not-yet-implemented session purposes belong to no Session cell.
      return null
  }
}

/** `SessionAccessCheck` over the Session policy table. */
export function createSessionAccessCheck(ports: AccessPorts): SessionAccessCheck<unknown> {
  const check: SessionAccessCheck<unknown>['check'] = input =>
    answer(() => planSession(input), ports)
  return Object.freeze({ check })
}

// ---- Agent ------------------------------------------------------------------------------------

type AgentRequest = Parameters<AgentAccessCheck<unknown>['check']>[0]

function planAgent(input: AgentRequest): Plan {
  const { access, operation, target } = input
  if (typeof operation !== 'string' || !Object.hasOwn(AGENT_POLICY, operation)) return DENIED
  const who = classify(access.principal)
  if (who === null || !actsFor(who, access.tenant)) return DENIED
  // Policy draft §3 step 5: a `scope` target of a work principal is the scope of its own session.
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
  // The three agent instance rows bind a host duty on one instance in one tenant partition.
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

/** `AgentAccessCheck` over the Agent policy table. */
export function createAgentAccessCheck(ports: AccessPorts): AgentAccessCheck<unknown> {
  const check: AgentAccessCheck<unknown>['check'] = input => answer(() => planAgent(input), ports)
  return Object.freeze({ check })
}
