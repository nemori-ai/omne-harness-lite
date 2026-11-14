// @module-tag slow
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { effectiveArgumentsOf } from '@omne-harness/authorization'
import { createGovernanceCollection } from '@omne-harness/governance-local'
import type { TenantStandingReading } from '@omne-harness/identity'
import { evaluatePermission, type PermissionBasisReading } from '@omne-harness/permissions'
import { sessionStorageMaterials } from '@omne-harness/session-storage-sql'
import { SESSION_LOG_PARTICIPANTS } from '@omne-harness/session-storage-sql/participants'
import type { FactCommandV2 } from '@omne-harness/sql-contract'
import {
  PERMISSION_BASIS,
  PERMISSION_BASIS_GUARD,
  permissionBasisGuardParticipant,
  permissionBasisParticipant,
} from '../../../dist/rows/governance/permission-basis.js'
import { createPermissionBasisRead } from '../../../src/rows/governance/permission-basis-read.ts'
import {
  agentPermissionOperation,
  type ToolPermissionContext,
} from '../../../src/rows/authorization/current-tool-permission.ts'
import { candidateOf, entryConfig, mappingConfig, withLiveTree } from '../adoptions/support.ts'
import { createCaptureAgent } from './agent-capture-fixture.ts'
import { settingsPreparationWorld } from './settings-preparation-world.ts'

const worlds: Array<{ close(): Promise<unknown> }> = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

const CHANGED = '{"changed":true}'

const current = (reading: PermissionBasisReading) => {
  if (reading.kind !== 'current') throw new Error(JSON.stringify(reading))
  return reading
}

