import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { judgeAgentDefinition, judgeLoopExtensions } from '@omne-harness/agent-contract'

const implementation = { kind: 'builtin', builtinName: 'format' } as const

const legalDefinition = {
  category: 'AgentDefinition',
  name: 'coding',
  references: [],
  attributes: [],
}

it('accepts an empty definition and records an unpinned version', async () => {
  const judged = await judgeAgentDefinition(legalDefinition)
  expect(judged).toEqual({
    kind: 'accepted',
    value: {
      category: 'AgentDefinition',
      name: 'coding',
      version: { kind: 'then-legal-winner' },
      references: [],
      attributes: [],
    },
  })
})

it('pins a stated version', async () => {
  const judged = await judgeAgentDefinition({ ...legalDefinition, version: 'v2' })
  expect(judged.kind === 'accepted' && judged.value.version).toEqual({
    kind: 'pinned',
    version: 'v2',
  })
})

it('returns a definition that is frozen at every level and shares no object with the input', async () => {
  const input = {
    ...legalDefinition,
    version: 'v2',
    references: [
      { capability: { category: 'Tool', name: 'read' }, resident: true },
      { capability: { category: 'Skill', name: 'review' } },
    ],
    attributes: [{ item: 'model' }],
  }
  const judged = await judgeAgentDefinition(input)
  expect(judged.kind).toBe('accepted')
  if (judged.kind !== 'accepted') return
  const { value } = judged
  const [first, second] = value.references
  expect(Object.isFrozen(value)).toBe(true)
  expect(Object.isFrozen(value.version)).toBe(true)
  expect(Object.isFrozen(value.references)).toBe(true)
  expect(Object.isFrozen(first)).toBe(true)
  expect(Object.isFrozen(first?.capability)).toBe(true)
  expect(Object.isFrozen(second)).toBe(true)
  expect(Object.isFrozen(second?.capability)).toBe(true)
  expect(Object.isFrozen(value.attributes)).toBe(true)
  expect(Object.isFrozen(value.attributes[0])).toBe(true)
  expect(first?.capability).not.toBe(input.references[0]?.capability)
  expect(value.attributes[0]).not.toBe(input.attributes[0])
})

it('refuses a missing references slot, a null slot, a duplicate capability, and an unknown attribute', async () => {
  const { references, ...missing } = legalDefinition
  void references
  expect(await judgeAgentDefinition(missing)).toMatchObject({
    kind: 'refused',
    reason: 'malformed',
  })
  expect(await judgeAgentDefinition({ ...legalDefinition, references: null })).toMatchObject({
    kind: 'refused',
    reason: 'malformed',
  })
  expect(
    await judgeAgentDefinition({
      ...legalDefinition,
      references: [
        { capability: { category: 'Tool', name: 'read_file' } },
        { capability: { category: 'Tool', name: 'read_file' } },
      ],
    }),
  ).toMatchObject({ kind: 'refused', reason: 'duplicate-capability' })
  expect(
    await judgeAgentDefinition({
      ...legalDefinition,
      attributes: [{ item: 'persona' }],
    }),
  ).toMatchObject({ kind: 'refused', reason: 'unknown-attribute' })
})

it('rejects attribute fields other than item', async () => {
  expect(
    await judgeAgentDefinition({
      ...legalDefinition,
      attributes: [{ item: 'model', kind: 'setting' }],
    }),
  ).toMatchObject({ kind: 'refused', reason: 'malformed' })
  expect(
    await judgeAgentDefinition({
      ...legalDefinition,
      attributes: [{ item: 'model' }, { item: 'model' }],
    }),
  ).toMatchObject({ kind: 'refused', reason: 'malformed' })
})

it('does not fill an absent attribute', async () => {
  const judged = await judgeAgentDefinition(legalDefinition)
  expect(judged.kind === 'accepted' && judged.value.attributes).toEqual([])
})

