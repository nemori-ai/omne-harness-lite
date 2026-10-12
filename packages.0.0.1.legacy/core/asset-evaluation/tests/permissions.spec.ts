import { describe, expect, it } from 'vitest'
import { boundOf, classifyPermissionAssignment, pickWithinBound } from '../src/permissions.ts'
import type { PermissionDeclaration } from '../src/types.ts'
import { resolvePermission } from '../src/permissions.ts'

const execute: PermissionDeclaration = {
  item: 'execute',
  kind: 'permission',
  domain: { kind: 'enum', values: ['forbid', 'auto', 'ask'] },
  default: 'ask',
}
const value = (...allowed: string[]) => ({ allowed })
describe('S23 product table independent expected results', () => {
  const rows = [
    {
      name: 'author ask, tenant auto',
      default: 'ask',
      assignments: [{ layer: 'tenant', value: value('auto'), immutable: false }],
      expected: { value: value('auto'), from: 'tenant' },
    },
    {
      name: 'organization empty bound',
      default: 'ask',
      assignments: [
        { layer: 'organization', value: value(), immutable: true },
        { layer: 'tenant', value: value('auto'), immutable: false },
      ],
      expected: { value: value(), from: 'organization', lockedAt: 'organization' },
    },
    {
      name: 'tenant forbid is bound',
      default: 'ask',
      assignments: [
        { layer: 'organization', value: value('ask', 'forbid'), immutable: true },
        { layer: 'tenant', value: value('forbid'), immutable: false },
      ],
      expected: { value: value('forbid'), from: 'tenant', lockedAt: 'organization' },
    },
    {
      name: 'author fitting ask after skip',
      default: 'ask',
      assignments: [
        { layer: 'organization', value: value('ask'), immutable: true },
        { layer: 'tenant', value: value('auto'), immutable: false },
      ],
      expected: { value: value('ask'), from: 'factory', lockedAt: 'organization' },
    },
    {
      name: 'nearest ask, not forbid',
      default: 'auto',
      assignments: [{ layer: 'organization', value: value('ask', 'forbid'), immutable: true }],
      expected: { value: value('ask'), from: 'organization', lockedAt: 'organization' },
    },
    {
      name: 'unlocked forbid cannot be picked away',
      default: 'ask',
      assignments: [
        { layer: 'organization', value: value('forbid'), immutable: false },
        { layer: 'tenant', value: value('auto'), immutable: false },
      ],
      expected: { value: value('forbid'), from: 'organization', lockedAt: 'organization' },
    },
    {
      name: 'unlocked organization ask overridden',
      default: 'ask',
      assignments: [
        { layer: 'organization', value: value('ask'), immutable: false },
        { layer: 'tenant', value: value('auto'), immutable: false },
      ],
      expected: { value: value('auto'), from: 'tenant' },
    },
  ] satisfies readonly {
    name: string
    default: string
    assignments: Parameters<typeof resolvePermission>[1]
    expected: ReturnType<typeof resolvePermission>
  }[]
  for (const row of rows)
    it(row.name, () =>
      expect(resolvePermission({ ...execute, default: row.default }, row.assignments)).toEqual(
        row.expected,
      ),
    )
  it('bound/pick classification including unowned author default', () => {
    expect(
      classifyPermissionAssignment(execute, { value: value('forbid'), immutable: false }),
    ).toEqual({ role: 'bound', tiers: ['auto', 'ask', 'forbid'] })
    expect(
      classifyPermissionAssignment(execute, { value: value('ask'), immutable: false }).role,
    ).toBe('pick')
    expect(
      classifyPermissionAssignment(execute, { value: value('auto', 'ask'), immutable: true }).role,
    ).toBe('bound')
    expect(
      resolvePermission({ ...execute, default: 'forbid' }, [
        { layer: 'tenant', value: value('auto'), immutable: false },
      ]).value,
    ).toEqual(value('auto'))
  })
  it('intersection and explicit empty pick', () => {
    expect(boundOf(execute, [value('auto', 'ask'), value('ask', 'forbid')])).toEqual(value('ask'))
    expect(pickWithinBound(value(), value())).toBe(true)
    expect(pickWithinBound(value('auto'), value('ask'))).toBe(false)
    expect(pickWithinBound(value('auto', 'ask'), value('ask'))).toBe(true)
  })
  it('power subset is tiered; equal distance chooses stricter', () => {
    const declaration: PermissionDeclaration = {
      item: 'power',
      kind: 'permission',
      domain: { kind: 'enum', values: ['observe', 'rewrite'] },
      default: 'rewrite',
    }
    expect(
      classifyPermissionAssignment(declaration, { value: value('rewrite'), immutable: false })
        .tiers,
    ).toEqual(['veto', 'rewrite', 'observe'])
    expect(
      resolvePermission(
        { ...declaration, domain: { kind: 'enum', values: ['observe', 'rewrite', 'veto'] } },
        [{ layer: 'organization', value: value('observe', 'veto'), immutable: true }],
      ),
    ).toEqual({ value: value('observe'), from: 'organization', lockedAt: 'organization' })
  })
  it('non-tier bounds skip disjoint defaults and do not also act as picks', () => {
    const declaration: PermissionDeclaration = {
      item: 'network',
      kind: 'permission',
      domain: { kind: 'enum', values: ['allow', 'deny'] },
      default: 'deny',
    }
    expect(
      classifyPermissionAssignment(declaration, { value: value('deny'), immutable: false }),
    ).toEqual({ role: 'pick', tiers: null })
    expect(
      resolvePermission(declaration, [
        { layer: 'organization', value: value('allow'), immutable: true },
      ]),
    ).toEqual({ value: value('allow'), from: 'organization', lockedAt: 'organization' })
    expect(
      resolvePermission(declaration, [
        { layer: 'organization', value: value('allow'), immutable: true },
        { layer: 'tenant', value: value(), immutable: false },
      ]),
    ).toEqual({ value: value(), from: 'tenant', lockedAt: 'organization' })
  })
  it('workspace strict bounds have no author default pick or owned lock', () => {
    expect(resolvePermission({ ...execute, default: 'auto' }, [], value('ask'))).toEqual({
      value: value('ask'),
      from: 'factory',
    })
    expect(
      resolvePermission(
        execute,
        [{ layer: 'tenant', value: value('forbid'), immutable: false }],
        value('ask'),
      ),
    ).toEqual({ value: value(), from: 'tenant', lockedAt: 'tenant' })
  })
})
