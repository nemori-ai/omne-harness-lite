import { releasedDeclaration } from '../../../src/entry/permission-declarations.ts'
import { describe, expect, it } from 'vitest'
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
import { toolCatalogKey } from '@omne-harness/tool-cordis-contract/cordis'
import { releaseCatalog } from './release-catalog.ts'
import { decisionEvidence, digestOf, effectiveArgumentsOf } from '@omne-harness/authorization'
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
  declaredPermission,
  type ToolPermissionAction,
  type ToolPermissionPorts,
} from '../../../src/rows/authorization/current-tool-permission.ts'
import { fixtureTenant, okOf } from '../../entry/support.ts'
import type { SessionAuthorizations } from '@omne-harness/session-storage-sql/participants'
import { onceTarget } from '../../../src/rows/authorization/authorization-facts.ts'

const release = await loadProductionRelease()
if (release.kind !== 'trusted') throw new Error('Production release unavailable')
const entry = release.manifest.entries.find(item => item.asset.name === 'Shell')
if (entry === undefined) throw new Error('Shell release missing')
const interpretation = entry.governance.interpretations.find(
  value => value.binding.enforcementKey === 'tool.run',
)!
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
    effectiveArguments:
      '{"command":"execute","intent":"test call","params":{"script":"echo hello"}}',
    gate: { id: 'run', title: '执行', default: 'ask' },
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
  let authorizations: SessionAuthorizations | null = null
  const condition = { combinationVersion: 'fixture/1', commands: [] }
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
    declarations: () =>
      release.kind === 'trusted' ? release.manifest.entries.map(releasedDeclaration) : [],
    inquiry: async () => inquiry,
    source: () => ({
      readCurrent: async () => {
        reads++
        return { request, reading, condition, authorizations, consumer }
      },
    }),
  }
  return {
    authority,
    input,
    request,
    current,
    inquiry,
    condition,
    ports,
    reads: () => reads,
    set: (next: PermissionBasisReading) => {
      reading = next
    },
    authorize: (next: SessionAuthorizations | null) => {
      authorizations = next
    },
  }
}

type World = ReturnType<typeof world>
const consumer = { owner: '@omne-harness/agent', work: 'execution', position: 'action' }
function onceFor(w: World, overrides: Partial<NonNullable<SessionAuthorizations['once']>> = {}) {
  return {
    revision: '1',
    once: {
      consumer,
      target: onceTarget(w.input.definition),
      argumentsDigest: effectiveArgumentsOf(w.input.effectiveArguments).digest,
      source: decisionEvidence('card-answer', '1', {}),
      ...overrides,
    },
    session: null,
  } satisfies SessionAuthorizations
}

it('releases the action a once authorization names and gives it for the start to consume', async () => {
  const w = world()
  w.current.evaluation.sources.tenant.rule.pick = 'ask'
  const check = createCurrentToolPermission(w.ports)
  expect(await check.check(w.input)).toMatchObject({ kind: 'ask' })
  w.authorize(onceFor(w))
  expect(await check.check(w.input)).toMatchObject({
    kind: 'allow',
    condition: w.condition,
    authorization: { consumer, source: decisionEvidence('card-answer', '1', {}) },
  })
})

it.each([
  ['target', { target: 'another tool' }],
  ['arguments', { argumentsDigest: '0'.repeat(64) }],
  ['place', { consumer: { ...consumer, position: 'another action' } }],
] as const)(
  'does not release an action whose %s differs from the once authorization',
  async (_, overrides) => {
    const w = world()
    w.current.evaluation.sources.tenant.rule.pick = 'ask'
    w.authorize(onceFor(w, overrides))
    expect(await createCurrentToolPermission(w.ports).check(w.input)).toMatchObject({ kind: 'ask' })
  },
)

