import { unmappedCaptureWorld } from './unmapped-capture-world.ts'
import { unmappedPermissionSnapshotParticipant } from '../../../dist/rows/governance/unmapped-permission-snapshot.js'
import { afterEach, expect, it } from 'vitest'
import { canonicalText, effectiveArgumentsOf } from '@omne-harness/authorization'
import {
  createGovernanceCollection,
  type GovernancePermissionOptions,
} from '@omne-harness/governance-local'
import { organizationCodec } from '@omne-harness/legal-identity'
import { standingPrincipalRef, type ActingForTenantPrincipal } from '@omne-harness/identity'
import {
  createLocalInvocationSource,
  createLocalInvocationQualifier,
  type LocalInvocationSourceInput,
} from '@omne-harness/tool-host-local'
import {
  createSqlToolLedgerStore,
  toolStorageMaterials,
  toolRecordCurrentFacts,
  type ToolRecordsCurrent,
} from '@omne-harness/tool-storage-sql'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { evaluatePermission, type PermissionBasisRequest } from '@omne-harness/permissions'
import { ledgerWorld } from '../../../../../packages/tool/tool-storage-sql/tests/fixtures/ledger.ts'
import { settingsPreparationWorld } from './settings-preparation-world.ts'
import {
  toolPermissionCurrentCommands,
  toolPermissionCurrentParticipant,
} from '../../../dist/rows/governance/tool-permission-current.js'
import { qualifyToolPermission } from '../../../src/rows/governance/tool-permission-qualification.ts'
import { sessionStorageMaterials } from '@omne-harness/session-storage-sql'
import { createCaptureSession } from './session-capture-fixture.ts'
import { SESSION_LOG_PARTICIPANTS } from '@omne-harness/session-storage-sql/participants'
import { readSessionPermissionForCapture } from '../../../src/rows/governance/permission-session-current.ts'

import { createCaptureAgent } from './agent-capture-fixture.ts'
import { saveCaptureToolIntent } from './tool-agent-capture-fixture.ts'
import { captureParentRequest, forwardCapture } from './forwarded-permission-fixture.ts'
import { candidateOf, entryConfig, mappingConfig, withLiveTree } from '../adoptions/support.ts'

const worlds: Array<{ close(): Promise<unknown> }> = []
afterEach(async () => {
  for (const w of worlds.splice(0)) await w.close()
})

