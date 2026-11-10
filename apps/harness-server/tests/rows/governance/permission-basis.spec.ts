// The permission basis participant and its guard, run with explicit facts. The projection read
// test and the release tree tests run them in the real provider.
import { expect, it } from 'vitest'
import { canonicalText } from '@omne-harness/authorization'
import {
  evaluatePermission,
  type PermissionBasisRequest,
  type PermissionConstraint,
} from '@omne-harness/permissions'
import {
  SESSION_PERMISSION_CURRENT_FACT,
  type SessionPermissionCurrent,
} from '@omne-harness/session-storage-sql/participants'
import type { FactKey, JsonValue } from '@omne-harness/sql-contract'
import { canonicalDigest } from '@omne-harness/tool'
import {
  PERMISSION_BASIS,
  PERMISSION_BASIS_GUARD,
  permissionBasisCommands,
  permissionBasisFact,
  permissionBasisGuardCommand,
  permissionBasisSchema,
} from '../../../src/rows/governance/permission-basis.ts'
import basisParticipant from '../../../src/rows/governance/permission-basis-participant.ts'
import guardParticipant from '../../../src/rows/governance/permission-basis-guard-participant.ts'
import { targetSnapshotFact } from '../../../src/rows/governance/target-snapshot.ts'
import { settingsSnapshotFixture } from './settings-snapshot-fixture.ts'

function world() {
  const { snapshot } = settingsSnapshotFixture()
  snapshot.binding.mode = 'runtime'
  // The binding schema of the commands requires a canonical tenant reference.
  const tenantRef = JSON.stringify({
    organization: 'org_00000000000000000000000001',
    account: 'acc_00000000000000000000000002',
  })
  snapshot.binding.scope = {
    ...snapshot.binding.scope,
    tenantRef,
    visibility: { kind: 'tenant', tenantRef },
  }
  const definition = snapshot.declaration.permissions[0]!
  const binding = snapshot.enforcementBindings.find(
    value =>
      value.capabilityId === definition.capabilityId &&
      value.enforcementKey === definition.enforcementKey,
  )!
  const permission: PermissionBasisRequest = {
    scope: {
      tenantId: snapshot.binding.scope.tenantRef,
      organizationId: 'organization',
      sessionId: 'session',
      targetId: canonicalText(snapshot.binding.target),
      deploymentId: snapshot.binding.scope.deploymentId,
      logicalServiceId: snapshot.binding.scope.logicalServiceId,
    },
    definition: definition.reference,
    operation: { owner: 'tool', operationId: 'call' },
    implementationRef: binding.implementationRef,
    argumentsDigest: 'a'.repeat(64),
    capabilityId: binding.capabilityId,
    enforcementKey: binding.enforcementKey,
  }
  const source = { owner: 'session', record: 'permission', revision: '1', digest: 'sha256:fixture' }
  const session: SessionPermissionCurrent = {
    kind: 'current',
    tenant: permission.scope.tenantId,
    session: 'session',
    capabilityId: permission.capabilityId,
    enforcementKey: permission.enforcementKey,
    revision: '1',
    source,
    mode: {
      adopted: {
        kind: 'tenant-default',
        source: { owner: 'session', name: 'modes', revision: '1', digest: 'sha256:modes' },
      },
      override: null,
    },
    assignment: null,
  }
  const request = {
    snapshot: snapshot.binding,
    permission,
    session,
    constraints: [] as PermissionConstraint[],
    requiredConstraintIds: [] as string[],
  }
  const facts = new Map<string, JsonValue>([
    [targetSnapshotFact.key, snapshot as unknown as JsonValue],
    [SESSION_PERMISSION_CURRENT_FACT.key, session as unknown as JsonValue],
  ])
  const port = {
    execute: () => {
      throw new Error('the basis participant reads no table')
    },
    requireFact: (fact: FactKey) => {
      const value = facts.get(fact.key)
      if (value === undefined) throw new Error(`missing ${fact.key}`)
      return value
    },
    provideFact: (fact: FactKey, value: JsonValue) => {
      facts.set(fact.key, value)
    },
  }
  const run = (changed: Partial<typeof request> = {}) =>
    basisParticipant.execute({ request: { ...request, ...changed } as unknown as JsonValue }, port)
  return { snapshot, definition, permission, session, source, request, facts, port, run }
}