it('refuses a function embedded in a definition', async () => {
  expect(await judgeAgentDefinition({ ...legalDefinition, run: () => undefined })).toMatchObject({
    kind: 'refused',
    reason: 'executable',
  })
})

it('returns extension declarations in submission order and refuses an illegal one', async () => {
  const accepted = await judgeLoopExtensions([
    { name: 'format', position: 'before_model_call', power: 'observe', implementation },
    { name: 'policy', position: 'before_action', power: 'veto', implementation },
  ])
  expect(accepted).toEqual({
    kind: 'accepted',
    value: [
      { name: 'format', position: 'before_model_call', power: 'observe', implementation },
      { name: 'policy', position: 'before_action', power: 'veto', implementation },
    ],
  })
  expect(
    await judgeLoopExtensions([
      {
        name: 'room',
        position: 'before_model_call',
        power: 'rewrite',
        implementation,
        source: 'workspace',
      },
    ]),
  ).toMatchObject({ kind: 'refused', reason: 'power-above-ceiling', index: 0 })
  expect(
    await judgeLoopExtensions([
      { name: 'x', position: 'not-a-position', power: 'observe', implementation },
    ]),
  ).toMatchObject({
    kind: 'refused',
    reason: 'unknown-position',
    index: 0,
  })
})

it('requires dimension only at the two positions that use it', async () => {
  expect(
    await judgeLoopExtensions([
      {
        name: 'ending',
        position: 'after_model_call',
        power: 'observe',
        implementation,
        dimension: { ending: 'complete_reply' },
      },
    ]),
  ).toMatchObject({ kind: 'accepted' })
  expect(
    await judgeLoopExtensions([
      { name: 'ending', position: 'after_model_call', power: 'observe', implementation },
    ]),
  ).toMatchObject({ kind: 'refused', reason: 'dimension-missing', index: 0 })
  expect(
    await judgeLoopExtensions([
      {
        name: 'format',
        position: 'before_model_call',
        power: 'observe',
        implementation,
        dimension: { ending: 'failure' },
      },
    ]),
  ).toMatchObject({ kind: 'refused', reason: 'dimension-not-allowed', index: 0 })
})

it('refuses a non-array extension batch and reports the failing index', async () => {
  expect(await judgeLoopExtensions({ name: 'format' })).toMatchObject({
    kind: 'refused',
    reason: 'malformed',
    index: 0,
  })
  expect(
    await judgeLoopExtensions([
      { name: 'format', position: 'before_model_call', power: 'observe', implementation },
      {
        name: 'bad',
        position: 'before_action',
        power: 'rewrite',
        implementation,
        source: 'workspace',
      },
    ]),
  ).toMatchObject({ kind: 'refused', reason: 'power-above-ceiling', index: 1 })
  expect(
    await judgeLoopExtensions([
      { name: 'x', position: 'before_model_call', power: 'grant', implementation },
    ]),
  ).toMatchObject({ kind: 'refused', reason: 'unknown-power', index: 0 })
})

it('lets an assembly caller and an asset caller share the public entry', async () => {
  const declaration = {
    category: 'AgentDefinition',
    name: 'coding',
    version: 'v2',
    references: [{ capability: { category: 'Tool', name: 'read_file' } }],
    attributes: [],
  }
  const extensions = [
    { name: 'format', position: 'before_model_call', power: 'observe', implementation },
  ]
  const assembly = {
    definition: await judgeAgentDefinition(declaration),
    extensions: await judgeLoopExtensions(extensions),
  }
  const assets = {
    definition: await judgeAgentDefinition(declaration),
    extensions: await judgeLoopExtensions(extensions),
  }
  expect(assembly).toEqual(assets)
  expect(assembly.definition).toMatchObject({
    kind: 'accepted',
    value: { version: { kind: 'pinned', version: 'v2' } },
  })
})

