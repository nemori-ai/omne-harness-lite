import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { extractAgentDefinitionInputs } from '@omne-harness-lite/agent-definition'
import {
  readJsonStrict,
  toOpaqueJson,
  LosslessNumber,
  writeJsonLossless,
  copyJsonValue,
} from '@omne-harness-lite/content-blocks'
import {
  evaluate,
  selectEvaluationRootSource,
  judgeEffectiveAssembly,
  evaluationInputFingerprint,
  type NonConnectorEvaluationInput,
  type EvaluationRootSelectionInput,
} from '../src/index.ts'
import { assignment, definition, holding, root, tenant, simple } from './fixtures.ts'

const examples = readFileSync(
  new URL('../../agent-definition/tests/fixtures/agent-definition-examples.md', import.meta.url),
  'utf8',
)
const fixture = [...examples.matchAll(/```json\n([\s\S]*?)\n```/gu)][1]?.[1]
if (fixture === undefined) throw new Error('missing normative AD1 fixture')
const parsed = readJsonStrict(fixture)
if ('failed' in parsed) throw new Error('bad normative AD1 fixture')
const extracted = extractAgentDefinitionInputs(parsed.ok)
if (!('ok' in extracted)) throw new Error('normative AD1 rejected')
const declarations = extracted.ok.attributes
function base(): NonConnectorEvaluationInput {
  const old = simple()
  const references = old.root.references
  const copied = copyJsonValue({ references, attributes: declarations })
  if ('failed' in copied) throw new Error('fixture is not JSON')
  return {
    ...old,
    definitions: [
      definition('ast_root', root, { category: 'agent_definition', body: toOpaqueJson(copied.ok) }),
      ...old.definitions.slice(1),
    ],
    root: {
      definition: root,
      references,
      attributes: declarations,
      source: { asset: 'ast_root', version: 1 },
    },
  }
}
function selection(input: NonConnectorEvaluationInput): EvaluationRootSelectionInput {
  return {
    tenant: input.tenant,
    standing: input.standing,
    holdings: input.holdings,
    definitions: input.definitions,
    ...(input.session === undefined ? {} : { session: input.session }),
    rootDefinition: input.root.definition,
  }
}

test('the same selection stage chooses a real root; full evaluation keeps it outside composition', () => {
  const input = base()
  expect(selectEvaluationRootSource(selection(input))).toEqual({ ok: input.root.source })
  const result = evaluate(input)
  if (!('ok' in result)) throw new Error('valid complete input rejected')
  expect(result.ok.composition).not.toContainEqual(root)
  expect(result.ok.values.filter(item => item.capability.name === root.name)).toEqual(
    declarations
      .map(declaration => ({
        capability: root,
        item: declaration.item,
        value: declaration.default,
        from: 'factory',
      }))
      .sort((a, b) => a.item.localeCompare(b.item)),
  )
  expect(judgeEffectiveAssembly(result.ok)).toBe(true)
})

test('root settings use actual outer locks and session precedence', () => {
  const input = base()
  const result = evaluate({
    ...input,
    holdings: [
      ...input.holdings,
      holding('organization', root, 'ast_root', [
        assignment('first_token_wait_limit', 'PT40S', true),
        assignment('model', 'example/model-b', true),
      ]),
      holding('tenant', root, 'ast_root', [
        assignment('first_token_wait_limit', 'PT50S'),
        assignment('model', 'example/model-c'),
      ]),
    ],
    session: [
      { capability: root, assignment: assignment('first_token_wait_limit', 'PT60S') },
      { capability: root, assignment: assignment('post_first_token_stall_limit', 'PT25S') },
      { capability: root, assignment: assignment('model', 'example/model-d') },
    ],
  })
  if (!('ok' in result)) throw new Error('valid layered input rejected')
  expect(result.ok.values.filter(item => item.capability.name === root.name)).toEqual([
    {
      capability: root,
      item: 'first_token_wait_limit',
      value: 'PT40S',
      from: 'organization',
      lockedAt: 'organization',
    },
    {
      capability: root,
      item: 'model',
      value: 'example/model-b',
      from: 'organization',
      lockedAt: 'organization',
    },
    { capability: root, item: 'post_first_token_stall_limit', value: 'PT25S', from: 'session' },
  ])
  expect(judgeEffectiveAssembly(result.ok)).toBe(true)
})

test('a replacement root uses its declarations without old asset settings or locks', () => {
  const input = base()
  const changed = declarations.map(item => ({
    ...item,
    default: item.item === 'model' ? 'example/model-e' : 'PT70S',
  }))
  const result = evaluate({
    ...input,
    definitions: [
      ...input.definitions,
      definition(
        'ast_new',
        root,
        {
          category: 'agent_definition',
          body: toOpaqueJson({ references: [], attributes: changed }),
        },
        'customized',
      ),
    ],
    holdings: [
      ...input.holdings,
      holding('organization', root, 'ast_root', [assignment('model', 'example/old', true)]),
      holding('tenant', root, 'ast_new'),
    ],
    root: {
      definition: root,
      references: [],
      attributes: changed,
      source: { asset: 'ast_new', version: 1 },
    },
  })
  if (!('ok' in result)) throw new Error('valid replacement input rejected')
  expect(result.ok.values.map(item => [item.item, item.value, item.from, item.lockedAt])).toEqual([
    ['first_token_wait_limit', 'PT70S', 'factory', undefined],
    ['model', 'example/model-e', 'factory', undefined],
    ['post_first_token_stall_limit', 'PT70S', 'factory', undefined],
  ])
})

