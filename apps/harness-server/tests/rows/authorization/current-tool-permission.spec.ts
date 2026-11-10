import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  principalVerifierKey,
  tenantStandingKey,
  identityClockKey,
  identityGovernanceKey,
} from '@omne-harness/identity/cordis'
import { authorization } from '../../../src/rows/authorization/row.ts'
import { agentPermissionOperation } from '../../../src/rows/authorization/current-tool-permission.ts'
import { CurrentPermissionService } from '../../../src/rows/governance/current-permission-service.ts'
import { ReleaseToolContributionAuthority } from '../../../src/entry/tool-release.ts'
import type { SessionInquiryView } from '@omne-harness/session-adapters'
import { judgeBlockIdentity } from '@omne-harness/content-block'
import { decisionEvidence, effectiveArgumentsOf } from '@omne-harness/authorization'
import {
  decodeAgentExecutionId,
  decodeAgentInstanceId,
  decodeExecutionAttachmentId,
  decodeActionId,
  decodePassageId,
} from '@omne-harness/agent-contract'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import { organizationCodec, tenantCodec } from '@omne-harness/legal-identity'
import type { PermissionBasisReading, PermissionBasisRequest } from '@omne-harness/permissions'
import { loadProductionRelease, TOOL_RELEASE_TENANT } from '../../../src/entry/tool-release.ts'
import {
  createCurrentToolPermission,
  type ToolPermissionAction,
  type ToolPermissionPorts,
} from '../../../src/rows/authorization/current-tool-permission.ts'
import { okOf } from '../../entry/support.ts'

const release = await loadProductionRelease()
if (release.kind !== 'trusted') throw new Error('Production release unavailable')
const entry = release.manifest.entries.find(item => item.asset.name === 'Shell')
if (entry === undefined) throw new Error('Shell release missing')
const interpretation = entry.governance.interpretations[0]!
const definition = interpretation.definition
const binding = interpretation.binding
const blockIdentity = judgeBlockIdentity({
  id: 'block-shell',
  visibility: { toHuman: true, toModel: true },
})
if ('rejected' in blockIdentity) throw new Error(blockIdentity.rejected)
const originalBlock = blockIdentity.ok