it('reads the basis of a real Agent action and guards a later commit with it', async () => {
  const session = sessionStorageMaterials({ readOutputLimitBytes: 4 * 1024 * 1024 })
  const w = await settingsPreparationWorld({
    sessionWork: 'owner-session',
    extraParticipants: [
      ...session.participants,
      permissionBasisParticipant(),
      permissionBasisGuardParticipant(),
    ],
    extraMigrations: session.migrations,
    extraReadHandlers: session.readHandlers,
    projectionMembers: [
      'governance.target-projection',
      'settings.value-projection',
      'harness.governance-target-snapshot',
      'session-permission-guard',
      PERMISSION_BASIS.participant,
    ],
  })
  worlds.push(w)
  const condition = await w.register('basis-condition', [
    ...w.snapshotParticipants,
    ...SESSION_LOG_PARTICIPANTS,
    'session-permission-guard',
    PERMISSION_BASIS.participant,
    PERMISSION_BASIS_GUARD.participant,
  ])
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
      selectedTargets: [w.target],
    },
  ]
  expect(
    await w.service.adopt(w.access, {
      scope: w.scope,
      operationId: 'basis-read-adopt',
      expectedDeclarationRevision: catalog.snapshot.declarationRevision,
      expectedAdoptionRevision: catalog.snapshot.adoptionRevision,
      collection: createGovernanceCollection({
        scope: w.scope,
        declarationRevision: catalog.snapshot.declarationRevision,
        complete: [{ ...complete[0]!, definition: w.declaration.reference }],
      }),
      complete,
    }),
  ).toMatchObject({ kind: 'adopted' })

  const original = await createCaptureAgent(w, candidateOf('alpha'))
  const { request } = original
  const definition = w.declaration.permissions[0]!
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
  let advanceAfterQualification = false
  let advanced: { before: string; after: string } | undefined
  let commits = 0
  let standingReads = 0
  let standing: TenantStandingReading | undefined
  await withLiveTree(config, async ({ agent }) => {
    const read = createPermissionBasisRead({
      scope: w.scope,
      release: () => w.release,
      storage: {
        ...w.storage,
        commit: (...args) => {
          commits += 1
          return w.storage.commit(...args)
        },
      },
      domain: w.domain,
      epoch: w.epoch,
      identity: {
        verifier: w.identity.verifier,
        standing: {
          read: async input => {
            standingReads += 1
            return standing ?? w.identity.standing.read(input)
          },
        },
      },
      read: w.extendedRead,
      conditions: { mapped: condition, unmapped: condition },
      origins: () => ({
        action: {
          async qualify(input) {
            const result = await original.qualifier.qualify(input)
            if (!('failure' in result) && advanceAfterQualification) {
              const committed = await original.commit(
                {
                  ...original.batch,
                  actions: original.batch.actions.map(action => ({
                    ...action,
                    effectiveArguments: CHANGED,
                  })),
                },
                'advance-after-qualified',
              )
              advanced = { before: result.ok.revision, after: committed.revision }
            }
            return result
          },
        },
        tool: null as never,
        toolAgent: null as never,
        adoptions: agent,
      }),
      accepting: () => true,
    })
    const action = (effectiveArguments = request.effectiveArguments): ToolPermissionContext => ({
      inquiry,
      principal: w.principal,
      tenant: w.principal.tenant,
      operation: agentPermissionOperation(request),
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
    })
    const commit = (commands: unknown) =>
      w.storage.commit({
        identity: {
          ...w.domain,
          operation: 'fixture.start',
          protocolVersion: '2',
          operationKey: randomUUID(),
        },
        ...condition,
        commands: commands as readonly FactCommandV2[],
      })

    const first = await read.readCurrent(action())
    expect(first.request).not.toBeNull()
    const basis = current(first.reading)
    expect(evaluatePermission(basis.evaluation)).toMatchObject({
      kind: 'denied',
      reason: 'empty-bound',
    })
    expect(basis.evaluation.constraints).toMatchObject([
      { id: 'agent-definition', kind: 'available', effect: { kind: 'bound', allowedSet: [] } },
    ])
    expect(first.condition).toMatchObject(condition)

    const published = inquiry
    inquiry = { ...inquiry, basis: { ...inquiry.basis, permissionRevision: '999' } }
    expect(await read.readCurrent(action())).toMatchObject({
      reading: { kind: 'unavailable' },
      condition: null,
    })
    inquiry = published

    advanceAfterQualification = true
    const raced = await read.readCurrent(action())
    expect(advanced?.after).not.toBe(advanced?.before)
    expect(current(raced.reading).evaluation).toEqual(basis.evaluation)
    advanceAfterQualification = false
    const changed = await read.readCurrent(action(CHANGED))
    expect(changed.request?.argumentsDigest).toBe(effectiveArgumentsOf(CHANGED).digest)
    expect(current(changed.reading).request).toEqual(changed.request)

    const reads = standingReads
    standing = { kind: 'not-member', evidence: { record: 'fixture', revision: '2' } }
    expect(await read.readCurrent(action(CHANGED))).toEqual({
      request: null,
      reading: { kind: 'denied' },
      condition: null,
    })
    standing = { kind: 'unavailable', diagnostic: 'fixture' }
    expect(await read.readCurrent(action(CHANGED))).toMatchObject({
      reading: { kind: 'unavailable' },
      condition: null,
    })
    standing = undefined
    expect(standingReads).toBe(reads + 2)

    expect(commits).toBe(0)

    const held = await read.readCurrent(action(CHANGED))
    expect(held.condition).not.toBeNull()
    expect(await commit(held.condition!['commands'])).toMatchObject({ kind: 'committed' })
    expect(
      await w.service.withdraw(w.access, {
        operationId: 'basis-read-withdraw',
        contribution: complete[0]!.contribution,
      }),
    ).toMatchObject({ kind: 'released' })
    const stopped = await commit(held.condition!['commands'])
    expect(stopped.kind).toBe('rolled_back')
    expect(await read.readCurrent(action(CHANGED))).toMatchObject({
      reading: { kind: 'unavailable' },
      condition: null,
    })
  })
}, 30_000)
