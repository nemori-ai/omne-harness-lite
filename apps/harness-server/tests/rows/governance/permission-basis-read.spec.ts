// @module-tag slow
// The current permission of a real Agent action, read with the real provider, the real Session
// storage, the real Agent journal and adopted Governance. A check is a read. The condition of the
// reading makes a later commit fail when a tenant-domain fact changed after the check.
//
// The world is the mapped one: its target has Settings values. The unmapped command list is
// covered by permission-basis.spec.ts and its snapshot participant by the boundaries script; the
// fixture world holds its asset under a target that the production mapping does not derive.
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
  // The combination of a commit that carries the condition: the basis members, their table
  // owners and the guard.
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
      // Counts the commits that a check sends. A check must send none.
      storage: {
        ...w.storage,
        commit: (...args) => {
          commits += 1
          return w.storage.commit(...args)
        },
      },
      domain: w.domain,
      epoch: w.epoch,
      // Counts the standing reads and lets the test change the answer of Identity.
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

    // The reading carries the bound of the original Agent definition.
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

    // An inquiry of another Session permission revision gives no reading.
    const published = inquiry
    inquiry = { ...inquiry, basis: { ...inquiry.basis, permissionRevision: '999' } }
    expect(await read.readCurrent(action())).toMatchObject({
      reading: { kind: 'unavailable' },
      condition: null,
    })
    inquiry = published

    // P3: the Agent commits its own progress during the check, after the origin is qualified.
    // The execution revision is not part of the basis, so the check still gives the reading.
    advanceAfterQualification = true
    const raced = await read.readCurrent(action())
    expect(advanced?.after).not.toBe(advanced?.before)
    expect(current(raced.reading).evaluation).toEqual(basis.evaluation)
    advanceAfterQualification = false
    // The progress commit changed the arguments of the action. Later checks use them.
    // One check maps the action once: the reading comes with the request of that action, so a
    // reading for another request cannot be asked for.
    const changed = await read.readCurrent(action(CHANGED))
    expect(changed.request?.argumentsDigest).toBe(effectiveArgumentsOf(CHANGED).digest)
    expect(current(changed.reading).request).toEqual(changed.request)

    // P2: Identity is in another domain. Each check reads the standing of that moment.
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

    // P4: every check above was a read.
    expect(commits).toBe(0)

    // P1: while the facts are the ones that the check saw, a commit with the condition holds.
    const held = await read.readCurrent(action(CHANGED))
    expect(held.condition).not.toBeNull()
    expect(await commit(held.condition!['commands'])).toMatchObject({ kind: 'committed' })
    // The adoption changes after the check. The same condition now stops the commit.
    expect(
      await w.service.withdraw(w.access, {
        operationId: 'basis-read-withdraw',
        contribution: complete[0]!.contribution,
      }),
    ).toMatchObject({ kind: 'released' })
    const stopped = await commit(held.condition!['commands'])
    expect(stopped.kind).toBe('rolled_back')
    // The next check reads the new facts and gives no reading.
    expect(await read.readCurrent(action(CHANGED))).toMatchObject({
      reading: { kind: 'unavailable' },
      condition: null,
    })
  })
}, 30_000)
