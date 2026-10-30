// In-process examples of limited consumer mappings on top of the admission check:
// Agent's AgentAccessCheck and ActionAdmission, Tool's access.qualify (ToolAccessGuard of
// @omne-harness/tool and StartCoordinatorAccess of tool-host-local), and Session's
// SessionAccessCheck. Session maps only the explicitly selected membership-only examples below;
// it does not implement the complete Session policies. StartCoordinatorAccess is declared here with the shape of tool-host-local, which is not
// a devDependency.
import { describe, expect, it } from 'vitest'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
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
} from '@omne-harness/agent-contract'
import type {
  SessionAccessCheck,
  SessionAccessDecision,
  SessionAccessRequest,
  SessionCommand,
  DeclarationChange,
  ResidentKey,
} from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  assistantMessage,
  createMemoryInitializationSource,
  createMemorySessionTransactions,
  creation,
  evidence,
  initializationFixtureFacts,
  initializationFixtureGuard,
  operationId,
  sessionId,
} from '@omne-harness/session-contract/testing'
import type { AccessVerdict, ToolAccessGuard } from '@omne-harness/tool'
import { decodeToolCallId, type ToolCallId } from '@omne-harness/tool-contract'
import {
  decisionEvidence,
  noArguments,
  effectiveArgumentsOf,
  referenceAdmissionCheck,
  type AdmissionCheck,
  type AdmissionDecision,
  type AdmissionTarget,
  type DurableEvidence,
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
      return { kind: 'allowed', evidence: decision.evidence }
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
      return { kind: 'allow', evidence: decision.evidence }
    case 'denied':
      return { kind: 'deny', reason: decision.reason, evidence: decision.evidence }
    case 'unavailable':
      return { kind: 'unavailable', diagnostic: decision.diagnostic }
  }
}

/**
 * AU-05: a remark on the official admission card is the person's only valid handling, but it is
 * not an approval. The port answers deny with `human-guidance`; the verbatim text goes back to
 * the original work owner as guidance, not into the evidence.
 */
function denyHumanGuidance(card: DurableEvidence, answer: DurableEvidence): AgentAdmissionDecision {
  return {
    kind: 'deny',
    reason: 'human-guidance',
    evidence: decisionEvidence('admission/agent/admit-action', answer.revision, {
      kind: 'denied',
      reason: 'human-guidance',
      card,
      answer,
    }),
  }
}

