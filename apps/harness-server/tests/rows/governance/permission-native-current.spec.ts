import { rmSync } from 'node:fs'
import { createIdentityQualifiedSettingsSources } from '@omne-harness/settings-local/preparation'
import { standingPrincipalRef, type ActingForTenantPrincipal } from '@omne-harness/identity'
import { openSourceServiceWorld } from '../../../../../packages/assets/settings-local/tests/source-service-world.ts'
import { afterEach, expect, it } from 'vitest'
import { canonicalText } from '@omne-harness/authorization'
import { organizationCodec } from '@omne-harness/legal-identity'
import { evaluatePermission, type PermissionBasisRequest } from '@omne-harness/permissions'
import {
  createGovernanceCollection,
  createGovernanceLocalSourceDestination,
  type GovernanceLocalOptions,
} from '@omne-harness/governance-local'
import {
  permissionCurrentParticipant,
  permissionCurrentCommands,
  PERMISSION_CURRENT_PARTICIPANT,
} from '../../../dist/rows/governance/permission-current.js'
import { settingsPreparationWorld } from './settings-preparation-world.ts'

const worlds: Array<{ close(): Promise<unknown> }> = []
afterEach(async () => {
  for (const w of worlds.splice(0)) await w.close()
})
it.each([false, true])(
  'reads actual Tool settings, with retained organization source %s, before and after a committed change',
  async withOrganization => {
    let reservations: GovernanceLocalOptions['sourceReservations']
    const replies: unknown[] = []
    const bridge: NonNullable<GovernanceLocalOptions['sourceReservations']> = {
      async reserve(principal, request) {
        const reply = (await reservations?.reserve(principal, request)) ?? {
          kind: 'rejected' as const,
          reason: 'unavailable' as const,
        }
        replies.push(reply)
        return reply
      },
      settle: request =>
        reservations?.settle(request) ??
        Promise.resolve({ kind: 'rejected', reason: 'unavailable' }),
    }
    const sourceFor = (organization: string) => ({
      domain: { scope: { kind: 'system' as const }, transactionDomain: 'system.settings' },
      target: { policyId: 'independent', scopeRef: organization, targetRef: 'shell-permission' },
    })
    const w = await settingsPreparationWorld({
      ...(withOrganization ? { sourceReservations: bridge } : {}),
      extraParticipants: [permissionCurrentParticipant({ requiredConstraintIds: [] })],
      async permission({ register, snapshotParticipants, declaration, target }) {
        const participants = [
          ...snapshotParticipants.filter(value => value !== 'governance.metadata-plan'),
          PERMISSION_CURRENT_PARTICIPANT,
          'governance.permission-snapshot',
        ]
        const combination = await register('native-permission', participants)
        return {
          principalOf: principal => principal,
          sourceRoute: 'governance.permission-capture',
          async resolve(_principal, request) {
            // The original action authority is a named fixture; native declaration and values are real.
            if (
              request.operation.owner !== 'test-action' ||
              request.operation.operationId !== 'native-current' ||
              request.scope.targetId !== canonicalText(target)
            )
              return { kind: 'denied' }
            return {
              kind: 'resolved',
              permission: request,
              target,
              qualification: {
                owner: 'fixture.action',
                protocol: 'fixture-action/1',
                observation: request.operation,
              },
              source:
                withOrganization && request.scope.organizationId !== null
                  ? sourceFor(request.scope.organizationId)
                  : null,
            }
          },
          project: input => ({
            combination,
            commands: permissionCurrentCommands(input, declaration.reference),
          }),
        }
      },
    })
    let source: Awaited<ReturnType<typeof openSourceServiceWorld>> | undefined
    let qualified: ReturnType<typeof createIdentityQualifiedSettingsSources> | undefined
    worlds.push({
      async close() {
        await w.close()
        await qualified?.control.close()
        await source?.close()
        if (source) rmSync(source.root, { recursive: true, force: true })
      },
    })
    const page = await w.service.readCatalog(w.access, {
      scope: w.scope,
      mode: 'management',
      targets: [],
      cursor: null,
      limit: 10,
    })
    if (page.kind !== 'page') throw new Error(JSON.stringify(page))
    const item = page.items[0]!
    const complete = [
      { contribution: item.contributions[0]!.contribution, selectedTargets: [w.target] },
    ]
    const collection = createGovernanceCollection({
      scope: w.scope,
      declarationRevision: page.snapshot.declarationRevision,
      complete: [{ ...complete[0]!, definition: w.declaration.reference }],
    })
    expect(
      await w.service.adopt(w.access, {
        scope: w.scope,
        operationId: 'adopt-permission',
        expectedDeclarationRevision: page.snapshot.declarationRevision,
        expectedAdoptionRevision: page.snapshot.adoptionRevision,
        collection,
        complete,
      }),
    ).toMatchObject({ kind: 'adopted' })
    const definition = w.declaration.permissions[0]!
    const binding = w.declaration.enforcementBindings.find(
      value =>
        value.capabilityId === definition.capabilityId &&
        value.enforcementKey === definition.enforcementKey,
    )!
    const organization = organizationCodec.encode(w.principal.tenant.organization)
    if (!organization.ok) throw new Error('Missing organization')
    const request: PermissionBasisRequest = {
      scope: {
        tenantId: w.scope.tenantRef,
        organizationId: organization.value,
        sessionId: null,
        targetId: canonicalText(w.target),
        deploymentId: w.scope.deploymentId,
        logicalServiceId: w.scope.logicalServiceId,
      },
      definition: definition.reference,
      operation: { owner: 'test-action', operationId: 'native-current' },
      implementationRef: binding.implementationRef,
      argumentsDigest: 'a'.repeat(64),
      capabilityId: binding.capabilityId,
      enforcementKey: binding.enforcementKey,
    }
    if (withOrganization) {
      source = await openSourceServiceWorld(
        createGovernanceLocalSourceDestination({
          ...w.coordination,
          sourceRoute: 'governance.permission-capture',
        }),
        undefined,
        sourceFor(organization.value),
        w.declaration.settings[0]!,
      )
      qualified = createIdentityQualifiedSettingsSources({
        identity: w.identity,
        backend: {
          ...source.options,
          access: {
            async authorize(principal: ActingForTenantPrincipal, input) {
              return {
                kind: 'authorized',
                scope: input.source.domain.scope,
                target: input.source.target,
                principalRef: standingPrincipalRef(principal),
              }
            },
          },
        },
      })
      reservations = qualified.service
      expect(await source.set({ pick: 'auto', allowedSet: null })).toMatchObject({
        kind: 'committed',
      })
    }
    const before = await w.permissionBasis.readCurrent(w.principal, request)
    if (withOrganization) expect(replies, JSON.stringify(replies)).toMatchObject([{ kind: 'held' }])
    expect(before).toMatchObject({
      kind: 'current',
      evaluation: {
        sources: {
          tenant: { kind: 'absent' },
          organization: { kind: withOrganization ? 'available' : 'unavailable' },
        },
      },
    })
    if (before.kind !== 'current') throw new Error(JSON.stringify(before))
    expect(evaluatePermission(before.evaluation)).toMatchObject(
      withOrganization
        ? { kind: 'effective', value: 'auto', permitsOperation: true }
        : { kind: 'unavailable', missingBasis: ['organization'] },
    )
    const prepared = await w.prepared.prepareChange(w.principal, w.command)
    if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
    expect(
      await w.prepared.commitChange(w.principal, {
        requestId: 'commit',
        preparation: prepared.preparation,
      }),
    ).toMatchObject({ kind: 'committed' })
    const after = await w.permissionBasis.readCurrent(w.principal, request)
    expect(after.kind).toBe('current')
    if (after.kind !== 'current') throw new Error(JSON.stringify(after))
    expect(evaluatePermission(after.evaluation)).toMatchObject({
      kind: 'denied',
      reason: 'active-prohibition',
    })
    expect(after.evaluation.sources.tenant).not.toEqual(before.evaluation.sources.tenant)
    if (source && qualified) {
      expect(await qualified.control.recover({ after: null, limit: 10 })).toMatchObject({
        kind: 'recovered',
      })
      expect(
        await source.set({ pick: 'deny', allowedSet: null }, 1, 'organization-deny'),
      ).toMatchObject({ kind: 'committed' })
      expect(
        await w.owner.changeHolding({
          operationId: 'change-source-owner',
          holdingRef: w.target.targetRef,
          scopeRef: w.target.scopeRef,
          expectedRevision: 1,
          change: {
            kind: 'updateSources',
            sources: [
              {
                sourceId: 'tenant',
                ownerRef: 'new-owner',
                scope: { kind: 'tenant', subjectRef: w.scope.tenantRef },
              },
            ],
            grants: [{ sourceId: 'tenant', actions: ['set', 'clear'] }],
          },
        }),
      ).toMatchObject({ kind: 'committed' })
      const partial = await w.permissionBasis.readCurrent(w.principal, request)
      expect(partial).toMatchObject({
        kind: 'current',
        evaluation: {
          sources: {
            tenant: { kind: 'unavailable' },
            organization: { kind: 'available', rule: { pick: 'deny' } },
          },
        },
      })
      if (partial.kind !== 'current') throw new Error(JSON.stringify(partial))
      expect(evaluatePermission(partial.evaluation)).toMatchObject({
        kind: 'denied',
        reason: 'active-prohibition',
      })
    }
    expect(await w.withdraw()).toMatchObject({ kind: 'released' })
    expect(await w.permissionBasis.readCurrent(w.principal, request)).toMatchObject({
      kind: 'unavailable',
    })
  },
)