it('refuses host objects, hidden functions, and colliding capability text', async () => {
  const base = { category: 'AgentDefinition', name: 'coding', references: [], attributes: [] }
  const proto = Object.create({ toJSON: () => base }) as object
  expect(await judgeAgentDefinition(proto)).toMatchObject({ kind: 'refused', reason: 'malformed' })
  const hidden = Object.defineProperty({ ...base }, 'run', { value() {}, enumerable: false })
  expect(await judgeAgentDefinition(hidden)).toMatchObject({
    kind: 'refused',
    reason: 'executable',
  })
  expect(
    await judgeAgentDefinition({ ...base, version: new Date('2020-01-01T00:00:00.000Z') }),
  ).toMatchObject({
    kind: 'refused',
    reason: 'malformed',
  })
  expect(await judgeAgentDefinition({ ...base, version: new String('v2') })).toMatchObject({
    kind: 'refused',
    reason: 'malformed',
  })
  expect(
    await judgeAgentDefinition({ ...base, attributes: [{ item: 'model', limit: Infinity }] }),
  ).toMatchObject({
    kind: 'refused',
    reason: 'malformed',
  })
  expect(
    await judgeAgentDefinition({
      ...base,
      references: [
        { capability: { category: 'a\nb', name: 'c' } },
        { capability: { category: 'a', name: 'b\nc' } },
      ],
    }),
  ).toMatchObject({ kind: 'accepted' })
  expect(
    await judgeLoopExtensions([
      { name: 'e', position: 'after_model_call', power: 'observe', implementation, dimension: {} },
    ]),
  ).toMatchObject({ kind: 'refused', reason: 'dimension-missing', index: 0 })
})

it('refuses executable batch members without calling them', async () => {
  let reads = 0
  const batch: unknown[] = []
  Object.defineProperty(batch, '0', {
    get() {
      reads += 1
      return { name: 'e', position: 'before_model_call', power: 'observe', implementation }
    },
    enumerable: true,
    configurable: true,
  })
  expect(await judgeLoopExtensions(batch)).toMatchObject({
    kind: 'refused',
    reason: 'executable',
    index: 0,
  })
  expect(reads).toBe(0)
  const hidden = [{ name: 'e', position: 'before_model_call', power: 'observe', implementation }]
  Object.defineProperty(hidden, 'run', { value() {}, enumerable: false })
  expect(await judgeLoopExtensions(hidden)).toMatchObject({ kind: 'refused', reason: 'executable' })
})

it('rejects an own __proto__ member and accepts a shared empty array', async () => {
  const withProto = JSON.parse(
    '{"category":"AgentDefinition","name":"coding","references":[],"attributes":[],"__proto__":{"extra":"x"}}',
  )
  expect(Object.hasOwn(withProto, '__proto__')).toBe(true)
  expect(await judgeAgentDefinition(withProto)).toMatchObject({
    kind: 'refused',
    reason: 'malformed',
  })
  const attribute = JSON.parse('{"item":"model","__proto__":{"extra":"x"}}')
  expect(
    await judgeAgentDefinition({
      category: 'AgentDefinition',
      name: 'coding',
      references: [],
      attributes: [attribute],
    }),
  ).toMatchObject({ kind: 'refused', reason: 'malformed' })
  const shared: never[] = []
  expect(
    await judgeAgentDefinition({
      category: 'AgentDefinition',
      name: 'coding',
      references: shared,
      attributes: shared,
    }),
  ).toMatchObject({ kind: 'accepted' })
})

it('refuses a very deep extra field instead of throwing', async () => {
  let nested: unknown = {}
  for (let index = 0; index < 20_000; index += 1) nested = { x: nested }
  const judged = await judgeAgentDefinition({
    category: 'AgentDefinition',
    name: 'coding',
    references: [],
    attributes: [],
    extra: nested,
  })
  expect(judged).toEqual({ kind: 'refused', reason: 'malformed' })
})