function actionAdmission(check: AdmissionCheck): ActionAdmission<Principal> {
  return {
    admit: async input => {
      if (input.decision?.answer.kind === 'remark')
        return succeed(denyHumanGuidance(input.decision.card, input.decision.answer.evidence))
      if (input.permissions.length > 0 || input.decision !== null)
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

type TenantSessionRequest = Exclude<
  SessionAccessRequest<Principal>,
  { operation: 'references' | 'releasedScopes' }
>

function sessionTargetMatches(input: TenantSessionRequest): boolean {
  const { target, access } = input
  if (target.kind === 'tenant') return tenantEquals(target.tenant, access.tenant)
  if (!('command' in target)) return true
  return (
    target.command.kind === input.operation &&
    target.command.input.session === target.session &&
    tenantEquals(target.command.input.tenant, access.tenant)
  )
}

/**
 * These examples explicitly choose membership-only qualification for history.begin/history.next
 * and recordMessage. Allowed does not replace caller-class, participation, message admission,
 * source, or joint-commit checks. Every other operation needs a policy this example does not supply.
 */
function sessionAccessCheck(check: AdmissionCheck): SessionAccessCheck<Principal> {
  return {
    check: async input => {
      if (input.operation === 'references' || input.operation === 'releasedScopes')
        return { kind: 'unavailable', diagnostic: 'system authorization is not installed' }
      if (!sessionTargetMatches(input)) return { kind: 'denied' }
      if (input.operation === 'change') {
        const declaration = input.target.command.input.declaration
        if (
          declaration.kind === 'permission-mode' ||
          declaration.kind === 'collaboration-mode' ||
          declaration.kind === 'environment-mode'
        )
          return {
            kind: 'unavailable',
            diagnostic: 'the Session mode policy interpreter is not installed',
          }
      }
      if (
        input.operation !== 'history.begin' &&
        input.operation !== 'history.next' &&
        input.operation !== 'recordMessage'
      )
        return { kind: 'unavailable', diagnostic: 'the Session operation policy is not installed' }
      const { access, operation, target } = input
      return toSessionDecision(
        await check.check({
          access,
          operation: { owner: 'session', name: operation },
          target: { owner: 'session', kind: target.kind, key: target.session },
          arguments: 'command' in target ? effectiveArgumentsOf(target.command) : noArguments(),
          requires: [],
          permit: null,
        }),
      )
    },
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

const EVIDENCE: DurableEvidence = { owner: 'agent', record: 'exec_1', revision: '1', digest: 'd' }

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
    permissions: [],
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
        permissions: [
          {
            need: 'permissions',
            schema: { owner: 'assets', name: 'permissions', revision: '1', digest: 'd' },
            value: { kind: 'object', entries: [] },
            source: EVIDENCE,
          },
        ],
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

  // Red when a remark on the official admission card is read as a grant, or is turned away as
  // "no interpreter": AU-05 says a remark is not an approval, the port answers deny/human-guidance.
  it('denies with human-guidance when the card reply is a remark, with admission evidence', async () => {
    const { principals, actions } = installed()
    const card = { ...EVIDENCE, record: 'card-for-act_1' }
    const deny = await actions.admit({
      ...admitInput(principals.actingForAdmin, adminTenant()),
      decision: {
        card,
        answer: {
          kind: 'remark',
          text: '先看一下 README',
          evidence: { ...EVIDENCE, record: 'remark_1' },
        },
      },
    })
    expect(deny).toMatchObject({ ok: { kind: 'deny', reason: 'human-guidance' } })
    if ('failure' in deny || deny.ok.kind !== 'deny') return
    expect(deny.ok.evidence.owner).toBe('authorization')
    expect(deny.ok.evidence.record).toBe('admission/agent/admit-action')
    expect(deny.ok.evidence.digest).toMatch(/^[0-9a-f]{64}$/)
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

const SESSION = sessionId('ses_1')

function recordMessageRequest(
  principal: Principal,
): Extract<SessionAccessRequest<Principal>, { operation: 'recordMessage' }> {
  const command = {
    kind: 'recordMessage',
    input: {
      tenant: adminTenant(),
      session: SESSION,
      operation: operationId('record'),
      participation: {
        execution: 'exec_1',
        operation: 'agent_message_1',
        joint: 'message',
        written: 'entry_1',
        handover: evidence('handover'),
      },
      value: {
        message: assistantMessage('saved message'),
        source: evidence('source'),
        admission: evidence('admission'),
        consumption: null,
      },
    },
  } satisfies SessionCommand
  return {
    access: { principal, tenant: command.input.tenant },
    operation: 'recordMessage',
    target: { kind: 'session', session: SESSION, command },
  }
}

function changeRequest(
  principal: Principal,
  declaration: DeclarationChange,
): Extract<SessionAccessRequest<Principal>, { operation: 'change' }> {
  return {
    access: { principal, tenant: adminTenant() },
    operation: 'change',
    target: {
      kind: 'session',
      session: SESSION,
      command: {
        kind: 'change',
        input: {
          tenant: adminTenant(),
          session: SESSION,
          operation: operationId('change'),
          declaration,
        },
      },
    },
  }
}

describe('SessionAccessCheck through the admission check', () => {
  it('maps the selected membership-only read/write examples and rechecks after revocation', async () => {
    const { principals, table, session } = installed()
    const access = { principal: principals.actingForAdmin, tenant: adminTenant() }
    const target = { kind: 'session', session: SESSION } as const
    const read = await session.check({ access, operation: 'history.begin', target })
    const writeInput = recordMessageRequest(principals.actingForAdmin)
    const write = await session.check(writeInput)
    expect(read.kind).toBe('allowed')
    expect(write.kind).toBe('allowed')
    if (read.kind !== 'allowed' || write.kind !== 'allowed') throw new Error('expected allowed')
    expect(read.evidence.record).toBe('admission/session/history.begin')
    expect(write.evidence.record).toBe('admission/session/recordMessage')
    expect(read.evidence.owner).toBe('authorization')
    expect(write.evidence.digest).toMatch(/^[0-9a-f]{64}$/)
    table.leave(adminTenant())
    await expect(session.check({ access, operation: 'history.next', target })).resolves.toEqual({
      kind: 'denied',
    })
    await expect(session.check(writeInput)).resolves.toEqual({ kind: 'denied' })
    table.fail('directory down')
    await expect(session.check({ access, operation: 'history.next', target })).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'directory down',
    })
    expect(table.reads()).toBe(5)
  })

  it('passes the real access and binds the decision evidence to the original command', async () => {
    const principals = issued()
    const table = standingTable()
    table.join(adminTenant(), DEFAULT_ROLES.member)
    const check = referenceAdmissionCheck({
      verifier: principals.authority.verifier,
      standing: table.source,
      permits: null,
    })
    const received: Parameters<AdmissionCheck['check']>[0][] = []
    const session = sessionAccessCheck({
      check: input => {
        received.push(input)
        return check.check(input)
      },
    })
    const input = recordMessageRequest(principals.actingForAdmin)
    const first = await session.check(input)
    const command = input.target.command
    const second = await session.check({
      ...input,
      target: {
        ...input.target,
        command: {
          ...command,
          input: {
            ...command.input,
            value: { ...command.input.value, message: assistantMessage('changed message') },
          },
        },
      },
    })
    expect(received[0]?.access.principal).toBe(input.access.principal)
    expect(received[0]?.access.tenant).toBe(input.access.tenant)
    expect(received[0]?.target).toEqual({ owner: 'session', kind: 'session', key: SESSION })
    expect(received[0]?.arguments).toEqual(effectiveArgumentsOf(command))
    if (first.kind !== 'allowed' || second.kind !== 'allowed') throw new Error('expected allowed')
    expect(first.evidence.digest).not.toBe(second.evidence.digest)
  })

  it('rejects access/target/command mismatches before reading membership', async () => {
    const { principals, table, session } = installed()
    const input = recordMessageRequest(principals.actingForAdmin)
    await expect(
      session.check({ ...input, target: { ...input.target, session: sessionId('other') } }),
    ).resolves.toEqual({ kind: 'denied' })
    await expect(
      session.check({ ...input, access: { ...input.access, tenant: memberTenant() } }),
    ).resolves.toEqual({ kind: 'denied' })
    await expect(
      session.check({
        access: input.access,
        operation: 'pending',
        target: { kind: 'tenant', tenant: memberTenant() },
      }),
    ).resolves.toEqual({ kind: 'denied' })
    expect(table.reads()).toBe(0)
  })

  it.each([
    { kind: 'permission-mode', value: 'never', authorization: EVIDENCE },
    { kind: 'permission-mode', value: 'auto_permission', authorization: EVIDENCE },
    { kind: 'permission-mode', value: 'bypass-permissions', authorization: EVIDENCE },
    { kind: 'collaboration-mode', value: 'co-work', authorization: EVIDENCE },
    { kind: 'collaboration-mode', value: 'auto-drive', authorization: EVIDENCE },
    {
      kind: 'environment-mode',
      value: { owner: 'environment', name: 'sandbox', revision: '1', digest: 'd' },
      authorization: EVIDENCE,
      setting: EVIDENCE,
    },
  ] satisfies readonly DeclarationChange[])(
    'does not infer mode policy for $kind/$value',
    async declaration => {
      const { principals, table, session } = installed()
      const input = changeRequest(principals.actingForAdmin, declaration)
      await expect(session.check(input)).resolves.toEqual({
        kind: 'unavailable',
        diagnostic: 'the Session mode policy interpreter is not installed',
      })
      expect(table.reads()).toBe(0)
    },
  )

  it('fails closed for an unsupported setting and maintenance operation', async () => {
    const { principals, table, session } = installed()
    await expect(
      session.check(
        changeRequest(principals.actingForAdmin, { kind: 'model', name: 'model', basis: EVIDENCE }),
      ),
    ).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'the Session operation policy is not installed',
    })
    await expect(
      session.check({
        access: { principal: principals.actingForAdmin, tenant: adminTenant() },
        operation: 'loadRecovery',
        target: { kind: 'session', session: SESSION },
      }),
    ).resolves.toMatchObject({ kind: 'unavailable' })
    expect(table.reads()).toBe(0)
  })

  it('does not manufacture tenant access for either system directory', async () => {
    const { principals, table, session } = installed()
    const key = 'resident-1' as ResidentKey
    const access = { principal: principals.coordinator, scope: 'system' } as const
    const requests = [
      { access, operation: 'releasedScopes', target: { kind: 'released-scopes' } },
      { access, operation: 'references', target: { kind: 'resident-references', key } },
    ] satisfies readonly SessionAccessRequest<Principal>[]
    for (const request of requests) {
      await expect(session.check(request)).resolves.toEqual({
        kind: 'unavailable',
        diagnostic: 'system authorization is not installed',
      })
      expect(request.access).not.toHaveProperty('tenant')
    }
    expect(table.reads()).toBe(0)
  })

  it('rejects the same Session identity under a different real tenant and rejects forged principals', async () => {
    const { principals, table, session } = installed()
    table.join(memberTenant(), DEFAULT_ROLES.member)
    const target = { kind: 'session', session: SESSION } as const
    await expect(
      session.check({
        access: { principal: principals.actingForAdmin, tenant: memberTenant() },
        operation: 'history.begin',
        target,
      }),
    ).resolves.toEqual({ kind: 'denied' })
    await expect(
      session.check({
        access: { principal: { ...principals.actingForAdmin }, tenant: adminTenant() },
        operation: 'history.next',
        target,
      }),
    ).resolves.toEqual({ kind: 'denied' })
  })

  it('keeps source exceptions unavailable and does not disclose the exception message', async () => {
    const principals = issued()
    const session = sessionAccessCheck(
      referenceAdmissionCheck({
        verifier: principals.authority.verifier,
        standing: {
          read: () => {
            throw new Error('private source detail')
          },
        },
        permits: null,
      }),
    )
    await expect(
      session.check({
        access: { principal: principals.actingForAdmin, tenant: adminTenant() },
        operation: 'history.next',
        target: { kind: 'session', session: SESSION },
      }),
    ).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'the tenant standing source threw an exception; its message is not reported',
    })
  })

  it('decides each history read of the real transaction port once, at its execution point', async () => {
    const { principals, table, session } = installed()
    const initialization = createMemoryInitializationSource()
    const asked: string[] = []
    // The port requires one check. `create` is outside this reference policy, so the fixture
    // answers it itself; every other request goes to the adapter under test.
    const port = createMemorySessionTransactions<Principal>({
      initialization,
      accessCheck: {
        check: async request => {
          asked.push(request.operation)
          return request.operation === 'create'
            ? { kind: 'allowed', evidence: evidence('fixture/create') }
            : session.check(request)
        },
      },
    })
    const access = { principal: principals.actingForAdmin, tenant: adminTenant(), session: SESSION }
    const command = {
      kind: 'create',
      input: {
        tenant: access.tenant,
        session: SESSION,
        operation: operationId('create'),
        creation: creation(),
      },
    } satisfies SessionCommand
    initialization.controls.register(
      command,
      initializationFixtureGuard(
        initializationFixtureFacts(command, null, adoptedInitializationFixture(command)),
      ),
    )
    const guards = await initialization.prepare(command)
    if ('failure' in guards) throw new Error('fixture preparation failed')
    expect(await port.commit({ access, command, guards: guards.ok })).toHaveProperty('ok')
    const rows = port.controls.entriesOf(access.tenant, SESSION)
    const page = { ...access, kinds: [], from: null, direction: 'forward' as const, pageBytes: 1 }
    const first = await port.history.begin(page)
    if ('failure' in first || first.ok.next === null) throw new Error('expected a first page')
    expect(table.reads()).toBe(1)
    table.leave(adminTenant())
    expect(await port.history.next({ ...access, cursor: first.ok.next })).toEqual({
      failure: { kind: 'denied', action: 'history.next' },
    })
    table.fail('directory down')
    expect(await port.history.begin(page)).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('directory down') },
    })
    expect(table.reads()).toBe(3)
    expect(asked).toEqual(['create', 'history.begin', 'history.next', 'history.begin'])
    expect(port.controls.entriesOf(access.tenant, SESSION)).toEqual(rows)
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
          operation: 'history.begin',
          target: { kind: 'session', session: SESSION },
        })
      ).kind,
    ).toBe('unavailable')
  })
})