it('releases an action of a gate released for the session while the basis of that release is current', async () => {
  const w = world()
  w.current.evaluation.sources.tenant.rule.pick = 'ask'
  const check = createCurrentToolPermission(w.ports)
  const asked = await check.check(w.input)
  if (asked.kind !== 'ask' || asked.gate === undefined) throw new Error(JSON.stringify(asked))
  const { capabilityId, enforcementKey, basis } = asked.gate
  const source = decisionEvidence('card-answer', '1', {})
  const forSession = (given: Partial<typeof asked.gate>) => ({
    revision: '1',
    once: null,
    session: { capabilityId, enforcementKey, basis, source, ...given },
  })
  w.authorize(forSession({}))
  const released = await check.check(w.input)
  expect(released).toMatchObject({ kind: 'allow', condition: w.condition })
  expect(released).not.toHaveProperty('authorization')
  w.authorize(forSession({ basis: 'the basis before the setting changed' }))
  expect(await check.check(w.input)).toMatchObject({ kind: 'ask' })
  w.authorize(forSession({ capabilityId: 'another capability' }))
  expect(await check.check(w.input)).toMatchObject({ kind: 'ask' })
})

describe('the grant a release names', () => {
  const gateOf = (w: World) => ({
    capability: w.request.capabilityId,
    key: w.request.enforcementKey,
  })
  const withSession = (w: World, rule: { pick: string | null; allowedSet: string[] | null }) => {
    const evaluation = {
      ...w.current.evaluation,
      sources: {
        ...w.current.evaluation.sources,
        session: {
          kind: 'available',
          sourceRef: 'session',
          revision: '2',
          scope: w.request.scope,
          definition: w.request.definition,
          rule,
        },
      },
    } as const
    w.set({ ...w.current, evaluation })
    return evaluation
  }

  it('names the tenant layer when the session layer takes no part in an allowed verdict', async () => {
    const w = world()
    const released = await createCurrentToolPermission(w.ports).check(w.input)
    expect(released).toMatchObject({
      kind: 'allow',
      release: {
        by: 'verdict',
        grant: {
          via: 'verdict',
          layer: 'tenant',
          holder: w.request.scope.tenantId,
          gate: gateOf(w),
          revision: digestOf(w.current.evaluation),
        },
      },
    })
  })

  it.each([
    ['picks the value', { pick: 'auto', allowedSet: null }],
    ['only bounds the values', { pick: null, allowedSet: ['auto', 'ask'] }],
  ])('names the session layer when the session layer %s', async (_label, rule) => {
    const w = world()
    const evaluation = withSession(w, rule)
    expect(await createCurrentToolPermission(w.ports).check(w.input)).toMatchObject({
      kind: 'allow',
      release: {
        by: 'verdict',
        grant: { layer: 'session', holder: 'session-1', revision: digestOf(evaluation) },
      },
    })
  })

  it('names the once authorization, the session grant and the run mode by their own sources', async () => {
    const w = world()
    w.current.evaluation.sources.tenant.rule.pick = 'ask'
    const check = createCurrentToolPermission(w.ports)
    w.authorize(onceFor(w))
    expect(await check.check(w.input)).toMatchObject({
      release: {
        by: 'once',
        grant: {
          via: 'once',
          holder: 'session-1',
          source: decisionEvidence('card-answer', '1', {}),
        },
      },
    })
    const given = decisionEvidence('card-answer', '2', {})
    const basis = digestOf(w.current.evaluation)
    const { capabilityId, enforcementKey } = w.request
    w.authorize({
      revision: '2',
      once: null,
      session: { capabilityId, enforcementKey, basis, source: given },
    })
    expect(await check.check(w.input)).toMatchObject({
      release: {
        by: 'session',
        grant: { via: 'session-grant', holder: 'session-1', gate: gateOf(w), source: given },
      },
    })
    w.authorize(null)
    const skipping = {
      ...w.inquiry,
      inquiry: { ...w.inquiry.inquiry, policy: { onAsk: 'skip-ask' } },
    } as const
    const ports = { ...w.ports, inquiry: async () => skipping }
    expect(await createCurrentToolPermission(ports).check(w.input)).toMatchObject({
      release: {
        by: 'skip-ask',
        grant: { via: 'skip-ask', holder: 'session-1', source: w.inquiry.inquiry.source },
      },
    })
  })

  it('names no grant for a carrier', async () => {
    const w = world()
    w.current.evaluation.sources.tenant.rule.pick = 'ask'
    const carried = await createCurrentToolPermission(w.ports).check({ ...w.input, carrier: true })
    expect(carried).toMatchObject({ kind: 'allow', release: { by: 'carrier', grant: null } })
  })
})