it('does not reread a batch item after the copy is taken', async () => {
  let reads = 0
  const item = {
    name: 'e',
    position: 'after_model_call',
    power: 'observe',
    implementation,
    dimension: {},
  }
  const pending = judgeLoopExtensions([item])
  Object.defineProperty(item, 'position', {
    get() {
      reads += 1
      throw new Error('diagnostic getter executed')
    },
  })
  const result = await pending
  expect(reads).toBe(0)
  expect(result).toMatchObject({ kind: 'refused', reason: 'dimension-missing', index: 0 })
})

it('reports a shared capability as a duplicate and ignores later mutation of the input', async () => {
  const shared = { category: 'Tool', name: 'read' }
  expect(
    await judgeAgentDefinition({
      category: 'AgentDefinition',
      name: 'coding',
      references: [{ capability: shared }, { capability: shared }],
      attributes: [],
    }),
  ).toMatchObject({ kind: 'refused', reason: 'duplicate-capability' })
  let reads = 0
  const item = {
    name: 'e',
    position: 'after_model_call',
    power: 'observe',
    implementation,
    dimension: {},
  }
  const pending = judgeLoopExtensions([item])
  Object.defineProperty(item, 'position', {
    get() {
      reads += 1
      throw new Error('diagnostic getter executed')
    },
  })
  await expect(pending).resolves.toMatchObject({
    kind: 'refused',
    reason: 'dimension-missing',
    index: 0,
  })
  expect(reads).toBe(0)
})

it('applies the JSON value count and UTF-8 byte budget to a whole extension batch', async () => {
  const shortest = {
    name: 'n',
    position: 'execution_started',
    power: 'observe',
    implementation: { kind: 'builtin', builtinName: 'f' },
  }
  const accepted = await judgeLoopExtensions(Array.from({ length: 28 }, () => ({ ...shortest })))
  expect(accepted).toEqual({
    kind: 'accepted',
    value: Array.from({ length: 28 }, () => ({ ...shortest })),
  })
  expect(await judgeLoopExtensions(Array.from({ length: 29 }, () => ({ ...shortest })))).toEqual({
    kind: 'refused',
    reason: 'malformed',
    index: 0,
  })
  const zhong = '中'.repeat(9000)
  expect(
    await judgeLoopExtensions(Array.from({ length: 4 }, () => ({ ...shortest, name: zhong }))),
  ).toEqual({ kind: 'refused', reason: 'malformed', index: 0 })
  expect(
    await judgeLoopExtensions(
      Array.from({ length: 28 }, () => ({ ...shortest, name: 'a'.repeat(3400) })),
    ),
  ).toMatchObject({ kind: 'accepted' })
  expect(
    await judgeLoopExtensions(
      Array.from({ length: 28 }, () => ({ ...shortest, name: 'a'.repeat(3500) })),
    ),
  ).toEqual({ kind: 'refused', reason: 'malformed', index: 0 })
})

it('accepts a definition of 200 JSON values and refuses 49 capabilities', async () => {
  const references = [
    ...Array.from({ length: 45 }, (_, index) => ({
      capability: { category: 'Tool', name: `t${index}` },
    })),
    ...Array.from({ length: 3 }, (_, index) => ({
      capability: { category: 'Tool', name: `r${index}` },
      resident: true,
    })),
  ]
  const accepted = await judgeAgentDefinition({
    category: 'AgentDefinition',
    name: 'coding',
    references,
    attributes: [],
  })
  expect(accepted.kind).toBe('accepted')
  if (accepted.kind === 'accepted') {
    expect(accepted.value.references).toHaveLength(48)
    expect(accepted.value.references[0]).toEqual({ capability: { category: 'Tool', name: 't0' } })
    expect(accepted.value.references[45]).toEqual({
      capability: { category: 'Tool', name: 'r0' },
      resident: true,
    })
  }
  expect(
    await judgeAgentDefinition({
      category: 'AgentDefinition',
      name: 'coding',
      references: Array.from({ length: 49 }, (_, index) => ({
        capability: { category: 'Tool', name: `t${index}` },
      })),
      attributes: [],
    }),
  ).toEqual({ kind: 'refused', reason: 'malformed' })
})

