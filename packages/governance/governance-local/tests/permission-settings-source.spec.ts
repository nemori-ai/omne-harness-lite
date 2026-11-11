import { rmSync } from 'node:fs'
import { afterEach, expect, it } from 'vitest'
import {
  projectPermissionSettings,
  readPermissionSettingsSource,
  evaluatePermission,
  PermissionEvaluationSchema,
} from '@omne-harness/permissions'
import { definition, evaluation, scope } from '../../../assets/permissions/tests/fixtures.ts'
import {
  openSourceServiceWorld,
  source,
} from '../../../assets/settings-local/tests/source-service-world.ts'
import { sourceRequest } from '../../../assets/settings-local/tests/source-retention-world.ts'

const worlds: Awaited<ReturnType<typeof openSourceServiceWorld>>[] = []
afterEach(async () => {
  for (const w of worlds.splice(0)) {
    await w.close()
    rmSync(w.root, { recursive: true, force: true })
  }
})
it('projects actual persisted organization rules without losing their bound beneath a tenant pick', async () => {
  const projected = projectPermissionSettings(definition())
  if (projected.kind !== 'projected') throw new Error('Invalid declaration fixture')
  const permission = projected.permission
  const w = await openSourceServiceWorld(
    {
      async seal(request) {
        return { kind: 'terminal', request, outcome: 'aborted' }
      },
    },
    undefined,
    source,
    projected.definition,
  )
  worlds.push(w)
  const request = { ...sourceRequest(), source }
  const context = request.destination.identity.principalRef
  const currentScope = { ...scope, organizationId: source.target.scopeRef }
  function material(held: Awaited<ReturnType<typeof w.sources.service.reserve>>) {
    if (held.kind !== 'held') throw new Error(JSON.stringify(held))
    const snapshot = held.snapshot
    return readPermissionSettingsSource({
      definition: permission,
      scope: currentScope,
      layer: 'organization',
      sourceRef: 'settings/organization',
      revision: String(snapshot.state.revision),
      observation: {
        kind: 'available',
        definition: snapshot.projection.definition,
        descriptor: snapshot.projection.sources[0],
        source: snapshot.state.sources[0],
      },
    })
  }
  expect(material(await w.sources.service.reserve(context, request))).toEqual({
    kind: 'absent',
    revision: '0',
  })
  expect(await w.sources.service.settle(request)).toMatchObject({ kind: 'settled' })
  expect(await w.set({ pick: 'ask', allowedSet: ['deny', 'ask'] })).toMatchObject({
    kind: 'committed',
    revision: 1,
  })
  const next = { ...request, destination: { ...request.destination, attemptId: 'next-reading' } }
  const organization = material(await w.sources.service.reserve(context, next))
  expect(organization).toMatchObject({
    kind: 'available',
    rule: { pick: 'ask', allowedSet: ['deny', 'ask'] },
  })
  if (organization.kind === 'invalid-input') throw new Error(JSON.stringify(organization))
  const input = PermissionEvaluationSchema.parse(evaluation())
  input.scope = currentScope
  input.sources.organization = organization
  input.sources.tenant = {
    kind: 'available',
    sourceRef: 'fixture-tenant',
    revision: '1',
    scope: currentScope,
    definition: projected.permission.reference,
    rule: { pick: 'auto', allowedSet: null },
  }
  input.sources.session = { kind: 'absent', revision: '1' }
  input.constraints = []
  input.requiredConstraintIds = []
  expect(evaluatePermission(input)).toMatchObject({
    kind: 'effective',
    value: 'ask',
    allowedSet: ['deny', 'ask'],
  })
  expect(await w.sources.service.settle(next)).toMatchObject({ kind: 'settled' })
})