function world() {
  const authority = inProcessPrincipalAuthority()
  const actor = authority.issuer.issueSystem({ component: 'sessionWorkPrincipals' })
  if ('failure' in actor) throw new Error('Actor issue failed')
  const issued = authority.issuer.issueActingForTenant({
    actor: actor.ok,
    tenant: TOOL_RELEASE_TENANT,
    work: { owner: 'session', work: 'session-1' },
  })
  if ('failure' in issued) throw new Error('Principal issue failed')
  const tenant = tenantCodec.encode(TOOL_RELEASE_TENANT)
  const organization = organizationCodec.encode(TOOL_RELEASE_TENANT.organization)
  if (!tenant.ok || !organization.ok) throw new Error('Identity encoding failed')
  const input: ToolPermissionAction = {
    principal: issued.ok,
    tenant: TOOL_RELEASE_TENANT,
    operation: { owner: 'agent', operationId: 'fixture-action' },
    definition: entry!.asset.adoption,
    effectiveArguments: '{"command":"echo hello"}',
    origin: {
      kind: 'agent-action',
      original: {
        ...originalBlock,
        kind: 'tool_call',
        callId: 'shell-1',
        name: 'Shell',
        arguments: { kind: 'object', entries: [] },
      },
      execution: okOf(decodeAgentExecutionId('execution'), 'execution'),
      passage: okOf(decodePassageId('passage'), 'passage'),
      action: okOf(decodeActionId('action'), 'action'),
      advance: {
        execution: okOf(decodeAgentExecutionId('execution'), 'execution'),
        executionAttachment: okOf(decodeExecutionAttachmentId('attachment'), 'attachment'),
        instance: okOf(decodeAgentInstanceId('instance'), 'instance'),
        generation: '1',
        source: decisionEvidence('fixture-advance', '1', {}),
      },
    },
  }
  const request: PermissionBasisRequest = {
    scope: {
      tenantId: tenant.value,
      organizationId: organization.value,
      sessionId: 'session-1',
      targetId: 'fixture-target',
      deploymentId: 'test',
      logicalServiceId: 'tools',
    },
    operation: input.operation,
    argumentsDigest: effectiveArgumentsOf(input.effectiveArguments).digest,
    definition: definition.reference,
    implementationRef: binding.implementationRef,
    capabilityId: binding.capabilityId,
    enforcementKey: binding.enforcementKey,
  }
  // Owner observations are explicit fixtures. Release interpretation and evaluation are real.
  const current = {
    kind: 'current',
    request,
    evaluation: {
      scope: request.scope,
      definition: request.definition,
      capabilityId: request.capabilityId,
      enforcementKey: request.enforcementKey,
      declaration: { kind: 'available', definition },
      sources: {
        organization: { kind: 'absent', revision: '1' },
        session: { kind: 'absent', revision: '1' },
        tenant: {
          kind: 'available',
          sourceRef: 'tenant',
          revision: '1',
          scope: request.scope,
          definition: request.definition,
          rule: { pick: 'auto', allowedSet: null },
        },
      },
      requiredConstraintIds: [],
      constraints: [],
      adoptionRevision: '1',
      targetRevision: '1',
    },
  } satisfies PermissionBasisReading
  let reading: PermissionBasisReading = current
  let reads = 0
  const inquiry: SessionInquiryView = {
    inquiry: {
      policy: { onAsk: 'ask-human' },
      source: { owner: 'session', record: 'mode', revision: '1', digest: 'mode-digest' },
      translation: { owner: 'session-adapters', name: 'fixture', revision: '1', digest: 'fixture' },
    },
    basis: {
      tenant: tenant.value,
      session: 'session-1',
      sessionRevision: '4',
      permissionRevision: '1',
      permissionSource: {
        owner: 'session',
        record: 'permissions',
        revision: '1',
        digest: 'permissions-digest',
      },
    },
  }
  const ports: ToolPermissionPorts = {
    release: () => release,
    inquiry: async () => inquiry,
    request: async () => request,
    source: () => ({
      readCurrent: async () => {
        reads++
        return reading
      },
    }),
  }
  return {
    authority,
    input,
    request,
    current,
    inquiry,
    ports,
    reads: () => reads,
    set: (next: PermissionBasisReading) => {
      reading = next
    },
  }
}

it('reads again and refuses a newly configured prohibition', async () => {
  const w = world(),
    check = createCurrentToolPermission(w.ports)
  expect(await check.check(w.input)).toMatchObject({ kind: 'allow' })
  w.current.evaluation.sources.tenant.rule.pick = 'deny'
  expect(await check.check(w.input)).toMatchObject({ kind: 'deny' })
  expect(w.reads()).toBe(2)
})

it.each(['arguments', 'operation', 'tenant', 'session', 'implementation'])(
  'refuses a mapped request with different %s',
  async field => {
    const w = world()
    if (field === 'arguments') w.request.argumentsDigest = '0'.repeat(64)
    if (field === 'operation') w.request.operation = { owner: 'tool', operationId: 'other' }
    if (field === 'tenant') w.request.scope.tenantId = 'other'
    if (field === 'session') w.request.scope.sessionId = 'other'
    if (field === 'implementation') w.request.implementationRef = 'other'
    expect(await createCurrentToolPermission(w.ports).check(w.input)).toMatchObject({
      kind: 'unavailable',
    })
    expect(w.reads()).toBe(0)
  },
)

it('refuses a previous response for changed arguments', async () => {
  const w = world()
  const ports: ToolPermissionPorts = {
    ...w.ports,
    request: async input => ({
      ...w.request,
      argumentsDigest: effectiveArgumentsOf(input.effectiveArguments).digest,
    }),
  }
  expect(
    await createCurrentToolPermission(ports).check({ ...w.input, effectiveArguments: '{}' }),
  ).toMatchObject({ kind: 'unavailable' })
  expect(w.reads()).toBe(1)
})

