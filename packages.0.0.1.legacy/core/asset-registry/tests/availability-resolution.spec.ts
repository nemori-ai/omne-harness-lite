import assert from 'node:assert/strict'
import { describe, expect, it } from 'vitest'
import {
  evaluate,
  type NonConnectorAssetDefinition,
  type NonConnectorEvaluationInput,
} from '@omne-harness-lite/asset-evaluation'
import { toOpaqueJson } from '@omne-harness-lite/content-blocks'
import { isToolDefinition, type ToolDefinition } from '@omne-harness-lite/tool-definition'
import { isSkillPackage, type SkillPackage } from '@omne-harness-lite/skill-package/v2'
import {
  buildTableContents,
  capability,
  computeAvailability,
  computeTableAvailability,
  dependenciesOf,
  effective,
  getAssetJudge,
  own,
  requiredOwn,
  type AvailabilityFacts,
  type CommandAvailability,
  type RegistryEntry,
  type TablePlan,
} from '../src/index.ts'
import { fixture, now, root, tool, a, b } from './support.ts'

const ask = { category: 'tool', name: 'omne-official:Ask' } satisfies RegistryEntry['capability']
const ordinary = { category: 'tool', name: 'example:Ask' } satisfies RegistryEntry['capability']
const skill = { category: 'skill', name: 'example:reader' } satisfies RegistryEntry['capability']
const serviceA = { kind: 'external_service', name: 'service_a' }
const serviceB = { kind: 'external_service', name: 'service_b' }
const toolDependency = { kind: 'tool', capability: tool }

function asset(
  id: NonConnectorAssetDefinition['capability'],
  content: NonConnectorAssetDefinition['versions'][number]['content'],
): NonConnectorAssetDefinition {
  const definition: NonConnectorAssetDefinition = {
    id: `ast_${id.category}_${id.name.replace(':', '_')}`,
    capability: id,
    origin: 'official',
    versions: [{ number: 1, content, publishedAt: now }],
  }
  expect(getAssetJudge().judgeAssetValue('AssetDefinition', definition)).toEqual({ ok: true })
  return definition
}

function createDependencyFixture(services: readonly string[]) {
  const base = fixture()
  const order = [skill, b, ordinary, tool, a, ask]
  const references = order.map(id => ({
    capability: id,
    ...(id.category === 'tool' || id.category === 'skill' ? { resident: true } : {}),
  }))
  const rootDefinition = asset(root, {
    category: 'agent_definition',
    body: toOpaqueJson({ references, attributes: [] }),
  })
  const tools = [tool, ask, ordinary].map(id => {
    const input = { type: 'object', properties: {}, additionalProperties: false }
    const shared = {
      name: id.name,
      description: 'Read or request input',
      origin: { kind: 'authored' },
      permissions: { execute: { default: 'auto' } },
      needs: { externalServices: services },
    } satisfies Partial<ToolDefinition>
    const body: ToolDefinition =
      id === tool
        ? { ...shared, paradigm: 'single', input }
        : {
            ...shared,
            paradigm: 'multi',
            commands: {
              request_approval: { description: 'Request approval', input },
              request_input: { description: 'Request input', input },
            },
          }
    expect(isToolDefinition(body)).toBe(true)
    const value = own(body)
    assert(value !== undefined)
    return asset(id, { category: 'tool', definition: value })
  })
  const skillBody = {
    manifest: { name: skill.name, description: 'Read content' },
    body: 'Read the requested content.',
    definition: { format: 1, tools: [tool] },
    resources: [],
  } satisfies SkillPackage
  expect(isSkillPackage(skillBody)).toBe(true)
  const skillValue = own(skillBody)
  assert(skillValue !== undefined)
  const definitions = [
    rootDefinition,
    ...tools,
    asset(skill, { category: 'skill', body: skillValue }),
    ...[a, b].map(id =>
      asset(id, {
        category: 'loop_extension',
        extension: {
          name: id.name,
          position: 'before_model_call',
          power: 'observe',
          implementation: { kind: 'builtin', builtinName: id.name },
          needs: ['service_a', 'service_b'],
        },
      }),
    ),
  ]
  const input: NonConnectorEvaluationInput = {
    tenant: base.input.tenant,
    standing: base.input.standing,
    root: {
      definition: root,
      references,
      attributes: [],
      source: { asset: rootDefinition.id, version: 1 },
    },
    definitions,
    holdings: definitions.map(definition => ({
      holder: { layer: 'factory' },
      capability: definition.capability,
      asset: definition.id,
      basis: { kind: 'official' },
      versionSelection: { kind: 'current' },
      immutable: false,
      assignments: [],
      since: now,
    })),
  }
  expect(order.every(capability)).toBe(true)
  const result = evaluate(input)
  assert('ok' in result, JSON.stringify(result))
  const evaluation = result.ok
  expect(effective(evaluation)).toEqual(evaluation)
  const built = buildTableContents(evaluation, order, definitions)
  assert('plans' in built, JSON.stringify(built))
  expect(built.plans.map(plan => plan.category)).toEqual([
    'tool',
    'skill',
    'slash_command',
    'loop_extension',
    'mcp',
    'plugin',
  ])
  return { evaluation, definitions, order, plans: built.plans }
}