it('classifies illegal dimensions separately from a missing required field', async () => {
  expect(
    await judgeLoopExtensions([
      {
        name: 'e',
        position: 'after_model_call',
        power: 'observe',
        implementation,
        dimension: { ending: 'nope' },
      },
    ]),
  ).toEqual({ kind: 'refused', reason: 'malformed', index: 0 })
  expect(
    await judgeLoopExtensions([
      {
        name: 'e',
        position: 'after_action',
        power: 'observe',
        implementation,
        dimension: { scope: 'nope' },
      },
    ]),
  ).toEqual({ kind: 'refused', reason: 'malformed', index: 0 })
  expect(
    await judgeLoopExtensions([
      {
        name: 'e',
        position: 'after_model_call',
        power: 'observe',
        implementation,
        dimension: { ending: 'complete_reply', extra: true },
      },
    ]),
  ).toEqual({ kind: 'refused', reason: 'malformed', index: 0 })
  expect(
    await judgeLoopExtensions([
      {
        name: 'e',
        position: 'after_action',
        power: 'observe',
        implementation,
        dimension: { ending: 'failure', scope: 'each' },
      },
    ]),
  ).toEqual({ kind: 'refused', reason: 'malformed', index: 0 })
  expect(
    await judgeLoopExtensions([
      {
        name: 'e',
        position: 'after_model_call',
        power: 'observe',
        implementation,
        dimension: 'ending',
      },
    ]),
  ).toEqual({ kind: 'refused', reason: 'malformed', index: 0 })
  expect(
    await judgeLoopExtensions([
      { name: 'e', position: 'after_action', power: 'observe', implementation },
    ]),
  ).toEqual({ kind: 'refused', reason: 'dimension-missing', index: 0 })
  expect(
    await judgeLoopExtensions([
      {
        name: 'e',
        position: 'after_action',
        power: 'observe',
        implementation,
        dimension: { ending: 'failure' },
      },
    ]),
  ).toEqual({ kind: 'refused', reason: 'dimension-missing', index: 0 })
  expect(
    await judgeLoopExtensions([
      {
        name: 'e',
        position: 'after_model_call',
        power: 'observe',
        implementation,
        dimension: { scope: 'each' },
      },
    ]),
  ).toEqual({ kind: 'refused', reason: 'dimension-missing', index: 0 })
  expect(
    await judgeLoopExtensions([
      {
        name: 'e',
        position: 'before_terminal',
        power: 'observe',
        implementation,
        dimension: 'ending',
      },
    ]),
  ).toEqual({ kind: 'refused', reason: 'dimension-not-allowed', index: 0 })
})

it('classifies the attribute that was submitted, not a later mutation', async () => {
  const empty = { item: '' }
  const pendingEmpty = judgeAgentDefinition({ ...legalDefinition, attributes: [empty] })
  empty.item = 'model'
  await expect(pendingEmpty).resolves.toEqual({ kind: 'refused', reason: 'unknown-attribute' })
  const named = { item: 'persona' }
  const pendingNamed = judgeAgentDefinition({ ...legalDefinition, attributes: [named] })
  named.item = 'model'
  await expect(pendingNamed).resolves.toEqual({ kind: 'refused', reason: 'unknown-attribute' })
})

it('does not treat an extra reference field as an unknown attribute', async () => {
  expect(
    await judgeAgentDefinition({
      ...legalDefinition,
      references: [{ capability: { category: 'Tool', name: 'read' }, item: 'persona' }],
    }),
  ).toEqual({ kind: 'refused', reason: 'malformed' })
})

