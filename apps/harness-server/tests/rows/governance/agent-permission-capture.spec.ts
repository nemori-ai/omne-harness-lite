import { unmappedCaptureWorld } from './unmapped-capture-world.ts'
import { unmappedPermissionSnapshotParticipant } from '../../../dist/rows/governance/unmapped-permission-snapshot.js'
import { afterEach, expect, it } from 'vitest'
import { canonicalText, digestOf, effectiveArgumentsOf } from '@omne-harness/authorization'
import {
  createGovernanceCollection,
  type GovernancePermissionOptions,
} from '@omne-harness/governance-local'
import { organizationCodec } from '@omne-harness/legal-identity'
import { evaluatePermission, type PermissionBasisRequest } from '@omne-harness/permissions'
import { sessionStorageMaterials } from '@omne-harness/session-storage-sql'
import { SESSION_LOG_PARTICIPANTS } from '@omne-harness/session-storage-sql/participants'
import {
  agentPermissionCurrentCommands,
  agentPermissionCurrentParticipant,
  AGENT_PERMISSION_CURRENT,
} from '../../../dist/rows/governance/agent-permission-current.js'
import { qualifyAgentPermission } from '../../../src/rows/governance/agent-permission-qualification.ts'
import { readSessionPermissionForCapture } from '../../../src/rows/governance/permission-session-current.ts'
import { settingsPreparationWorld } from './settings-preparation-world.ts'
import { createCaptureAgent } from './agent-capture-fixture.ts'
import { candidateOf, entryConfig, mappingConfig, withLiveTree } from '../adoptions/support.ts'

const worlds: Array<{ close(): Promise<unknown> }> = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