it('requires a current source and never turns ask or missing constraints into allow', async () => {
  const w = world(),
    check = createCurrentToolPermission(w.ports)
  w.current.evaluation.sources.tenant.rule.pick = 'ask'
  expect(await check.check(w.input)).toMatchObject({ kind: 'unavailable' })
  w.current.evaluation.sources.tenant.rule.pick = 'auto'
  w.set({
    ...w.current,
    evaluation: { ...w.current.evaluation, requiredConstraintIds: ['agent.definition'] },
  })
  expect(await check.check(w.input)).toMatchObject({ kind: 'unavailable' })
  w.set({ kind: 'unavailable', sourceRef: 'settings' })
  expect(await check.check(w.input)).toMatchObject({ kind: 'unavailable' })
  expect(
    await createCurrentToolPermission({ ...w.ports, source: () => undefined }).check(w.input),
  ).toMatchObject({ kind: 'unavailable' })
})

it('retains a known denial when another required owner is unavailable', async () => {
  const w = world()
  w.current.evaluation.sources.tenant.rule.pick = 'deny'
  w.set({
    ...w.current,
    evaluation: { ...w.current.evaluation, requiredConstraintIds: ['agent.definition'] },
  })
  expect(await createCurrentToolPermission(w.ports).check(w.input)).toMatchObject({ kind: 'deny' })
})

it('rejects a substituted declaration even when its identity is unchanged', async () => {
  const w = world()
  w.set({
    ...w.current,
    evaluation: {
      ...w.current.evaluation,
      declaration: {
        kind: 'available',
        definition: { ...definition, defaultRule: { pick: 'auto', allowedSet: null } },
      },
    },
  })
  expect(await createCurrentToolPermission(w.ports).check(w.input)).toMatchObject({
    kind: 'unavailable',
  })
})

it('does not reuse an interpretation for a different adoption or an unavailable release', async () => {
  const w = world()
  expect(
    await createCurrentToolPermission(w.ports).check({
      ...w.input,
      definition: { ...w.input.definition, digest: 'other' },
    }),
  ).toMatchObject({ kind: 'unavailable' })
  expect(
    await createCurrentToolPermission({
      ...w.ports,
      release: () => ({ kind: 'unavailable', diagnostic: 'gone' }),
    }).check(w.input),
  ).toMatchObject({ kind: 'unavailable' })
  expect(w.reads()).toBe(0)
})

it('does not expose dependency exception details', async () => {
  const w = world()
  const decision = await createCurrentToolPermission({
    ...w.ports,
    source: () => {
      throw new Error('SECRET')
    },
  }).check(w.input)
  expect(decision).toMatchObject({ kind: 'unavailable' })
  expect(JSON.stringify(decision)).not.toContain('SECRET')
})

it('carries the original owner context and the unchanged issued principal to the current source', async () => {
  const w = world()
  const check = createCurrentToolPermission({
    ...w.ports,
    source: () => ({
      readCurrent: async (context, request) => {
        expect(context.principal).toBe(w.input.principal)
        expect(context.origin).toEqual(w.input.origin)
        expect(context.origin).not.toBe(w.input.origin)
        expect(request).toEqual(w.request)
        return w.current
      },
    }),
  })
  expect(await check.check(w.input)).toMatchObject({ kind: 'allow' })
})

it.each([
  ['deny', 'deny'],
  ['ask-human', 'unavailable'],
  ['skip-ask', 'allow'],
] as const)(
  'consumes published %s only for a structurally permitted inquiry',
  async (onAsk, kind) => {
    const w = world()
    w.current.evaluation.sources.tenant.rule.pick = 'ask'
    const check = createCurrentToolPermission({
      ...w.ports,
      inquiry: async () => ({ ...w.inquiry, inquiry: { ...w.inquiry.inquiry, policy: { onAsk } } }),
    })
    expect(await check.check(w.input)).toMatchObject({ kind })
    w.current.evaluation.sources.tenant.rule.pick = 'deny'
    expect(await check.check(w.input)).toMatchObject({ kind: 'deny' })
  },
)