it('does not treat extra dimension keys named position or power as unknown enums', async () => {
  expect(
    await judgeLoopExtensions([
      {
        name: 'e',
        position: 'after_model_call',
        power: 'observe',
        implementation,
        dimension: { ending: 'complete_reply', position: 'before_action' },
      },
    ]),
  ).toEqual({ kind: 'refused', reason: 'malformed', index: 0 })
  expect(
    await judgeLoopExtensions([
      {
        name: 'e',
        position: 'after_action',
        power: 'observe',
        implementation,
        dimension: { scope: 'each', power: 'veto' },
      },
    ]),
  ).toEqual({ kind: 'refused', reason: 'malformed', index: 0 })
})

it('classifies an attribute item string separately from a broken attribute', async () => {
  expect(
    await judgeAgentDefinition({
      ...legalDefinition,
      attributes: [{ item: '' }],
    }),
  ).toEqual({ kind: 'refused', reason: 'unknown-attribute' })
  expect(
    await judgeAgentDefinition({
      ...legalDefinition,
      attributes: [{}],
    }),
  ).toEqual({ kind: 'refused', reason: 'malformed' })
  expect(
    await judgeAgentDefinition({
      ...legalDefinition,
      attributes: [{ item: 1 }],
    }),
  ).toEqual({ kind: 'refused', reason: 'malformed' })
})

const NINE_POSITIONS = [
  'execution_started',
  'before_compaction',
  'after_compaction',
  'before_model_call',
  'after_model_call',
  'before_action',
  'after_action',
  'before_terminal',
  'after_terminal',
] as const
const BEFORE = ['before_compaction', 'before_model_call', 'before_action', 'before_terminal']
const POWER_NAMES = ['observe', 'rewrite', 'veto'] as const

function dimensionAt(position: string): Record<string, unknown> {
  if (position === 'after_model_call') return { dimension: { ending: 'failure' } }
  if (position === 'after_action') return { dimension: { scope: 'each' } }
  return {}
}

function declare(
  position: string,
  power: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { name: 'e', position, power, implementation, ...dimensionAt(position), ...extra }
}

function judgeOne(declaration: Record<string, unknown>) {
  return judgeLoopExtensions([declaration])
}

it('accepts every declared power at each of the nine positions', async () => {
  for (const position of NINE_POSITIONS) {
    for (const power of POWER_NAMES) {
      const judged = await judgeOne(declare(position, power))
      expect(judged, `${position} ${power}`).toEqual({
        kind: 'accepted',
        value: [declare(position, power)],
      })
    }
  }
})

it('refuses the position names that the nine-position set removed', async () => {
  for (const position of ['attempt_started', 'before_persist_message', 'after_persist_message']) {
    expect(await judgeOne(declare(position, 'observe'))).toMatchObject({
      kind: 'refused',
      reason: 'unknown-position',
      index: 0,
    })
  }
})

it('accepts a veto or rewrite declaration at the positions that follow the change', async () => {
  expect(await judgeOne(declare('after_terminal', 'veto'))).toMatchObject({ kind: 'accepted' })
  expect(await judgeOne(declare('after_action', 'veto'))).toMatchObject({ kind: 'accepted' })
  expect(await judgeOne(declare('after_terminal', 'rewrite'))).toMatchObject({ kind: 'accepted' })
})

it('caps a workspace source at observe at every position and drops the source from the value', async () => {
  for (const position of NINE_POSITIONS) {
    const observed = await judgeOne(declare(position, 'observe', { source: 'workspace' }))
    expect(observed, position).toEqual({ kind: 'accepted', value: [declare(position, 'observe')] })
    for (const power of ['rewrite', 'veto']) {
      expect(await judgeOne(declare(position, power, { source: 'workspace' })), position).toEqual({
        kind: 'refused',
        reason: 'power-above-ceiling',
        index: 0,
      })
    }
    expect(await judgeOne(declare(position, 'veto', { source: 'author' }))).toMatchObject({
      kind: 'accepted',
    })
  }
  expect(await judgeOne(declare('before_action', 'observe', { source: 'tenant' }))).toMatchObject({
    kind: 'refused',
    reason: 'malformed',
  })
})

