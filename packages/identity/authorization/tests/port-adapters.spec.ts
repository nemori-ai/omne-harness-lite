// In-process examples of limited consumer mappings on top of the admission check:
// Agent's AgentAccessCheck and ActionAdmission, Tool's access.qualify (ToolAccessGuard of
// @omne-harness/tool and StartCoordinatorAccess of tool-host-local), and Session's
// SessionAccessCheck. The local Session model does not prove compatibility with a public Session
// interface. StartCoordinatorAccess is declared here with the shape of tool-host-local, which is not
// a devDependency.
import { describe, expect, it } from 'vitest'
import type { Access, TenantId } from '@omne-harness/legal-identity'
import type { Principal } from '@omne-harness/identity'
import { succeed } from '@omne-harness/operation-result'
import {
  decodeActionId,
  decodeAgentExecutionId,
  decodeAgentInstanceId,
  decodeExecutionAttachmentId,
  decodePassageId,
  type Action,
  type ActionAdmission,
  type AdmissionDecision as AgentAdmissionDecision,
  type AgentAccessCheck,
  type AgentAccessDecision,
  type AgentAccessTarget,
  type Authority,
  type Evidence as AgentEvidence,
} from '@omne-harness/agent-contract'
import type { AccessVerdict, ToolAccessGuard } from '@omne-harness/tool'
import { decodeToolCallId, type ToolCallId } from '@omne-harness/tool-contract'
import {
  noArguments,
  effectiveArgumentsOf,
  referenceAdmissionCheck,
  type AdmissionCheck,
  type AdmissionDecision,
  type AdmissionTarget,
  type EvidenceRef,
} from '@omne-harness/authorization'
import {
  DEFAULT_ROLES,
  adminTenant,
  issued,
  memberTenant,
  standingTable,
  type Issued,
  type StandingTable,
} from './support.ts'

// ---------------------------------------------------------------------------------------------
// The adapters

/** Maps the four members of an evidence one by one; the shapes agree, the types stay the owners'. */
function agentEvidence(evidence: EvidenceRef): AgentEvidence {
  return {
    owner: evidence.owner,
    record: evidence.record,
    revision: evidence.revision,
    digest: evidence.digest,
  }
}

function agentTarget(target: AgentAccessTarget): AdmissionTarget {
  switch (target.kind) {
    case 'scope':
      return {
        owner: 'agent',
        kind: 'scope',
        key: `${target.scope.owner}/${target.scope.record}@${target.scope.revision}`,
      }
    case 'instance':
      return { owner: 'agent', kind: 'instance', key: target.instance }
    case 'execution':
      return { owner: 'agent', kind: 'execution', key: `${target.instance}/${target.execution}` }
  }
}

function toAgentAccessDecision(decision: AdmissionDecision): AgentAccessDecision {
  switch (decision.kind) {
    case 'allowed':
      return { kind: 'allowed', evidence: agentEvidence(decision.evidence) }
    case 'denied':
      return { kind: 'denied' }
    case 'unavailable':
      return { kind: 'unavailable', diagnostic: decision.diagnostic }
  }
}

function agentAccessCheck(check: AdmissionCheck): AgentAccessCheck<Principal> {
  return {
    check: async ({ access, operation, target }) =>
      toAgentAccessDecision(
        await check.check({
          access,
          operation: { owner: 'agent', name: operation },
          target: agentTarget(target),
          arguments: noArguments(),
          requires: [],
          permit: null,
        }),
      ),
  }
}

/** Only the three first-shape conclusions; `need-decision` is not produced here. */
function toAgentAdmissionDecision(decision: AdmissionDecision): AgentAdmissionDecision {
  switch (decision.kind) {
    case 'allowed':
      return { kind: 'allow', evidence: agentEvidence(decision.evidence) }
    case 'denied':
      return { kind: 'deny', reason: decision.reason, evidence: agentEvidence(decision.evidence) }
    case 'unavailable':
      return { kind: 'unavailable', diagnostic: decision.diagnostic }
  }
}