const cachedDependencyFixtures = new Map<string, ReturnType<typeof createDependencyFixture>>()

function dependencyFixture(services: readonly string[] = []) {
  const key = JSON.stringify(services)
  const cached = cachedDependencyFixtures.get(key)
  if (cached !== undefined) return cached
  const value = requiredOwn(createDependencyFixture(services))
  cachedDependencyFixtures.set(key, value)
  return value
}

function entry(plans: readonly TablePlan[], id: RegistryEntry['capability']): RegistryEntry {
  const found = plans.flatMap(plan => plan.entries).find(item => item.capability.name === id.name)
  assert(found !== undefined)
  return found
}

describe('explicit dependency observations', () => {
  const cases: readonly {
    name: string
    observations: AvailabilityFacts['dependencies']
    issues: readonly { dependency: typeof serviceA; state: 'missing' | 'unreadable' }[]
  }[] = [
    {
      name: 'absent observations',
      observations: [],
      issues: [
        { dependency: serviceA, state: 'unreadable' },
        { dependency: serviceB, state: 'unreadable' },
      ],
    },
    {
      name: 'one satisfied declaration',
      observations: [{ dependency: serviceA, state: 'satisfied' }],
      issues: [{ dependency: serviceB, state: 'unreadable' }],
    },
    {
      name: 'missing and unreadable observations',
      observations: [
        { dependency: serviceA, state: 'missing' },
        { dependency: serviceB, state: 'unreadable' },
      ],
      issues: [
        { dependency: serviceA, state: 'missing' },
        { dependency: serviceB, state: 'unreadable' },
      ],
    },
    {
      name: 'duplicate satisfied observations',
      observations: [
        { dependency: serviceA, state: 'satisfied' },
        { dependency: serviceA, state: 'satisfied' },
        { dependency: serviceB, state: 'satisfied' },
      ],
      issues: [{ dependency: serviceA, state: 'unreadable' }],
    },
  ]

  it.each(cases)('requires unique satisfaction for $name', ({ observations, issues }) => {
    const f = dependencyFixture(['service_a', 'service_b'])
    for (const id of [tool, a]) {
      const original = entry(f.plans, id)
      const declarations = dependenciesOf(original, f.evaluation)
      expect(declarations).toEqual([serviceA, serviceB])
      const before = structuredClone(original)
      const result = computeAvailability(original, declarations, { dependencies: observations })
      expect(result).toEqual({
        ...before,
        availability:
          id.category === 'tool'
            ? { kind: 'stand_in', for: issues }
            : { kind: 'unavailable', reason: issues },
      })
      expect(original).toEqual(before)
      expect(result).not.toBe(original)
      expect(Object.isFrozen(result.availability)).toBe(true)
    }
  })

  it('matches equal dependency values independently of observation order and ignores unrelated facts', () => {
    const f = dependencyFixture(['service_a', 'service_b'])
    for (const id of [tool, a]) {
      const original = entry(f.plans, id)
      const result = computeAvailability(original, dependenciesOf(original, f.evaluation), {
        dependencies: [
          { dependency: { name: 'service_b', kind: 'external_service' }, state: 'satisfied' },
          { dependency: { kind: 'external_service', name: 'unrelated' }, state: 'missing' },
          { dependency: { name: 'service_a', kind: 'external_service' }, state: 'satisfied' },
        ],
      })
      expect(result).toEqual({ ...original, availability: { kind: 'available' } })
      expect(result).not.toHaveProperty('commandAvailability')
    }
  })

  it('uses stand-in skill results until its declared tool observation is satisfied', () => {
    const f = dependencyFixture()
    const original = entry(f.plans, skill)
    const declarations = dependenciesOf(original, f.evaluation)
    expect(declarations).toEqual([toolDependency])
    expect(computeAvailability(original, declarations, { dependencies: [] })).toEqual({
      ...original,
      availability: {
        kind: 'stand_in',
        for: [{ dependency: toolDependency, state: 'unreadable' }],
      },
    })
    expect(
      computeAvailability(original, declarations, {
        dependencies: [{ dependency: toolDependency, state: 'satisfied' }],
      }),
    ).toEqual({ ...original, availability: { kind: 'available' } })
  })
})

