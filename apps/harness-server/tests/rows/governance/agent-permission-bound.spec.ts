import { describe, expect, it } from 'vitest'
import { evaluatePermission, type PermissionConstraint } from '@omne-harness/permissions'
import { readAgentPermissionConstraint } from '../../../src/rows/governance/agent-permission-bound.ts'
import { permissionFixture } from './permission-fixture.ts'
import {
  access,
  candidateOf,
  entryConfig,
  mappingConfig,
  withLiveTree,
} from '../adoptions/support.ts'

const bound = { capabilityId: 'commands', enforcementKey: 'commands.run', allowedSet: [] }
function config(permissionBounds?: readonly object[]) {
  return mappingConfig(
    entryConfig('alpha', {
      definition: {
        category: 'AgentDefinition',
        name: 'alpha',
        references: [],
        attributes: [],
        ...(permissionBounds === undefined ? {} : { permissionBounds }),
      },
    }),
  )
}
function evaluate(constraint: PermissionConstraint) {
  const fixture = permissionFixture()
  fixture.pick('trusted')
  fixture.current.evaluation.requiredConstraintIds = ['agent-definition']
  fixture.current.evaluation.constraints = [constraint]
  return evaluatePermission(fixture.current.evaluation)
}

describe('exact adopted Agent definition permission constraint', () => {
  it('keeps an empty author bound prohibitive after the real adoption service resolves it', async () => {
    const fixture = permissionFixture()
    const { value } = await withLiveTree(config([bound]), ({ agent }) =>
      readAgentPermissionConstraint({
        adoptions: agent,
        resolution: { ...access, adoption: candidateOf('alpha') },
        scope: fixture.action.request.scope,
        definition: fixture.released.definition,
      }),
    )
    expect(value).toMatchObject({ kind: 'available', effect: { kind: 'bound', allowedSet: [] } })
    expect(evaluate(value)).toMatchObject({ kind: 'denied', reason: 'empty-bound' })
  })
  it.each([
    { label: 'no author restriction', bounds: undefined },
    {
      label: 'different enforcement key',
      bounds: [{ ...bound, enforcementKey: 'commands.install' }],
    },
  ])('preserves other governance when there is $label', async ({ bounds }) => {
    const fixture = permissionFixture()
    const { value } = await withLiveTree(config(bounds), ({ agent }) =>
      readAgentPermissionConstraint({
        adoptions: agent,
        resolution: { ...access, adoption: candidateOf('alpha') },
        scope: fixture.action.request.scope,
        definition: fixture.released.definition,
      }),
    )
    expect(value).toMatchObject({
      kind: 'available',
      effect: { allowedSet: ['blocked', 'review', 'trusted'] },
    })
    expect(evaluate(value)).toMatchObject({ kind: 'effective', value: 'trusted' })
    fixture.current.evaluation.requiredConstraintIds = ['agent-definition']
    fixture.current.evaluation.constraints = [value]
    fixture.pick('blocked')
    expect(evaluatePermission(fixture.current.evaluation)).toMatchObject({ kind: 'denied' })
  })

  it('does not fall back to a different revision of the same definition identity', async () => {
    const fixture = permissionFixture()
    const { value } = await withLiveTree(config(), ({ agent }) =>
      readAgentPermissionConstraint({
        adoptions: agent,
        resolution: { ...access, adoption: { ...candidateOf('alpha'), revision: 'old' } },
        scope: fixture.action.request.scope,
        definition: fixture.released.definition,
      }),
    )
    expect(value.kind).toBe('unavailable')
    expect(evaluate(value)).toMatchObject({ kind: 'unavailable' })
  })

  it('does not discard an unsupported author value to turn the bound into no restriction', async () => {
    const fixture = permissionFixture()
    const { value } = await withLiveTree(
      config([{ ...bound, allowedSet: ['retired-value'] }]),
      ({ agent }) =>
        readAgentPermissionConstraint({
          adoptions: agent,
          resolution: { ...access, adoption: candidateOf('alpha') },
          scope: fixture.action.request.scope,
          definition: fixture.released.definition,
        }),
    )
    expect(value.kind).toBe('unavailable')
    expect(evaluate(value)).toMatchObject({ kind: 'unavailable' })
  })

  it('converts a failed owner read to unavailable without publishing its exception', async () => {
    const fixture = permissionFixture()
    const value = await readAgentPermissionConstraint({
      adoptions: {
        resolve: async () => {
          throw new Error('private-source-detail')
        },
      },
      resolution: { ...access, adoption: candidateOf('alpha') },
      scope: fixture.action.request.scope,
      definition: fixture.released.definition,
    })
    expect(value.kind).toBe('unavailable')
    expect(JSON.stringify(value)).not.toContain('private-source-detail')
  })
})