it('computes the tenant-domain basis from the target snapshot and the Session permission', () => {
  const w = world()
  const reply = w.run()
  if (reply.kind !== 'participated') throw new Error(JSON.stringify(reply))
  const basis = permissionBasisSchema.parse(reply.response)
  expect(basis.permission).toEqual(w.permission)
  expect(basis.evaluation.sources.session).toMatchObject({ kind: 'absent' })
  // The organization layer is in another domain: this participant leaves it unavailable.
  expect(basis.evaluation.sources.organization).toMatchObject({ kind: 'unavailable' })
  expect(w.facts.get(permissionBasisFact.key)).toEqual(reply.response)
})

it('applies a Session prohibition and the constraints of the origin of the action', () => {
  const w = world()
  w.session.assignment = {
    capabilityId: w.permission.capabilityId,
    enforcementKey: w.permission.enforcementKey,
    definition: w.permission.definition,
    rule: { pick: 'deny', allowedSet: null },
    source: w.source,
  }
  w.facts.set(SESSION_PERMISSION_CURRENT_FACT.key, w.session as unknown as JsonValue)
  const constraint = { id: 'agent-definition', kind: 'unavailable' as const, sourceRef: 'agent' }
  const reply = w.run({ constraints: [constraint], requiredConstraintIds: ['agent-definition'] })
  if (reply.kind !== 'participated') throw new Error(JSON.stringify(reply))
  const { evaluation } = permissionBasisSchema.parse(reply.response)
  expect(evaluation.constraints).toEqual([constraint])
  expect(evaluatePermission(evaluation)).toMatchObject({
    kind: 'denied',
    reason: 'active-prohibition',
  })
})

it('does not participate for another snapshot binding or another Session observation', () => {
  const w = world()
  expect(w.run({ snapshot: { ...w.snapshot.binding, captureId: 'other-read' } })).toEqual({
    kind: 'unsupported',
    basis: { reason: 'permission-basis-binding' },
  })
  expect(w.run({ session: { ...w.session, revision: '2' } })).toEqual({
    kind: 'unsupported',
    basis: { reason: 'permission-basis-session' },
  })
  expect(w.facts.has(permissionBasisFact.key)).toBe(false)
})

it('guards the basis by its digest', () => {
  const w = world()
  const reply = w.run()
  if (reply.kind !== 'participated') throw new Error(JSON.stringify(reply))
  const basis = permissionBasisSchema.parse(reply.response)
  const command = permissionBasisGuardCommand(basis)
  expect(command).toEqual({
    participant: PERMISSION_BASIS_GUARD.participant,
    facts: { digest: canonicalDigest(basis) },
  })
  expect(guardParticipant.execute(command.facts, w.port)).toEqual({
    kind: 'participated',
    response: null,
  })
  basis.evaluation.adoptionRevision = 'changed'
  w.facts.set(permissionBasisFact.key, basis as unknown as JsonValue)
  expect(guardParticipant.execute(command.facts, w.port)).toEqual({
    kind: 'conflict',
    basis: { reason: 'permission-basis-changed' },
  })
  expect(guardParticipant.execute({}, w.port)).toMatchObject({ kind: 'unsupported' })
})

it('ends both command lists with the Session guard and the basis command', () => {
  const w = world()
  for (const configuration of ['mapped', 'unmapped'] as const) {
    const names = permissionBasisCommands(w.request, configuration).map(
      command => command.participant,
    )
    expect(names.slice(-2)).toEqual(['session-permission-guard', PERMISSION_BASIS.participant])
    expect(names).not.toContain('session-execution-guard')
    expect(names).not.toContain('harness.tool-record-current')
  }
})