it.each([false, true])(
  'carries the original Agent bound into SQL capture (unmapped=%s)',
  async unmapped => {
    let resolve: GovernancePermissionOptions['resolve'] = async () => ({ kind: 'denied' })
    const session = sessionStorageMaterials({ readOutputLimitBytes: 4 * 1024 * 1024 })
    const makeWorld = unmapped ? unmappedCaptureWorld : settingsPreparationWorld
    const w = await makeWorld({
      sessionWork: 'owner-session',
      extraParticipants: [
        ...session.participants,
        agentPermissionCurrentParticipant({ requiredConstraintIds: [] }),
        ...(unmapped ? [unmappedPermissionSnapshotParticipant()] : []),
      ],
      extraMigrations: session.migrations,
      extraReadHandlers: session.readHandlers,
      async permission({ register, snapshotParticipants }) {
        const combination = await register('agent-permission', [
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
          AGENT_PERMISSION_CURRENT,
          ...SESSION_LOG_PARTICIPANTS,
          'session-permission-guard',
          'session-execution-guard',
          'governance.permission-snapshot',
        ])
        return {
          principalOf: principal => principal,
          sourceRoute: 'governance.permission-capture',
          resolve: (...args) => resolve(...args),
          project: input => ({ combination, commands: agentPermissionCurrentCommands(input) }),
        }
      },
    })
    worlds.push(w)
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
    expect(
      await w.service.adopt(w.access, {
        scope: w.scope,
        operationId: 'agent-permission-adopt',
        expectedDeclarationRevision: catalog.snapshot.declarationRevision,
        expectedAdoptionRevision: catalog.snapshot.adoptionRevision,
        collection,
        complete,
      }),
    ).toMatchObject({ kind: 'adopted' })
    const original = await createCaptureAgent(w, candidateOf('alpha'))
    const { request } = original
    const definition = w.declaration.permissions[0]!
    const enforcement = w.declaration.enforcementBindings.find(
      item =>
        item.capabilityId === definition.capabilityId &&
        item.enforcementKey === definition.enforcementKey,
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
      operation: {
        owner: 'agent',
        operationId: `action/${digestOf([request.execution, request.passage, request.action])}`,
      },
      argumentsDigest: effectiveArgumentsOf(request.effectiveArguments).digest,
      capabilityId: enforcement.capabilityId,
      enforcementKey: enforcement.enforcementKey,
      implementationRef: enforcement.implementationRef,
    }
    const config = mappingConfig(
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
    let inquiry = await original.session.publishInquiry()
    let observed: unknown
    let advanceAfterQualification = false
    let advanced = false
    let advanceEvidence: { before: string; after: string } | undefined
    let effectiveArguments = request.effectiveArguments
    await withLiveTree(config, async ({ agent }) => {
      resolve = async (principal, permission) => {
        const result = await qualifyAgentPermission({
          action: {
            inquiry,
            principal,
            tenant: principal.tenant,
            operation: permission.operation,
            definition: request.definition,
            effectiveArguments,
            origin: {
              kind: 'agent-action',
              execution: request.execution,
              passage: request.passage,
              action: request.action,
              advance: request.advance,
              original: request.original,
            },
          },
          permission,
          release: w.release,
          qualifier: {
            async qualify(input) {
              const result = await original.qualifier.qualify(input)
              if (!('failure' in result) && advanceAfterQualification) {
                const committed = await original.commit(
                  {
                    ...original.batch,
                    actions: original.batch.actions.map(action => ({
                      ...action,
                      effectiveArguments: '{"changed":true}',
                    })),
                  },
                  'advance-after-qualified',
                )
                advanceEvidence = { before: result.ok.revision, after: committed.revision }
                advanced = true
              }
              return result
            },
          },
          adoptions: agent,
          readSession: input => readSessionPermissionForCapture(w.storage, w.domain, input),
        })
        observed = result
        return result.kind === 'qualified'
          ? {
              kind: 'resolved',
              permission,
              target: w.target,
              source: null,
              qualification: result.qualification,
            }
          : result
      }
      const first = await w.permissionBasis.readCurrent(w.principal, permission)
      expect(first, JSON.stringify(observed)).toMatchObject({ kind: 'current' })
      if (first.kind !== 'current') throw new Error('No capture')
      expect(evaluatePermission(first.evaluation)).toMatchObject({
        kind: 'denied',
        reason: 'empty-bound',
      })
      expect(first.evaluation.requiredConstraintIds).toContain('agent-definition')
      expect(first.evaluation.constraints).toMatchObject([
        { id: 'agent-definition', kind: 'available', effect: { kind: 'bound', allowedSet: [] } },
      ])
      const publishedInquiry = inquiry
      inquiry = { ...inquiry, basis: { ...inquiry.basis, permissionRevision: '999' } }
      expect(await w.permissionBasis.readCurrent(w.principal, permission)).toMatchObject({
        kind: 'unavailable',
      })
      inquiry = publishedInquiry
      advanceAfterQualification = true
      const raced = await w.permissionBasis.readCurrent(w.principal, permission)
      expect(raced, JSON.stringify(advanceEvidence)).toMatchObject({ kind: 'unavailable' })
      expect(advanced).toBe(true)
      expect(advanceEvidence?.after).not.toBe(advanceEvidence?.before)
      advanceAfterQualification = false
      effectiveArguments = '{"changed":true}'
      const nextPermission = {
        ...permission,
        argumentsDigest: effectiveArgumentsOf(effectiveArguments).digest,
      }
      const next = await w.permissionBasis.readCurrent(w.principal, nextPermission)
      expect(next).toMatchObject({ kind: 'current' })
      if (next.kind !== 'current') throw new Error('No current recapture')
      expect(evaluatePermission(next.evaluation)).toMatchObject({
        kind: 'denied',
        reason: 'empty-bound',
      })
      for (const changed of [
        { ...nextPermission, operation: { owner: 'agent', operationId: 'another-action' } },
        { ...nextPermission, argumentsDigest: '0'.repeat(64) },
        { ...nextPermission, scope: { ...nextPermission.scope, sessionId: 'another-session' } },
        {
          ...nextPermission,
          definition: { ...nextPermission.definition, revision: 'another-revision' },
        },
      ])
        expect(await w.permissionBasis.readCurrent(w.principal, changed)).toMatchObject({
          kind: 'denied',
        })
      expect(
        await w.service.withdraw(w.access, {
          operationId: 'agent-permission-withdraw',
          contribution: complete[0]!.contribution,
        }),
      ).toMatchObject({ kind: 'released' })
      expect(await w.permissionBasis.readCurrent(w.principal, nextPermission)).toMatchObject({
        kind: 'unavailable',
      })
    })
  },
  30_000,
)