function actionAdmission(check: AdmissionCheck): ActionAdmission<Principal> {
  return {
    admit: async input => {
      if (input.permissions !== null || input.decision !== null)
        return succeed({
          kind: 'unavailable',
          diagnostic: 'permission and decision interpreters are not installed',
        })
      return succeed(
        toAgentAdmissionDecision(
          await check.check({
            access: { principal: input.principal, tenant: input.tenant },
            operation: { owner: 'agent', name: 'admit-action' },
            target: {
              owner: 'agent',
              kind: 'action',
              key: `${input.execution}/${input.passage}/${input.action}`,
            },
            // The fixed text the action will run with; a permit is bound to its digest.
            arguments: effectiveArgumentsOf(input.effectiveArguments),
            requires: [],
            permit: null,
          }),
        ),
      )
    },
  }
}

function toAccessVerdict(decision: AdmissionDecision): AccessVerdict {
  switch (decision.kind) {
    case 'allowed':
      return { kind: 'allowed' }
    case 'denied':
      return { kind: 'denied', reason: decision.reason }
    case 'unavailable':
      return { kind: 'unavailable', diagnostic: decision.diagnostic }
  }
}

function toolAccessGuard(check: AdmissionCheck): ToolAccessGuard<Principal> {
  return {
    qualify: async ({ principal, tenant, call, action }) =>
      toAccessVerdict(
        await check.check({
          access: { principal, tenant },
          operation: { owner: 'tool', name: action },
          target: { owner: 'tool', kind: 'call', key: call },
          arguments: noArguments(),
          requires: [],
          permit: null,
        }),
      ),
  }
}

/** The shape of tool-host-local's StartCoordinatorAccess: `invalidate` is asked without a call. */
interface StartCoordinatorAccess<P> {
  qualify(
    input: Readonly<{
      principal: P
      tenant: TenantId
      call: ToolCallId | null
      action: 'start' | 'invalidate'
    }>,
  ): Promise<AccessVerdict>
}

function startCoordinatorAccess(check: AdmissionCheck): StartCoordinatorAccess<Principal> {
  return {
    qualify: async ({ principal, tenant, call, action }) =>
      toAccessVerdict(
        await check.check({
          access: { principal, tenant },
          operation: { owner: 'tool', name: action },
          target:
            call === null
              ? { owner: 'tool', kind: 'start-guards', key: 'tenant' }
              : { owner: 'tool', kind: 'call', key: call },
          arguments: noArguments(),
          requires: [],
          permit: null,
        }),
      ),
  }
}

/** This task's local Session adapter model. Public Session interface compatibility is still unverified. */
type SessionAccessOperation = 'read-history' | 'append' | 'change' | 'begin' | 'next'
type SessionAccessTarget = Readonly<{ kind: 'session'; session: string }>
type SessionAccessDecision =
  | Readonly<{ kind: 'allowed'; evidence: EvidenceRef }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
interface SessionAccessCheck<P> {
  check(
    input: Readonly<{
      access: Access<P>
      operation: SessionAccessOperation
      target: SessionAccessTarget
    }>,
  ): Promise<SessionAccessDecision>
}

function toSessionDecision(decision: AdmissionDecision): SessionAccessDecision {
  switch (decision.kind) {
    case 'allowed':
      return { kind: 'allowed', evidence: decision.evidence }
    case 'denied':
      return { kind: 'denied' }
    case 'unavailable':
      return { kind: 'unavailable', diagnostic: decision.diagnostic }
  }
}

function sessionAccessCheck(check: AdmissionCheck): SessionAccessCheck<Principal> {
  return {
    check: async ({ access, operation, target }) =>
      toSessionDecision(
        await check.check({
          access,
          operation: { owner: 'session', name: operation },
          target: { owner: 'session', kind: target.kind, key: target.session },
          arguments: noArguments(),
          requires: [],
          permit: null,
        }),
      ),
  }
}

