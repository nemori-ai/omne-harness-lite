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
  expect(judged.kind === 'accepted' && judged.value.version).toEqual({ kind: 'pinned', version: 'v2' })
})

it('refuses a missing references slot, a null slot, a duplicate capability, and an unknown attribute', async () => {
  const { references, ...missing } = legalDefinition
  void references
  expect(await judgeAgentDefinition(missing)).toMatchObject({ kind: 'refused', reason: 'malformed' })
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

it('keeps an extra attribute field and refuses a repeated item', async () => {
  const judged = await judgeAgentDefinition({
    ...legalDefinition,
    attributes: [{ item: 'model', kind: 'setting' }],
  })
  expect(judged).toMatchObject({
    kind: 'accepted',
    value: { attributes: [{ item: 'model', kind: 'setting' }] },
  })
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
  expect(await judgeLoopExtensions([{ name: 'x', position: 'not-a-position', power: 'observe' }])).toMatchObject({
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

it('keeps the package free of assembly, assets, and cordis dependencies', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  const names = Object.keys(manifest.dependencies ?? {})
  expect(names).not.toContain('@omne-harness/assembly')
  expect(names).not.toContain('@omne-harness/assets')
  expect(names.join(' ')).not.toContain('cordis')
})