it('keeps an omitted optional field omitted and returns frozen data that shares nothing with the input', async () => {
  const input = declare('before_action', 'veto', {
    needs: ['history'],
    onError: 'record',
    unavailability: 'veto',
  })
  const judged = await judgeLoopExtensions([input])
  expect(judged.kind).toBe('accepted')
  if (judged.kind !== 'accepted') return
  const [first] = judged.value
  expect(first).toEqual(input)
  expect(Object.isFrozen(judged.value)).toBe(true)
  expect(Object.isFrozen(first)).toBe(true)
  expect(Object.isFrozen(first?.implementation)).toBe(true)
  expect(Object.isFrozen(first?.needs)).toBe(true)
  expect(first?.implementation).not.toBe(input.implementation)
  const bare = await judgeOne(declare('before_model_call', 'veto'))
  expect(bare.kind === 'accepted' && Object.keys(bare.value[0] ?? {}).sort()).toEqual([
    'implementation',
    'name',
    'position',
    'power',
  ])
  const dimensioned = declare('after_action', 'observe')
  const withDimension = await judgeOne(dimensioned)
  expect(withDimension.kind).toBe('accepted')
  if (withDimension.kind !== 'accepted') return
  const dimension = withDimension.value[0]?.dimension
  expect(dimension).toEqual(dimensioned['dimension'])
  expect(Object.isFrozen(dimension)).toBe(true)
  expect(dimension).not.toBe(dimensioned['dimension'])
})

it('requires an implementation of kind builtin or command with a closed field set', async () => {
  const without = { name: 'e', position: 'before_action', power: 'observe' }
  expect(await judgeOne(without)).toEqual({
    kind: 'refused',
    reason: 'implementation-missing',
    index: 0,
  })
  const command = {
    kind: 'command',
    host: 'claude_code',
    dialect: 'claude-hooks',
    event: 'PreToolUse',
    command: './check.sh',
  }
  expect(await judgeOne(declare('before_action', 'veto', { implementation: command }))).toEqual({
    kind: 'accepted',
    value: [declare('before_action', 'veto', { implementation: command })],
  })
  const full = { ...command, host: 'codex', matcher: 'Bash', timeout: 'PT30S' }
  expect(await judgeOne(declare('before_action', 'veto', { implementation: full }))).toEqual({
    kind: 'accepted',
    value: [declare('before_action', 'veto', { implementation: full })],
  })
  const malformed: unknown[] = [
    null,
    'format',
    [],
    {},
    { kind: 'plugin', name: 'x' },
    { kind: 'builtin' },
    { kind: 'builtin', builtinName: '' },
    { kind: 'builtin', builtinName: 'format', host: 'codex' },
    { ...command, host: 'cursor' },
    { ...command, dialect: '' },
    { ...command, event: undefined },
    { ...command, command: '' },
    { ...command, matcher: '' },
    { ...command, builtinName: 'format' },
    { ...command, extra: 1 },
  ]
  for (const candidate of malformed) {
    expect(await judgeOne(declare('before_action', 'veto', { implementation: candidate }))).toEqual(
      { kind: 'refused', reason: 'malformed', index: 0 },
    )
  }
})

it('accepts an ISO 8601 timeout text and refuses any other text', async () => {
  const command = {
    kind: 'command',
    host: 'codex',
    dialect: 'd',
    event: 'e',
    command: 'c',
  }
  for (const timeout of ['PT30S', 'PT1H30M', 'P1D', 'P1DT12H', 'P1W', 'PT0.5S', 'P1Y2M3DT4H5M6S']) {
    const judged = await judgeOne(
      declare('before_action', 'veto', { implementation: { ...command, timeout } }),
    )
    expect(judged, timeout).toMatchObject({ kind: 'accepted' })
  }
  for (const timeout of ['', 'P', 'PT', 'P1DT', '30s', '30', 'PT30', '1D', 'pt30s', 'PT-5S', 30]) {
    const judged = await judgeOne(
      declare('before_action', 'veto', { implementation: { ...command, timeout } }),
    )
    expect(judged, String(timeout)).toEqual({ kind: 'refused', reason: 'malformed', index: 0 })
  }
})