// ---------------------------------------------------------------------------------------------
// Fixtures

function decoded<T, F>(result: { ok: T } | { failure: F }, what: string): T {
  if ('failure' in result) throw new Error(`fixture ${what} did not decode`)
  return result.ok
}

type Original = Action['original']

const isBlockId = (text: string): text is Original['id'] => text.length > 0

function blockId(text: string): Original['id'] {
  if (!isBlockId(text)) throw new Error('fixture block id is empty')
  return text
}

const EVIDENCE: AgentEvidence = { owner: 'agent', record: 'exec_1', revision: '1', digest: 'd' }

function authority(): Authority {
  return {
    execution: decoded(decodeAgentExecutionId('exec_1'), 'execution'),
    executionAttachment: decoded(decodeExecutionAttachmentId('att_1'), 'attachment'),
    instance: decoded(decodeAgentInstanceId('inst_1'), 'instance'),
    generation: '1',
    source: EVIDENCE,
  }
}

function admitInput(principal: Principal, tenant: TenantId, effectiveArguments = '{}') {
  const original: Original = {
    kind: 'tool_call',
    id: blockId('blk_1'),
    visibility: { toHuman: true, toModel: true },
    callId: 'call_1',
    name: 'bash',
    arguments: { kind: 'object', entries: [] },
  }
  return {
    principal,
    tenant,
    advance: authority(),
    execution: decoded(decodeAgentExecutionId('exec_1'), 'execution'),
    passage: decoded(decodePassageId('pas_1'), 'passage'),
    action: decoded(decodeActionId('act_1'), 'action'),
    original,
    effectiveArguments,
    definition: { owner: 'assets', name: 'bash', revision: '1', digest: 'd' },
    permissions: null,
    decision: null,
  }
}

const CALL = decoded(decodeToolCallId('call_1'), 'call')

type Installed = Readonly<{
  principals: Issued
  table: StandingTable
  agent: AgentAccessCheck<Principal>
  actions: ActionAdmission<Principal>
  tool: ToolAccessGuard<Principal>
  starts: StartCoordinatorAccess<Principal>
  session: SessionAccessCheck<Principal>
}>

function installed(): Installed {
  const principals = issued()
  const table = standingTable()
  table.join(adminTenant(), DEFAULT_ROLES.superAdmin)
  const check = referenceAdmissionCheck({
    verifier: principals.authority.verifier,
    standing: table.source,
    permits: null,
  })
  return {
    principals,
    table,
    agent: agentAccessCheck(check),
    actions: actionAdmission(check),
    tool: toolAccessGuard(check),
    starts: startCoordinatorAccess(check),
    session: sessionAccessCheck(check),
  }
}

const executionTarget = (): AgentAccessTarget => ({
  kind: 'execution',
  instance: decoded(decodeAgentInstanceId('inst_1'), 'instance'),
  execution: decoded(decodeAgentExecutionId('exec_1'), 'execution'),
})

// ---------------------------------------------------------------------------------------------
// The four ports, through the same check

describe('AgentAccessCheck through the admission check', () => {
  it('allows with evidence, denies after revocation, and is unavailable on an outage', async () => {
    const { principals, table, agent } = installed()
    const input = {
      access: { principal: principals.actingForAdmin, tenant: adminTenant() },
      operation: 'invoke' as const,
      target: executionTarget(),
    }
    const allowed = await agent.check(input)
    expect(allowed.kind).toBe('allowed')
    if (allowed.kind !== 'allowed') return
    expect(allowed.evidence.owner).toBe('authorization')
    expect(allowed.evidence.record).toBe('admission/agent/invoke')
    expect(allowed.evidence.digest).toMatch(/^[0-9a-f]{64}$/)
    table.leave(adminTenant())
    await expect(agent.check(input)).resolves.toEqual({ kind: 'denied' })
    table.fail('directory down')
    await expect(agent.check(input)).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'directory down',
    })
  })

  it('denies a system principal and a hand-built principal', async () => {
    const { principals, agent } = installed()
    const target = executionTarget()
    await expect(
      agent.check({
        access: { principal: principals.coordinator, tenant: adminTenant() },
        operation: 'read',
        target,
      }),
    ).resolves.toEqual({ kind: 'denied' })
    await expect(
      agent.check({
        access: { principal: { ...principals.actingForAdmin }, tenant: adminTenant() },
        operation: 'read',
        target,
      }),
    ).resolves.toEqual({ kind: 'denied' })
  })
})