test('C16 and C15 precede a self cycle; no partial assembly escapes', () => {
  const input = base()
  expect(
    evaluate({
      ...input,
      root: {
        ...input.root,
        references: [{ capability: root }],
        source: { asset: 'ast_other', version: 1 },
      },
    }),
  ).toHaveProperty('invalidInput.diagnostics.0.condition', 'C16')
  expect(
    evaluate({
      ...input,
      root: {
        ...input.root,
        references: [{ capability: root }],
        attributes: [...declarations, ...declarations],
      },
    }),
  ).toHaveProperty('invalidInput.diagnostics.0.condition', 'C15')
})

test.each([
  { attributes: [] },
  { attributes: declarations.filter(item => item.item !== 'model') },
  { attributes: declarations.filter(item => item.item !== 'post_first_token_stall_limit') },
])(
  'missing root declarations are never completed from fixture or assignments',
  ({ attributes }) => {
    const input = base()
    const result = evaluate({
      ...input,
      root: { ...input.root, attributes },
      session: [{ capability: root, assignment: assignment('model', 'example/attempted') }],
    })
    if (!('ok' in result)) throw new Error('legal absent declarations rejected')
    expect(
      result.ok.values
        .filter(item => item.capability.name === root.name)
        .map(item => item.item)
        .sort(),
    ).toEqual(attributes.map(item => item.item).sort())
  },
)

test('unknown root and source members reject instead of silently discarding them', () => {
  const input = base()
  expect(
    evaluate({ ...input, root: { ...input.root, order: [] } } as NonConnectorEvaluationInput),
  ).toHaveProperty('invalidInput')
  expect(
    evaluate({
      ...input,
      root: { ...input.root, source: { ...input.root.source, extra: true } },
    } as NonConnectorEvaluationInput),
  ).toHaveProperty('invalidInput')
})

test('root assignments outside the normative duration or route domain fail C10', () => {
  const input = base()
  for (const [item, value] of [
    ['model', ' bad '],
    ['first_token_wait_limit', 'PT0S'],
  ] as const)
    expect(
      evaluate({ ...input, session: [{ capability: root, assignment: assignment(item, value) }] }),
    ).toHaveProperty('invalidInput.diagnostics.0.condition', 'C10')
})

test('selector missing, invalid and unsupported-provider conclusions remain distinct', () => {
  const input = selection(base())
  expect(selectEvaluationRootSource({ ...input, holdings: [], definitions: [] })).toEqual({
    missing: true,
  })
  expect(selectEvaluationRootSource({ ...input, definitions: [] })).toHaveProperty('invalidInput')
  expect(
    selectEvaluationRootSource({
      ...input,
      holdings: input.holdings.map(entry => ({
        ...entry,
        versionSelection: { kind: 'pinned', number: 2 },
      })),
    }),
  ).toHaveProperty('invalidInput.diagnostics.0.condition', 'C9')
  const unsupported = {
    ...input,
    definitions: [
      {
        id: 'ast_connector',
        capability: { category: 'connector', name: 'example:connector' },
        origin: 'official',
        versions: [],
      },
    ],
  }
  expect(selectEvaluationRootSource(unsupported as EvaluationRootSelectionInput)).toEqual({
    unavailable: true,
  })
})

test('equivalent integer spellings resolve, huge unresolvable pinned versions do not round or expand', () => {
  const input = selection(base())
  expect(
    selectEvaluationRootSource({
      ...input,
      holdings: input.holdings.map(entry => ({
        ...entry,
        versionSelection: { kind: 'pinned', number: new LosslessNumber('10e-1') },
      })),
    }),
  ).toEqual({ ok: { asset: 'ast_root', version: 1 } })
  expect(
    selectEvaluationRootSource({
      ...input,
      holdings: input.holdings.map(entry => ({
        ...entry,
        versionSelection: { kind: 'pinned', number: new LosslessNumber('9e1000000') },
      })),
    }),
  ).toHaveProperty('invalidInput.diagnostics.0.condition', 'C9')
})

test('full fingerprint observes root declarations and source without modifying input', () => {
  const input = base()
  const before = writeJsonLossless(input)
  expect(evaluationInputFingerprint(input)).not.toBe(
    evaluationInputFingerprint({ ...input, root: { ...input.root, attributes: [] } }),
  )
  expect(evaluationInputFingerprint(input)).not.toBe(
    evaluationInputFingerprint({
      ...input,
      root: { ...input.root, source: { ...input.root.source, version: 2 } },
    }),
  )
  expect(writeJsonLossless(input)).toBe(before)
  expect(tenant).toEqual(input.tenant)
})
