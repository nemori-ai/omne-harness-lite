import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { judgeAgentDefinition, judgeLoopExtensions } from '@omne-harness/agent'

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
    { name: 'format', position: 'before_model_call', power: 'observe' },
    { name: 'policy', position: 'before_action', power: 'veto' },
  ])
  expect(accepted).toEqual({
    kind: 'accepted',
    value: [
      { name: 'format', position: 'before_model_call', power: 'observe' },
      { name: 'policy', position: 'before_action', power: 'veto' },
    ],
  })
  expect(
    await judgeLoopExtensions([{ name: 'late', position: 'after_terminal', power: 'veto' }]),
  ).toMatchObject({ kind: 'refused', reason: 'power-above-ceiling', index: 0 })
  expect(
    await judgeLoopExtensions([{ name: 'late', position: 'after_action', power: 'veto' }]),
  ).toMatchObject({ kind: 'refused', reason: 'power-above-ceiling', index: 0 })
  expect(
    await judgeLoopExtensions([
      { name: 'room', position: 'before_model_call', power: 'rewrite', source: 'workspace' },
    ]),
  ).toMatchObject({ kind: 'refused', reason: 'power-above-ceiling', index: 0 })
  expect(
    await judgeLoopExtensions([{ name: 'x', position: 'not-a-position', power: 'observe' }]),
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
        dimension: { ending: 'complete_reply' },
      },
    ]),
  ).toMatchObject({ kind: 'accepted' })
  expect(
    await judgeLoopExtensions([{ name: 'ending', position: 'after_model_call', power: 'observe' }]),
  ).toMatchObject({ kind: 'refused', reason: 'dimension-missing', index: 0 })
  expect(
    await judgeLoopExtensions([
      {
        name: 'format',
        position: 'before_model_call',
        power: 'observe',
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
      { name: 'format', position: 'before_model_call', power: 'observe' },
      { name: 'bad', position: 'after_terminal', power: 'rewrite' },
    ]),
  ).toMatchObject({ kind: 'refused', reason: 'power-above-ceiling', index: 1 })
  expect(
    await judgeLoopExtensions([{ name: 'x', position: 'before_model_call', power: 'grant' }]),
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
  const extensions = [{ name: 'format', position: 'before_model_call', power: 'observe' }]
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
      { name: 'e', position: 'after_model_call', power: 'observe', dimension: {} },
    ]),
  ).toMatchObject({ kind: 'refused', reason: 'dimension-missing', index: 0 })
})

it('refuses executable batch members without calling them', async () => {
  let reads = 0
  const batch: unknown[] = []
  Object.defineProperty(batch, '0', {
    get() {
      reads += 1
      return { name: 'e', position: 'before_model_call', power: 'observe' }
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
  const hidden = [{ name: 'e', position: 'before_model_call', power: 'observe' }]
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
  const item = { name: 'e', position: 'after_model_call', power: 'observe', dimension: {} }
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

it('refuses executable batch members without calling them', async () => {
  let reads = 0
  const batch: unknown[] = []
  Object.defineProperty(batch, '0', {
    get() {
      reads += 1
      return { name: 'e', position: 'before_model_call', power: 'observe' }
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
  const hidden = [{ name: 'e', position: 'before_model_call', power: 'observe' }]
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
  const item = { name: 'e', position: 'after_model_call', power: 'observe', dimension: {} }
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
  const shortest = { name: 'n', position: 'attempt_started', power: 'observe' }
  const accepted = await judgeLoopExtensions(Array.from({ length: 49 }, () => ({ ...shortest })))
  expect(accepted).toEqual({
    kind: 'accepted',
    value: Array.from({ length: 49 }, () => ({ ...shortest })),
  })
  expect(await judgeLoopExtensions(Array.from({ length: 50 }, () => ({ ...shortest })))).toEqual({
    kind: 'refused',
    reason: 'malformed',
    index: 0,
  })
  const zhong = '中'.repeat(9000)
  expect(
    await judgeLoopExtensions(
      Array.from({ length: 4 }, () => ({
        name: zhong,
        position: 'attempt_started',
        power: 'observe',
      })),
    ),
  ).toEqual({ kind: 'refused', reason: 'malformed', index: 0 })
  const letters = 'a'.repeat(1996)
  expect(
    await judgeLoopExtensions(
      Array.from({ length: 49 }, () => ({
        name: letters,
        position: 'attempt_started',
        power: 'observe',
      })),
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
      { name: 'e', position: 'after_model_call', power: 'observe', dimension: { ending: 'nope' } },
    ]),
  ).toEqual({ kind: 'refused', reason: 'malformed', index: 0 })
  expect(
    await judgeLoopExtensions([
      { name: 'e', position: 'after_action', power: 'observe', dimension: { scope: 'nope' } },
    ]),
  ).toEqual({ kind: 'refused', reason: 'malformed', index: 0 })
  expect(
    await judgeLoopExtensions([
      {
        name: 'e',
        position: 'after_model_call',
        power: 'observe',
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
        dimension: { ending: 'failure', scope: 'each' },
      },
    ]),
  ).toEqual({ kind: 'refused', reason: 'malformed', index: 0 })
  expect(
    await judgeLoopExtensions([
      { name: 'e', position: 'after_model_call', power: 'observe', dimension: 'ending' },
    ]),
  ).toEqual({ kind: 'refused', reason: 'malformed', index: 0 })
  expect(
    await judgeLoopExtensions([{ name: 'e', position: 'after_action', power: 'observe' }]),
  ).toEqual({ kind: 'refused', reason: 'dimension-missing', index: 0 })
  expect(
    await judgeLoopExtensions([
      { name: 'e', position: 'after_action', power: 'observe', dimension: { ending: 'failure' } },
    ]),
  ).toEqual({ kind: 'refused', reason: 'dimension-missing', index: 0 })
  expect(
    await judgeLoopExtensions([
      { name: 'e', position: 'after_model_call', power: 'observe', dimension: { scope: 'each' } },
    ]),
  ).toEqual({ kind: 'refused', reason: 'dimension-missing', index: 0 })
  expect(
    await judgeLoopExtensions([
      { name: 'e', position: 'before_terminal', power: 'observe', dimension: 'ending' },
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

it('keeps the package free of assembly, assets, and cordis dependencies', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as {
    dependencies?: Record<string, string>
  }
  const names = Object.keys(manifest.dependencies ?? {})
  expect(names).not.toContain('@omne-harness/assembly')
  expect(names).not.toContain('@omne-harness/assets')
  expect(names.join(' ')).not.toContain('cordis')
})