it.each(['missing', 'exception'] as const)(
  'retains prohibition when inquiry publication is %s',
  async failure => {
    const w = world()
    const check = createCurrentToolPermission({
      ...w.ports,
      inquiry: async () => {
        if (failure === 'exception') throw new Error('private producer error')
        return null
      },
    })
    w.current.evaluation.sources.tenant.rule.pick = 'ask'
    expect(await check.check(w.input)).toMatchObject({ kind: 'unavailable' })
    w.current.evaluation.sources.tenant.rule.pick = 'deny'
    expect(await check.check(w.input)).toMatchObject({ kind: 'deny' })
  },
)

it('uses the same immutable published inquiry for capture and interpretation', async () => {
  const w = world()
  w.current.evaluation.sources.tenant.rule.pick = 'ask'
  const policy: { onAsk: 'deny' | 'skip-ask' } = { onAsk: 'deny' }
  const publication = { ...w.inquiry, inquiry: { ...w.inquiry.inquiry, policy } }
  let captured: unknown
  const check = createCurrentToolPermission({
    ...w.ports,
    inquiry: async () => publication,
    source: () => ({
      readCurrent: async context => {
        captured = context.inquiry
        policy.onAsk = 'skip-ask'
        return w.current
      },
    }),
  })
  expect(await check.check(w.input)).toMatchObject({ kind: 'deny', reason: 'inquiry-policy' })
  expect(captured).toMatchObject({ inquiry: { policy: { onAsk: 'deny' } } })
  expect(await check.check(w.input)).toMatchObject({ kind: 'allow' })
})

it('the default authorization row adopts the current source on each call without a startup dependency', async () => {
  const w = world()
  const ctx = new Context()
  const standing = {
    read: async () => ({
      kind: 'member' as const,
      role: { model: { model: 'default-team', revision: '1' }, role: 'member' },
      qualifications: [],
      evidence: { record: 'standing-fixture', revision: '1' },
    }),
  }
  if (w.input.origin.kind !== 'agent-action') throw new Error('Agent fixture expected')
  w.request.operation = agentPermissionOperation(w.input.origin)
  const identity = await ctx.plugin(scope => {
    scope.provide(principalVerifierKey, w.authority.verifier)
    scope.provide(tenantStandingKey, standing)
    scope.provide(identityClockKey, {
      now: async () => {
        throw new Error('no expiring grant in this fixture')
      },
    })
    scope.provide(identityGovernanceKey, { queryCurrentTenant: async () => ({ kind: 'denied' }) })
    new ReleaseToolContributionAuthority(scope, release, () => null)
  })
  const row = await ctx.plugin(authorization, {
    actionRules: {
      revision: 'live',
      rules: [{ id: 'shell', tool: 'Shell', definition: w.input.definition, effect: 'allow' }],
    },
  })
  const { origin, ...action } = w.input
  if (origin.kind !== 'agent-action') throw new Error('Agent fixture expected')
  const input = { ...action, ...origin, permissions: [], decision: null }
  try {
    expect(await ctx.agentActionAdmission.admit(input)).toMatchObject({
      ok: { kind: 'unavailable' },
    })
    const permissionBasis = w.ports.source()
    if (permissionBasis === undefined) throw new Error('Permission fixture absent')
    const source = await ctx.plugin(scope => {
      new CurrentPermissionService(scope, {
        identity: { verifier: w.authority.verifier, standing },
        runtime: async () => ({
          permissionRequest: w.ports.request,
          permissionBasis,
        }),
      })
    })
    try {
      expect(await ctx.agentActionAdmission.admit(input)).toMatchObject({ ok: { kind: 'allow' } })
      const deny = structuredClone(w.current)
      deny.evaluation.sources.tenant.rule.pick = 'deny'
      w.set(deny)
      expect(await ctx.agentActionAdmission.admit(input)).toMatchObject({ ok: { kind: 'deny' } })
    } finally {
      await source.dispose()
    }
    expect(await ctx.agentActionAdmission.admit(input)).toMatchObject({
      ok: { kind: 'unavailable' },
    })
  } finally {
    await row.dispose()
    await identity.dispose()
    await ctx.fiber.dispose()
  }
})