describe('ActionAdmission through the admission check', () => {
  it.each([
    {
      name: 'permissions without an interpreter',
      patch: {
        permissions: {
          schema: { owner: 'assets', name: 'permissions', revision: '1', digest: 'd' },
          value: { kind: 'object', entries: [] },
          source: EVIDENCE,
        },
      },
    },
    {
      name: 'an answer belonging to another action',
      patch: {
        decision: {
          card: { ...EVIDENCE, record: 'card-for-act_other' },
          answer: {
            kind: 'chosen',
            option: 'approve',
            value: null,
            evidence: { ...EVIDENCE, record: 'answer-for-act_other' },
          },
        },
      },
    },
    {
      name: 'an answer belonging to another card',
      patch: {
        decision: {
          card: { ...EVIDENCE, record: 'card_1' },
          answer: {
            kind: 'chosen',
            option: 'approve',
            value: null,
            evidence: { ...EVIDENCE, record: 'answer-for-card_2' },
          },
        },
      },
    },
  ] satisfies readonly {
    name: string
    patch: Partial<Parameters<ActionAdmission<Principal>['admit']>[0]>
  }[])('does not allow $name', async ({ patch }) => {
    const { principals, actions } = installed()
    const input = admitInput(principals.actingForAdmin, adminTenant())
    await expect(actions.admit({ ...input, ...patch })).resolves.toEqual({
      ok: {
        kind: 'unavailable',
        diagnostic: 'permission and decision interpreters are not installed',
      },
    })
  })

  it('allows, denies with a reason, and is unavailable, each with the agent decision shape', async () => {
    const { principals, table, actions } = installed()
    const input = admitInput(principals.actingForAdmin, adminTenant())
    const allow = await actions.admit(input)
    expect(allow).toMatchObject({ ok: { kind: 'allow' } })
    if ('failure' in allow || allow.ok.kind !== 'allow') return
    expect(allow.ok.evidence.record).toBe('admission/agent/admit-action')
    table.leave(adminTenant())
    const deny = await actions.admit(input)
    expect(deny).toMatchObject({ ok: { kind: 'deny', reason: 'not-member' } })
    table.fail('directory down')
    const unavailable = await actions.admit(input)
    expect(unavailable).toMatchObject({ ok: { kind: 'unavailable', diagnostic: 'directory down' } })
  })

  it('maps the effective arguments: a rewrite changes the evidence of the allowed decision', async () => {
    const { principals, actions } = installed()
    const first = await actions.admit(
      admitInput(principals.actingForAdmin, adminTenant(), '{"a":1}'),
    )
    const rewritten = await actions.admit(
      admitInput(principals.actingForAdmin, adminTenant(), '{"a":2}'),
    )
    if ('failure' in first || 'failure' in rewritten) throw new Error('fixture')
    if (first.ok.kind !== 'allow' || rewritten.ok.kind !== 'allow') throw new Error('fixture')
    expect(first.ok.evidence.digest).not.toBe(rewritten.ok.evidence.digest)
    expect(first.ok.evidence.record).toBe(rewritten.ok.evidence.record)
  })

  it('denies an acting principal used in another tenant', async () => {
    const { principals, actions } = installed()
    const deny = await actions.admit(admitInput(principals.actingForAdmin, memberTenant()))
    expect(deny).toMatchObject({ ok: { kind: 'deny', reason: 'tenant-mismatch' } })
  })
})