describe('multi-tool command availability', () => {
  const modes: readonly {
    name: string
    facts: AvailabilityFacts
    approval: CommandAvailability
  }[] = [
    {
      name: 'unreadable',
      facts: { dependencies: [] },
      approval: { kind: 'unavailable', reason: 'run_mode_unreadable' },
    },
    {
      name: 'never',
      facts: { dependencies: [], runMode: 'never' },
      approval: { kind: 'unavailable', reason: 'run_mode_never' },
    },
    { name: 'auto', facts: { dependencies: [], runMode: 'auto' }, approval: { kind: 'available' } },
    { name: 'ask', facts: { dependencies: [], runMode: 'ask' }, approval: { kind: 'available' } },
  ]
  it.each(modes)('gates only official approval when run mode is $name', ({ facts, approval }) => {
    const f = dependencyFixture()
    for (const id of [ask, ordinary]) {
      const original = entry(f.plans, id)
      const declarations = dependenciesOf(original, f.evaluation)
      expect(declarations).toEqual([])
      expect(computeAvailability(original, declarations, facts)).toEqual({
        ...original,
        availability: { kind: 'available' },
        commandAvailability: {
          request_approval: id === ask ? approval : { kind: 'available' },
          request_input: { kind: 'available' },
        },
      })
    }
  })

  it('removes an earlier command table when a declared service becomes missing', () => {
    const f = dependencyFixture(['service_a', 'service_b'])
    const original = entry(f.plans, ask)
    const declarations = dependenciesOf(original, f.evaluation)
    expect(declarations).toEqual([serviceA, serviceB])
    const available = computeAvailability(original, declarations, {
      dependencies: [
        { dependency: serviceA, state: 'satisfied' },
        { dependency: serviceB, state: 'satisfied' },
      ],
      runMode: 'auto',
    })
    expect(available.commandAvailability).toEqual({
      request_approval: { kind: 'available' },
      request_input: { kind: 'available' },
    })
    const failed = computeAvailability(available, declarations, {
      dependencies: [
        { dependency: serviceA, state: 'satisfied' },
        { dependency: serviceB, state: 'missing' },
      ],
      runMode: 'auto',
    })
    expect(failed).toEqual({
      ...original,
      availability: { kind: 'stand_in', for: [{ dependency: serviceB, state: 'missing' }] },
    })
    expect(failed).not.toHaveProperty('commandAvailability')
  })
})

describe('table dependency resolution', () => {
  it.each([false, true])(
    'resolves skills using this computation when tools need services: %s',
    blocked => {
      const f = dependencyFixture(blocked ? ['service_a', 'service_b'] : [])
      const plans = [...f.plans].reverse()
      const before = structuredClone(plans)
      const resolved = computeTableAvailability(plans, f.evaluation)
      expect(resolved.map(plan => plan.category)).toEqual([
        'plugin',
        'mcp',
        'loop_extension',
        'slash_command',
        'skill',
        'tool',
      ])
      expect(resolved.map(plan => plan.entries.map(item => item.capability))).toEqual([
        [],
        [],
        [b, a],
        [],
        [skill],
        [ordinary, tool, ask],
      ])
      expect(entry(resolved, tool).availability).toEqual(
        blocked
          ? {
              kind: 'stand_in',
              for: [
                { dependency: serviceA, state: 'unreadable' },
                { dependency: serviceB, state: 'unreadable' },
              ],
            }
          : { kind: 'available' },
      )
      expect(entry(resolved, skill).availability).toEqual(
        blocked
          ? { kind: 'stand_in', for: [{ dependency: toolDependency, state: 'missing' }] }
          : { kind: 'available' },
      )
      expect(entry(resolved, a).availability).toEqual({
        kind: 'unavailable',
        reason: [
          { dependency: serviceA, state: 'unreadable' },
          { dependency: serviceB, state: 'unreadable' },
        ],
      })
      expect(plans).toEqual(before)
      expect(resolved).not.toBe(plans)
      expect(Object.isFrozen(resolved)).toBe(true)
      expect(Object.isFrozen(entry(resolved, skill))).toBe(true)
    },
  )

  it('treats a tool absent from the selected tables as missing', () => {
    const f = dependencyFixture()
    const selected = buildTableContents(f.evaluation, f.order, f.definitions, ['skill'])
    assert('plans' in selected)
    expect(selected.plans.map(plan => plan.category)).toEqual(['skill'])
    const result = computeTableAvailability(selected.plans, f.evaluation)
    expect(entry(result, skill).availability).toEqual({
      kind: 'stand_in',
      for: [{ dependency: toolDependency, state: 'missing' }],
    })
    expect(result).toEqual(selected.plans)
  })
})