it.each([
  { fromAgent: false, forwarded: false, unmapped: false },
  { fromAgent: false, forwarded: false, unmapped: true },
  { fromAgent: true, forwarded: false, unmapped: false },
  { fromAgent: true, forwarded: false, unmapped: true },
  { fromAgent: true, forwarded: true, unmapped: false },
  { fromAgent: true, forwarded: true, unmapped: true },
])(
  'guards original Tool and Agent facts in the same permission capture (Agent=$fromAgent, forwarded=$forwarded, unmapped=$unmapped)',
  async ({ fromAgent, forwarded, unmapped }) => {
    let resolve: GovernancePermissionOptions['resolve'] = async () => ({ kind: 'denied' })
    let substitutedGuard: ToolRecordsCurrent | undefined
    const tool = toolStorageMaterials()
    const session = sessionStorageMaterials({ readOutputLimitBytes: 4 * 1024 * 1024 })
    const participant = toolPermissionCurrentParticipant(
      { requiredConstraintIds: [] },
      fromAgent ? 'agent' : 'tool',
    )
    const makeWorld = unmapped ? unmappedCaptureWorld : settingsPreparationWorld
    const w = await makeWorld({
      sessionWork: 'owner-session',
      extraParticipants: [
        ...tool.participants,
        ...session.participants,
        participant,
        ...(unmapped ? [unmappedPermissionSnapshotParticipant()] : []),
      ],
      extraMigrations: [...tool.migrations, ...session.migrations],
      extraReadHandlers: [...tool.readHandlers, ...session.readHandlers],
      async permission({ register, snapshotParticipants }) {
        const combination = await register('tool-permission', [
          ...(unmapped
            ? [
                'assets.settings',
                'harness.tool-permission-release',
                'harness.permission-support',
                'governance.selected-definition-projection',
                'harness.permission-unmapped-snapshot',
                'governance.activation',
              ]
            : snapshotParticipants.filter(value => value !== 'governance.metadata-plan')),
          participant.participant,
          'tool',
          'tool-record-current',
          ...SESSION_LOG_PARTICIPANTS,
          'session-permission-guard',
          ...(fromAgent ? ['session-execution-guard'] : []),
          'governance.permission-snapshot',
        ])
        return {
          principalOf: principal => principal,
          sourceRoute: 'governance.permission-capture',
          resolve: (...args) => resolve(...args),
          project: input => ({
            combination,
            commands: toolPermissionCurrentCommands(input).map(command =>
              command.participant === 'tool-record-current' && substitutedGuard !== undefined
                ? toolRecordCurrentFacts(substitutedGuard)
                : command,
            ),
          }),
        }
      },
    })
    worlds.push(w)
    const captureAgent = fromAgent ? await createCaptureAgent(w, candidateOf('alpha')) : undefined
    const captureSession = captureAgent?.session ?? (await createCaptureSession(w))
    const catalog = await w.service.readCatalog(w.access, {
      scope: w.scope,
      mode: 'management',
      targets: [],
      cursor: null,
      limit: 10,
    })
    if (catalog.kind !== 'page') throw new Error(JSON.stringify(catalog))
    const complete = [
      {
        contribution: catalog.items[0]!.contributions[0]!.contribution,
        selectedTargets: unmapped ? [] : [w.target],
      },
    ]
    const collection = createGovernanceCollection({
      scope: w.scope,
      declarationRevision: catalog.snapshot.declarationRevision,
      complete: [{ ...complete[0]!, definition: w.declaration.reference }],
    })
    const adopt = () =>
      w.service.adopt(w.access, {
        scope: w.scope,
        operationId: 'tool-permission-adopt',
        expectedDeclarationRevision: catalog.snapshot.declarationRevision,
        expectedAdoptionRevision: catalog.snapshot.adoptionRevision,
        collection,
        complete,
      })
    if (!unmapped) expect(await adopt()).toMatchObject({ kind: 'adopted' })

    const combination = await w.register('tool-ledger', ['tool'])
    const store = createSqlToolLedgerStore({
      storage: w.storage,
      combination,
      domains: {
        async lookup({ tenant }) {
          return tenant === w.scope.tenantRef
            ? { kind: 'ready', domain: w.domain }
            : { kind: 'unavailable', diagnostic: 'foreign tenant' }
        },
      },
    })
    // Identity uses the real verifier; this fixture has no runtime Session assembly.
    const input: LocalInvocationSourceInput<ActingForTenantPrincipal> = {
      store,
      commitAttempts: 2,
      authority: {
        async qualify({ principal }) {
          return (await w.identity.verifier.verify(principal)).kind === 'verified'
            ? { kind: 'allowed' }
            : { kind: 'denied', reason: 'principal' }
        },
        async samePrincipal({ current, original }) {
          return current === original
            ? { kind: 'allowed' }
            : { kind: 'denied', reason: 'principal' }
        },
      },
      principalCodec: {
        encode: standingPrincipalRef,
        decode: value =>
          value === w.principalRef ? { ok: w.principal } : { failure: { reason: 'principal' } },
      },
    }
    const source = createLocalInvocationSource(input)
    const fixture = await ledgerWorld(w.principal.tenant)
    const { invocation: _invocation, ...originalBusiness } = fixture.input.request
    const template = {
      ...originalBusiness,
      availability: {
        ...originalBusiness.availability,
        definition: {
          ...originalBusiness.availability.definition,
          adoption: w.entry.asset.adoption,
        },
      },
    }
    const originAgent =
      captureAgent === undefined
        ? undefined
        : await saveCaptureToolIntent(
            captureAgent,
            forwarded ? captureParentRequest(template) : template,
          )
    const business = originAgent?.business ?? template
    const issued = await source.issuer.resolve({
      principal: w.principal,
      tenant: w.principal.tenant,
      request: business,
    })
    if (issued.kind !== 'bound') throw new Error(JSON.stringify(issued))
    const captured = forwarded
      ? await forwardCapture(input, w.principal, business, template)
      : {
          call: issued.call,
          admission: issued.admission,
          request: { ...business, invocation: issued.invocation },
          qualifier: createLocalInvocationQualifier(input),
        }
    const fixed = captured.request
    const qualifier = captured.qualifier
    expect(
      await store.read({ kind: 'call', tenant: w.principal.tenant, call: captured.call }),
    ).toMatchObject({ kind: 'complete', records: [] })
    const definition = w.declaration.permissions[0]!
    const enforcement = w.declaration.enforcementBindings.find(
      value =>
        value.capabilityId === definition.capabilityId &&
        value.enforcementKey === definition.enforcementKey,
    )!
    const organization = organizationCodec.encode(w.principal.tenant.organization)
    if (!organization.ok) throw new Error('organization')
    const permission: PermissionBasisRequest = {
      scope: {
        tenantId: w.scope.tenantRef,
        organizationId: organization.value,
        sessionId: 'owner-session',
        targetId: canonicalText(w.target),
        deploymentId: w.scope.deploymentId,
        logicalServiceId: w.scope.logicalServiceId,
      },
      definition: definition.reference,
      operation: { owner: 'tool', operationId: captured.call },
      argumentsDigest: effectiveArgumentsOf(fixed.arguments.effective).digest,
      capabilityId: enforcement.capabilityId,
      enforcementKey: enforcement.enforcementKey,
      implementationRef: enforcement.implementationRef,
    }
    const agentConfig = mappingConfig(
      entryConfig('alpha', {
        definition: {
          category: 'AgentDefinition',
          name: 'alpha',
          references: [],
          attributes: [],
          permissionBounds: [
            {
              capabilityId: definition.capabilityId,
              enforcementKey: definition.enforcementKey,
              allowedSet: [],
            },
          ],
        },
      }),
    )
    await withLiveTree(agentConfig, async ({ agent: adoptions }) => {
      let inquiry = await captureSession.publishInquiry()
      let advanceAgent = false
      let movedAgent: unknown
      let missingAgent = false
      let removeSource = false
      let changeSessionAfterRead = false
      let sessionChange: unknown
      let observedQualification: unknown
      let deletion: unknown
      resolve = async (principal, request) => {
        const result = await qualifyToolPermission({
          action: {
            inquiry,
            principal,
            tenant: principal.tenant,
            operation: permission.operation,
            definition: w.entry.asset.adoption,
            effectiveArguments: fixed.arguments.effective,
            origin: {
              kind: 'tool-call',
              call: captured.call,
              admission: captured.admission,
              request: fixed,
            },
          },
          permission: request,
          release: w.release,
          agent:
            originAgent === undefined || missingAgent
              ? undefined
              : {
                  adoptions,
                  qualifier: {
                    async qualify(input) {
                      const result = await originAgent.qualifier.qualify(input)
                      if (!('failure' in result) && advanceAgent)
                        movedAgent = await originAgent.advance()
                      return result
                    },
                  },
                },
          readSession: async request => {
            const current = await readSessionPermissionForCapture(w.storage, w.domain, request)
            if (changeSessionAfterRead) sessionChange = await captureSession.changeMode()
            return current
          },
          qualifier: {
            async qualify(access) {
              const original = await qualifier.qualify(access)
              if (!('failure' in original) && removeSource) {
                const record = forwarded
                  ? original.ok.records.find(record => record.domain.kind === 'call')
                  : original.ok.records[0]
                if (!record) throw new Error('Original source record absent')
                const read = await store.read(record.domain)
                if (read.kind !== 'complete') throw new Error(read.diagnostic)
                const revision = decodeToolRevision(String(Number(read.revision) + 1))
                if ('failure' in revision) throw new Error('revision')
                deletion = await store.commit({
                  domain: record.domain,
                  expected: read.revision,
                  revision: revision.ok,
                  writes: [{ kind: 'delete', key: record.key }],
                })
              }
              return original
            },
          },
        })
        observedQualification = result
        if (result.kind !== 'qualified') return result
        return {
          kind: 'resolved',
          permission: request,
          target: w.target,
          source: null,
          qualification: result.qualification,
        }
      }
      if (unmapped) {
        expect(await w.permissionBasis.readCurrent(w.principal, permission)).toMatchObject({
          kind: 'unavailable',
        })
        expect(await adopt()).toMatchObject({ kind: 'adopted' })
      }
      const first = await w.permissionBasis.readCurrent(w.principal, permission)
      expect(first, JSON.stringify(observedQualification)).toMatchObject({ kind: 'current' })
      expect(first).toMatchObject({ evaluation: { sources: { session: { kind: 'absent' } } } })
      if (unmapped) {
        expect(first).toMatchObject({
          evaluation: { sources: { organization: { kind: 'absent' }, tenant: { kind: 'absent' } } },
        })
        if (first.kind !== 'current') throw new Error('Missing unmapped current')
        if (!fromAgent)
          expect(evaluatePermission(first.evaluation)).toMatchObject({
            kind: 'effective',
            value: 'auto',
          })
        expect(
          await w.owner.changeHolding({
            operationId: 'unmapped-disable',
            holdingRef: w.target.targetRef,
            scopeRef: w.target.scopeRef,
            expectedRevision: 1,
            change: { kind: 'setEnabled', enabled: false },
          }),
        ).toMatchObject({ kind: 'committed' })
        expect(await w.permissionBasis.readCurrent(w.principal, permission)).toMatchObject({
          kind: 'unavailable',
        })
        expect(
          await w.owner.changeHolding({
            operationId: 'unmapped-enable',
            holdingRef: w.target.targetRef,
            scopeRef: w.target.scopeRef,
            expectedRevision: 2,
            change: { kind: 'setEnabled', enabled: true },
          }),
        ).toMatchObject({ kind: 'committed' })
        expect(await w.permissionBasis.readCurrent(w.principal, permission)).toMatchObject({
          kind: 'current',
        })
      }
      const publishedInquiry = inquiry
      inquiry = {
        ...inquiry,
        basis: {
          ...inquiry.basis,
          permissionSource: { ...inquiry.basis.permissionSource, digest: 'substituted-source' },
        },
      }
      expect(await w.permissionBasis.readCurrent(w.principal, permission)).toMatchObject({
        kind: 'unavailable',
      })
      inquiry = publishedInquiry
      if (originAgent !== undefined) {
        if (first.kind !== 'current') throw new Error('No current permission capture')
        expect(evaluatePermission(first.evaluation)).toMatchObject({
          kind: 'denied',
          reason: 'empty-bound',
        })
        expect(first.evaluation.requiredConstraintIds).toContain('agent-definition')
        missingAgent = true
        expect(await w.permissionBasis.readCurrent(w.principal, permission)).toMatchObject({
          kind: 'unavailable',
        })
        missingAgent = false
        advanceAgent = true
        expect(await w.permissionBasis.readCurrent(w.principal, permission)).toMatchObject({
          kind: 'unavailable',
        })
        expect(movedAgent).toHaveProperty('revision')
        advanceAgent = false
        await originAgent.restore()
        const renewed = await w.permissionBasis.readCurrent(w.principal, permission)
        expect(renewed).toMatchObject({ kind: 'current' })
        if (renewed.kind !== 'current')
          throw new Error('No recapture after original intent restored')
        expect(evaluatePermission(renewed.evaluation)).toMatchObject({
          kind: 'denied',
          reason: 'empty-bound',
        })
      }
      for (const changed of [
        { ...permission, operation: { owner: 'tool', operationId: 'another-call' } },
        { ...permission, argumentsDigest: '0'.repeat(64) },
        { ...permission, scope: { ...permission.scope, sessionId: 'another-session' } },
        { ...permission, implementationRef: 'another-implementation' },
        { ...permission, capabilityId: 'another-capability' },
        { ...permission, definition: { ...permission.definition, revision: 'another-revision' } },
      ] satisfies PermissionBasisRequest[])
        expect(await w.permissionBasis.readCurrent(w.principal, changed)).toMatchObject({
          kind: 'denied',
        })

      const otherBusiness = {
        ...business,
        consumer: { ...business.consumer, position: 'another-position' },
      }
      const other = await source.issuer.resolve({
        principal: w.principal,
        tenant: w.principal.tenant,
        request: otherBusiness,
      })
      if (other.kind !== 'bound') throw new Error(JSON.stringify(other))
      const otherQualified = await qualifier.qualify({
        principal: w.principal,
        tenant: w.principal.tenant,
        call: other.call,
        admission: other.admission,
        request: { ...otherBusiness, invocation: other.invocation },
      })
      if ('failure' in otherQualified) throw new Error(JSON.stringify(otherQualified))
      substitutedGuard = {
        tenant: w.scope.tenantRef,
        records: otherQualified.ok.records.map(item => ({
          kind: item.domain.kind,
          name: item.domain.kind === 'call' ? item.domain.call : item.domain.key,
          key: item.key,
          digest: item.digest,
        })),
      }
      expect(await w.permissionBasis.readCurrent(w.principal, permission)).toMatchObject({
        kind: 'unavailable',
      })
      substitutedGuard = undefined
      expect(await w.permissionBasis.readCurrent(w.principal, permission)).toMatchObject({
        kind: 'current',
      })
      changeSessionAfterRead = true
      expect(await w.permissionBasis.readCurrent(w.principal, permission)).toMatchObject({
        kind: 'unavailable',
      })
      expect(sessionChange).toHaveProperty('ok')
      changeSessionAfterRead = false
      // A fresh permission read cannot make the old published policy current.
      expect(await w.permissionBasis.readCurrent(w.principal, permission)).toMatchObject({
        kind: 'unavailable',
      })
      inquiry = await captureSession.publishInquiry()
      expect(inquiry.inquiry.policy.onAsk).toBe('deny')
      expect(await w.permissionBasis.readCurrent(w.principal, permission)).toMatchObject({
        kind: 'current',
        evaluation: { sources: { session: { kind: 'absent' } } },
      })
      expect(observedQualification).toMatchObject({
        qualification: { observation: { session: { revision: '1' } } },
      })
      removeSource = true
      expect(await w.permissionBasis.readCurrent(w.principal, permission)).toMatchObject({
        kind: 'unavailable',
      })
      expect(deletion).toEqual({ kind: 'committed' })
    })
  },
  30_000,
)