it('accepts a list of distinct non-empty needs in order and refuses every other form', async () => {
  expect(await judgeOne(declare('before_action', 'observe', { needs: ['b', 'a'] }))).toEqual({
    kind: 'accepted',
    value: [declare('before_action', 'observe', { needs: ['b', 'a'] })],
  })
  const refusedNeeds: unknown[] = [[], ['a', 'a'], [''], ['a', 1], 'history', null, {}, [['a']]]
  for (const needs of refusedNeeds) {
    expect(
      await judgeOne(declare('before_action', 'observe', { needs })),
      JSON.stringify(needs),
    ).toEqual({
      kind: 'refused',
      reason: 'needs-not-allowed',
      index: 0,
    })
  }
})

it('allows an onError policy by power at a before position and only ignore elsewhere', async () => {
  const allowedBefore = {
    observe: ['ignore'],
    rewrite: ['ignore', 'record'],
    veto: ['ignore', 'record', 'treat_as_veto'],
  }
  for (const position of NINE_POSITIONS) {
    for (const power of POWER_NAMES) {
      for (const onError of ['ignore', 'record', 'treat_as_veto']) {
        const allowed = BEFORE.includes(position)
          ? allowedBefore[power].includes(onError)
          : onError === 'ignore'
        const judged = await judgeOne(declare(position, power, { onError }))
        expect(judged.kind, `${position} ${power} ${onError}`).toBe(
          allowed ? 'accepted' : 'refused',
        )
        if (!allowed) {
          expect(judged).toEqual({ kind: 'refused', reason: 'error-policy-not-allowed', index: 0 })
        }
      }
    }
  }
  expect(await judgeOne(declare('before_action', 'veto', { onError: 'explode' }))).toEqual({
    kind: 'refused',
    reason: 'error-policy-not-allowed',
    index: 0,
  })
})

it('allows unavailability veto only for a veto extension at a before position', async () => {
  for (const position of NINE_POSITIONS) {
    for (const power of POWER_NAMES) {
      const skip = await judgeOne(declare(position, power, { unavailability: 'skip' }))
      expect(skip.kind, `${position} ${power} skip`).toBe('accepted')
      const veto = await judgeOne(declare(position, power, { unavailability: 'veto' }))
      const allowed = power === 'veto' && BEFORE.includes(position)
      expect(veto.kind, `${position} ${power} veto`).toBe(allowed ? 'accepted' : 'refused')
      if (!allowed) {
        expect(veto).toEqual({ kind: 'refused', reason: 'unavailability-not-allowed', index: 0 })
      }
    }
  }
  expect(await judgeOne(declare('before_action', 'veto', { unavailability: 'fallback' }))).toEqual({
    kind: 'refused',
    reason: 'unavailability-not-allowed',
    index: 0,
  })
})

it('does not declare a fallback field and reports a new refusal at the failing batch index', async () => {
  expect(await judgeOne(declare('before_action', 'veto', { fallback: 'x' }))).toEqual({
    kind: 'refused',
    reason: 'malformed',
    index: 0,
  })
  expect(
    await judgeLoopExtensions([
      declare('before_action', 'veto'),
      declare('after_action', 'observe', { onError: 'record' }),
    ]),
  ).toEqual({ kind: 'refused', reason: 'error-policy-not-allowed', index: 1 })
})

it('keeps the package free of assembly, implementation-member and cordis dependencies', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as {
    dependencies?: Record<string, string>
  }
  const names = Object.keys(manifest.dependencies ?? {})
  expect(names).not.toContain('@omne-harness/assembly')
  expect(names).not.toContain('@omne-harness/agent')
  expect(names).not.toContain('@omne-harness/agent-host-local')
  expect(names.join(' ')).not.toContain('cordis')
  expect(names).toContain('@omne-harness/assets')
})