describe("Tool's access.qualify through the admission check", () => {
  it('answers the ledger guard with allowed, denied with a reason, and unavailable', async () => {
    const { principals, table, tool } = installed()
    const input = {
      principal: principals.actingForAdmin,
      tenant: adminTenant(),
      call: CALL,
      action: 'admit' as const,
    }
    await expect(tool.qualify(input)).resolves.toEqual({ kind: 'allowed' })
    table.leave(adminTenant())
    await expect(tool.qualify(input)).resolves.toEqual({ kind: 'denied', reason: 'not-member' })
    table.fail('directory down')
    await expect(tool.qualify(input)).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'directory down',
    })
  })

  it('denies a forged tenant of the right shape', async () => {
    const { principals, tool } = installed()
    const forged: TenantId = {
      name: 'TenantId',
      organization: { name: 'OrganizationId', text: 'org_abcdefghjkmnpqrstvwxyz2345' },
      account: { name: 'AccountId', text: 'acc_abcdefghjkmnpqrstvwxyz2345' },
    }
    await expect(
      tool.qualify({
        principal: principals.actingForAdmin,
        tenant: forged,
        call: CALL,
        action: 'read-content',
      }),
    ).resolves.toEqual({ kind: 'denied', reason: 'tenant-mismatch' })
  })

  it('answers the start coordinator for a call and for an invalidation without a call', async () => {
    const { principals, table, starts } = installed()
    const principal = principals.actingForAdmin
    await expect(
      starts.qualify({ principal, tenant: adminTenant(), call: CALL, action: 'start' }),
    ).resolves.toEqual({ kind: 'allowed' })
    await expect(
      starts.qualify({ principal, tenant: adminTenant(), call: null, action: 'invalidate' }),
    ).resolves.toEqual({ kind: 'allowed' })
    table.leave(adminTenant())
    await expect(
      starts.qualify({ principal, tenant: adminTenant(), call: null, action: 'invalidate' }),
    ).resolves.toEqual({ kind: 'denied', reason: 'not-member' })
  })
})

describe('SessionAccessCheck (local adapter model) through the admission check', () => {
  it('allows the read and write paths, denies after revocation, and is unavailable on an outage', async () => {
    const { principals, table, session } = installed()
    const access = { principal: principals.actingForAdmin, tenant: adminTenant() }
    const target: SessionAccessTarget = { kind: 'session', session: 'ses_1' }
    const read = await session.check({ access, operation: 'read-history', target })
    expect(read.kind).toBe('allowed')
    const write = await session.check({ access, operation: 'append', target })
    expect(write.kind).toBe('allowed')
    if (read.kind !== 'allowed' || write.kind !== 'allowed') return
    expect(read.evidence.record).toBe('admission/session/read-history')
    expect(write.evidence.record).toBe('admission/session/append')
    table.leave(adminTenant())
    await expect(session.check({ access, operation: 'change', target })).resolves.toEqual({
      kind: 'denied',
    })
    table.fail('directory down')
    await expect(session.check({ access, operation: 'next', target })).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'directory down',
    })
  })
})

describe('across the four ports', () => {
  it('never turns an unavailable fact into a permission', async () => {
    const { principals, table, agent, actions, tool, session } = installed()
    table.fail('directory down')
    const principal = principals.actingForAdmin
    const tenant = adminTenant()
    expect(
      (
        await agent.check({
          access: { principal, tenant },
          operation: 'invoke',
          target: executionTarget(),
        })
      ).kind,
    ).toBe('unavailable')
    expect(await actions.admit(admitInput(principal, tenant))).toMatchObject({
      ok: { kind: 'unavailable' },
    })
    expect((await tool.qualify({ principal, tenant, call: CALL, action: 'admit' })).kind).toBe(
      'unavailable',
    )
    expect(
      (
        await session.check({
          access: { principal, tenant },
          operation: 'read-history',
          target: { kind: 'session', session: 'ses_1' },
        })
      ).kind,
    ).toBe('unavailable')
  })
})