it('consumes no once authorization when the gate became automatic, and refuses when it became prohibited', async () => {
  const w = world()
  w.authorize(onceFor(w))
  const check = createCurrentToolPermission(w.ports)
  const automatic = await check.check(w.input)
  expect(automatic).toMatchObject({ kind: 'allow' })
  expect(automatic).not.toHaveProperty('authorization')
  w.current.evaluation.sources.tenant.rule.pick = 'deny'
  expect(await check.check(w.input)).toMatchObject({ kind: 'deny', category: 'rule' })
})

it('gives the condition of the reading with an allow, and with nothing else', async () => {
  const w = world(),
    check = createCurrentToolPermission(w.ports)
  expect(await check.check(w.input)).toMatchObject({ kind: 'allow', condition: w.condition })
  w.current.evaluation.sources.tenant.rule.pick = 'deny'
  expect(await check.check(w.input)).not.toHaveProperty('condition')
  w.set({ kind: 'unavailable', sourceRef: 'fixture' })
  expect(await check.check(w.input)).not.toHaveProperty('condition')
})

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
      kind: 'undecidable',
    })
    expect(w.reads()).toBe(1)
  },
)

it('refuses a previous response for changed arguments', async () => {
  const w = world()
  const source = w.ports.source()
  const ports: ToolPermissionPorts = {
    ...w.ports,
    source: () => ({
      readCurrent: async context => ({
        ...(await source!.readCurrent(context)),
        request: {
          ...w.request,
          argumentsDigest: effectiveArgumentsOf(context.effectiveArguments).digest,
        },
      }),
    }),
  }
  expect(
    await createCurrentToolPermission(ports).check({ ...w.input, effectiveArguments: '{}' }),
  ).toMatchObject({ kind: 'undecidable' })
  expect(w.reads()).toBe(1)
})

it('requires a current source and never turns ask or missing constraints into allow', async () => {
  const w = world(),
    check = createCurrentToolPermission(w.ports)
  w.current.evaluation.sources.tenant.rule.pick = 'ask'
  expect(await check.check(w.input)).toMatchObject({ kind: 'ask' })
  w.current.evaluation.sources.tenant.rule.pick = 'auto'
  w.set({
    ...w.current,
    evaluation: { ...w.current.evaluation, requiredConstraintIds: ['agent.definition'] },
  })
  expect(await check.check(w.input)).toMatchObject({ kind: 'undecidable' })
  w.set({ kind: 'unavailable', sourceRef: 'settings' })
  expect(await check.check(w.input)).toMatchObject({ kind: 'unavailable' })
  expect(
    await createCurrentToolPermission({ ...w.ports, source: () => undefined }).check(w.input),
  ).toMatchObject({ kind: 'unavailable' })
})

it('answers unavailable when the source could not read the basis and gives no request back', async () => {
  const w = world()
  const check = createCurrentToolPermission({
    ...w.ports,
    source: () => ({
      readCurrent: async () => ({
        request: null,
        reading: { kind: 'unavailable', sourceRef: 'harness.current-permission' },
        condition: null,
      }),
    }),
  })
  expect(await check.check(w.input)).toEqual({
    kind: 'unavailable',
    diagnostic: 'The permission basis could not be read now.',
  })
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
    kind: 'undecidable',
  })
})

it('answers unavailable, and reads nothing, when no declaration names the capability', async () => {
  const w = world()
  expect(
    await createCurrentToolPermission(w.ports).check({
      ...w.input,
      definition: { ...w.input.definition, digest: 'other' },
    }),
  ).toMatchObject({ kind: 'unavailable' })
  expect(
    await createCurrentToolPermission({ ...w.ports, declarations: () => [] }).check(w.input),
  ).toMatchObject({ kind: 'unavailable' })
  expect(w.reads()).toBe(0)
})

it('judges a capability outside the release once its category owner registers its declaration', async () => {
  const w = world()
  const released = w.ports.declarations()
  const own = released.find(entry => entry.asset.adoption.name === w.input.definition.name)
  if (own === undefined) throw new Error('fixture declaration missing')
  const capability = { ...w.input.definition, name: 'TestCapability', digest: 'test-capability' }
  const registered = { ...own, asset: { name: 'TestCapability', adoption: capability } }
  const outside = { ...w.input, definition: capability }
  expect(await createCurrentToolPermission(w.ports).check(outside)).toMatchObject({
    kind: 'unavailable',
  })
  const check = createCurrentToolPermission({
    ...w.ports,
    declarations: () => [...released, registered],
  })
  expect(declaredPermission([...released, registered], outside)?.entry.asset.name).toBe(
    'TestCapability',
  )
  expect(await check.check(outside)).not.toMatchObject({ kind: 'unavailable' })
})

