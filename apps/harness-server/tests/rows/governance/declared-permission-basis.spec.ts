import { describe, expect, it } from 'vitest'
import { evaluatePermission, type PermissionBasisRequest } from '@omne-harness/permissions'
import type { SessionPermissionCurrent } from '@omne-harness/session-storage-sql/participants'
import { IMPLICIT_TOOL_GATE } from '@omne-harness/tool-contract'
import { heldToolPermission } from '../../../src/entry/tool-permission-release.ts'
import { declaredPermission } from '../../../src/rows/authorization/current-tool-permission.ts'
import { declaredPermissionBasis } from '../../../src/rows/governance/declared-permission-basis.ts'
import { interpretPermission } from '../../../src/rows/governance/permission-interpreter.ts'
import { permissionFixture } from './permission-fixture.ts'

const adoption = (digest = 'sha256:one') => ({
  owner: '@omne-harness/assets',
  name: 'wordcount',
  revision: 'tool/wordcount',
  digest,
})
const declare = (digest?: string) =>
  heldToolPermission({
    name: 'wordcount',
    adoption: adoption(digest),
    definition: 'sha256:definition',
    gates: [{ ...IMPLICIT_TOOL_GATE, commands: [] }],
  })

function world(digest?: string) {
  const governance = declare(digest)
  const entry = {
    asset: { category: 'tool', name: 'wordcount' },
    definition: adoption(digest),
    tenantRef: 'tenant-a',
    governance,
    holdingRef: 'harness.held.tool.wordcount',
    unpublished: true as const,
  }
  const found = declaredPermission([entry], {
    capability: entry.asset,
    definition: adoption(digest),
    gate: IMPLICIT_TOOL_GATE,
  })
  if (found === undefined) throw new Error('the declaration does not name its own gate')
  const { binding, definition } = found.interpretation
  const request: PermissionBasisRequest = {
    scope: {
      tenantId: 'tenant-a',
      targetId: 'target-a',
      organizationId: 'organization-a',
      sessionId: 'session-a',
      deploymentId: 'local',
      logicalServiceId: 'harness',
    },
    operation: { owner: 'agent', operationId: 'action-1' },
    implementationRef: binding.implementationRef,
    argumentsDigest: 'a'.repeat(64),
    capabilityId: binding.capabilityId,
    enforcementKey: binding.enforcementKey,
    definition: definition.reference,
  }
  const source = { owner: 'session', record: 'permission', revision: '1', digest: 'sha256:row' }
  const session: SessionPermissionCurrent = {
    kind: 'current',
    tenant: request.scope.tenantId,
    session: 'session-a',
    capabilityId: request.capabilityId,
    enforcementKey: request.enforcementKey,
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
  const declared = { definition, reference: governance.declaration.reference }
  const decide = (basis: NonNullable<ReturnType<typeof declaredPermissionBasis>>) =>
    interpretPermission({
      released: found.interpretation,
      action: { binding, request },
      current: { kind: 'current', request, evaluation: basis.evaluation },
    })
  return { governance, found, request, session, source, declared, decide }
}

describe('the gate of a tool a tenant holds, declared and not stored', () => {
  it('declares one permission with no settings item, which a session can set and a tenant cannot', () => {
    const { governance } = world()
    expect(governance.declaration.settings).toEqual([])
    expect(governance.declaration.permissions).toHaveLength(1)
    expect(governance.declaration.permissions[0]).toMatchObject({
      capabilityId: 'held-tool.wordcount',
      enforcementKey: 'tool.invoke',
      settings: null,
      assignmentLayers: ['session'],
      defaultRule: { pick: 'ask', allowedSet: null },
    })
    expect(governance.declaration.permissions[0]?.supportedScopes.map(scope => scope.kind)).toEqual(
      ['one-time-call', 'session'],
    )
  })

  it('is another permission when the held version is another', () => {
    const one = world('sha256:one').request.definition
    const other = world('sha256:other').request.definition
    expect(other).not.toEqual(one)
  })

  it('asks by its declared default when the session set nothing', () => {
    const w = world()
    const basis = declaredPermissionBasis(w.declared, w.request, {
      session: w.session,
      constraints: [],
    })
    if (basis === undefined) throw new Error('no basis')
    expect(evaluatePermission(basis.evaluation)).toMatchObject({ kind: 'effective', value: 'ask' })
    expect(w.decide(basis)).toMatchObject({ kind: 'need-decision' })
  })

  it('follows the rule the session set for this gate', () => {
    const w = world()
    const assigned = (pick: string): SessionPermissionCurrent => ({
      ...w.session,
      assignment: {
        capabilityId: w.request.capabilityId,
        enforcementKey: w.request.enforcementKey,
        definition: w.request.definition,
        rule: { pick, allowedSet: null },
        source: w.source,
      },
    })
    const under = (pick: string) => {
      const basis = declaredPermissionBasis(w.declared, w.request, {
        session: assigned(pick),
        constraints: [],
      })
      if (basis === undefined) throw new Error('no basis')
      return w.decide(basis).kind
    }
    expect(under('deny')).toBe('deny')
    expect(under('auto')).toBe('allow')
  })

  it('gives no basis for the row of another gate, nor for a permission that has a settings item', () => {
    const w = world()
    const other = { ...w.session, enforcementKey: 'tool.other' }
    expect(
      declaredPermissionBasis(w.declared, w.request, { session: other, constraints: [] }),
    ).toBeUndefined()
    const stored = permissionFixture().released.definition
    const withItem = {
      ...w.declared,
      definition: { ...stored, settings: { ...w.declared.definition, itemId: 'x' } as never },
    }
    expect(
      declaredPermissionBasis(withItem, w.request, { session: w.session, constraints: [] }),
    ).toBeUndefined()
  })
})
