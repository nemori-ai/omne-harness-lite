import { releasedDeclaration } from '../../../src/entry/permission-declarations.ts'
// @module-tag slow
import { afterEach, expect, it } from 'vitest'
import { effectiveArgumentsOf } from '@omne-harness/authorization'
import { createGovernanceCollection } from '@omne-harness/governance-local'
import type { TenantStandingReading } from '@omne-harness/identity'
import { evaluatePermission, type PermissionBasisReading } from '@omne-harness/permissions'
import { sessionStorageMaterials } from '@omne-harness/session-storage-sql'
import type { ToolGate } from '@omne-harness/tool-contract'
import {
  PERMISSION_BASIS,
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

it('reads the basis of a real Agent action without a commit, and reads none once the contribution is withdrawn', async () => {
  const session = sessionStorageMaterials({ readOutputLimitBytes: 4 * 1024 * 1024 })
  const w = await settingsPreparationWorld({
    sessionWork: 'owner-session',
    extraParticipants: [...session.participants, permissionBasisParticipant()],
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
  const RUN: ToolGate = { id: 'run', title: '执行', default: 'ask' }
  const definition = w.declaration.permissions.find(p => p.enforcementKey === 'tool.run')!
  const config = mappingConfig(
    entryConfig('alpha', {
      definition: {
        category: 'AgentDefinition',
        type: 'master',
        summary: 'Works on what the person asks for.',
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
  let sessionReads = 0
  let standingReads = 0
  let standing: TenantStandingReading | undefined
  await withLiveTree(config, async ({ agent }) => {
    const read = createPermissionBasisRead({
      scope: w.scope,
      declarations: () =>
        w.release.kind === 'trusted' ? w.release.manifest.entries.map(releasedDeclaration) : [],
      storage: {
        ...w.storage,
        commit: (...args) => {
          commits += 1
          return w.storage.commit(...args)
        },
        read: input => {
          if (input.handler === 'session.permission-current') sessionReads += 1
          return w.storage.read(input)
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
        adoptions: agent,
      }),
      accepting: () => true,
    })
    const action = (effectiveArguments = request.effectiveArguments): ToolPermissionContext => ({
      inquiry,
      principal: w.principal,
      tenant: w.principal.tenant,
      operation: agentPermissionOperation(request),
      capability: { category: 'tool', name: request.definition.name },
      definition: request.definition,
      effectiveArguments,
      gate: RUN,
      origin: {
        kind: 'agent-action',
        execution: request.execution,
        passage: request.passage,
        action: request.action,
        advance: request.advance,
        original: request.original,
      },
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
    expect(Object.keys(first).sort()).toEqual(['authorizations', 'consumer', 'reading', 'request'])
    const inPass = action()
    const passed = await read.readCurrent({
      ...inPass,
      origin: { ...inPass.origin, kind: 'agent-action', pass: 'batch-1/pass-1' },
    } as ToolPermissionContext)
    expect(current(passed.reading).evaluation).toEqual(basis.evaluation)
    // A second action of the same pass and gate reads the session's rows no more.
    const readsOfPass = sessionReads
    const second = await read.readCurrent({
      ...inPass,
      origin: { ...inPass.origin, kind: 'agent-action', pass: 'batch-1/pass-1' },
    } as ToolPermissionContext)
    expect(current(second.reading).evaluation).toEqual(basis.evaluation)
    expect(sessionReads).toBe(readsOfPass)
    // An action outside a pass reads for itself: its own once authorization may be there.
    await read.readCurrent(action())
    expect(sessionReads).toBe(readsOfPass + 1)

    const published = inquiry
    inquiry = { ...inquiry, basis: { ...inquiry.basis, permissionRevision: '999' } }
    expect(await read.readCurrent(action())).toMatchObject({ reading: { kind: 'unavailable' } })
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
      authorizations: null,
      consumer: null,
    })
    standing = { kind: 'unavailable', diagnostic: 'fixture' }
    expect(await read.readCurrent(action(CHANGED))).toMatchObject({
      reading: { kind: 'unavailable' },
    })
    standing = undefined
    expect(standingReads).toBe(reads + 2)

    expect((await read.readCurrent(action(CHANGED))).reading).toMatchObject({ kind: 'current' })
    expect(commits).toBe(0)
    expect(
      await w.service.withdraw(w.access, {
        operationId: 'basis-read-withdraw',
        contribution: complete[0]!.contribution,
      }),
    ).toMatchObject({ kind: 'released' })
    expect(await read.readCurrent(action(CHANGED))).toMatchObject({
      reading: { kind: 'unavailable' },
    })
  })
}, 30_000)