it('does not expose dependency exception details', async () => {
  const w = world()
  const decision = await createCurrentToolPermission({
    ...w.ports,
    source: () => {
      throw new Error('SECRET')
    },
  }).check(w.input)
  expect(decision).toMatchObject({ kind: 'undecidable' })
  expect(JSON.stringify(decision)).not.toContain('SECRET')
})

it('carries the original owner context and the unchanged issued principal to the current source', async () => {
  const w = world()
  const check = createCurrentToolPermission({
    ...w.ports,
    source: () => ({
      readCurrent: async context => {
        expect(context.principal).toBe(w.input.principal)
        expect(context.origin).toEqual(w.input.origin)
        expect(context.origin).not.toBe(w.input.origin)
        return { request: w.request, reading: w.current, condition: null }
      },
    }),
  })
  expect(await check.check(w.input)).toMatchObject({ kind: 'allow' })
})

it.each([
  ['deny', 'deny'],
  ['ask-human', 'ask'],
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
  'retains prohibition, and does not refuse for good, when inquiry publication is %s',
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
        return { request: w.request, reading: w.current, condition: null }
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
    // The action resolution reads the judged definition from the catalog.
    scope.provide(toolCatalogKey, releaseCatalog(release))
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
        runtime: async () => ({ permissionBasis }),
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

it('does not let a carrier ask: the call it carries is judged for its own gate, and only a prohibition of its own refuses', async () => {
  const w = world()
  const check = createCurrentToolPermission(w.ports)
  const carrier = { ...w.input, carrier: true as const }
  w.current.evaluation.sources.tenant.rule.pick = 'ask'
  expect(await check.check(w.input)).toMatchObject({ kind: 'ask' })
  const released = await check.check(carrier)
  expect(released).toMatchObject({ kind: 'allow', condition: w.condition })
  expect(released).not.toHaveProperty('authorization')
  w.authorize(onceFor(w))
  expect(await check.check(carrier)).not.toHaveProperty('authorization')
  w.authorize(null)
  w.current.evaluation.sources.tenant.rule.pick = 'deny'
  expect(await check.check(carrier)).toMatchObject({
    kind: 'deny',
    category: 'rule',
    reason: 'permission-policy',
  })
})

it('needs the session inquiry of an action that asks, and of that one only', async () => {
  const w = world()
  const unread = createCurrentToolPermission({ ...w.ports, inquiry: async () => null })
  w.current.evaluation.sources.tenant.rule.pick = 'ask'
  expect(await unread.check(w.input)).toEqual({
    kind: 'unavailable',
    diagnostic: 'The session inquiry policy could not be read now.',
  })
  expect(await unread.check({ ...w.input, carrier: true })).toMatchObject({ kind: 'allow' })
  w.current.evaluation.sources.tenant.rule.pick = 'auto'
  expect(await unread.check(w.input)).toMatchObject({ kind: 'allow' })
})

it.each([
  ['a tenant that is not a minted one', (w: World) => ({ ...w.input, tenant: {} as never })],
  [
    'the work of a session that does not act for the tenant of the action',
    (w: World) => ({
      ...w.input,
      principal: okOf(
        w.authority.issuer.issueActingForTenant({
          actor: okOf(
            w.authority.issuer.issueSystem({ component: 'sessionWorkPrincipals' }),
            'actor',
          ),
          tenant: fixtureTenant('b'),
          work: { owner: 'session', work: 'session-1' },
        }),
        'principal',
      ),
    }),
  ],
])('answers undecidable, with its reason, to an action of %s', async (_what, given) => {
  const w = world()
  const check = createCurrentToolPermission(w.ports)
  expect(await check.check(given(w))).toEqual({
    kind: 'undecidable',
    diagnostic: 'The permission source answered for another request.',
  })
  expect(w.reads()).toBe(1)
})
