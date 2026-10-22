import { describe, expect, it } from 'vitest'
import {
  attributeFindings,
  readCardAttributes,
  type AttributeFinding,
  type AttributeInput,
  type CardAttributes,
} from '../src/delivery/attributes.ts'
import type { TaskBindingV1, TaskBindingV2 } from '../src/delivery/binding.ts'
import { registry, table } from './fixtures/lines.ts'

const url = 'https://github.com/owner/repo/issues/7'
function identity(lines: string[]): string {
  return [
    '## 身份与责任',
    '',
    '- 交付层级：subtask',
    ...lines,
    '',
    '## 目标与范围',
    '',
    '正文。',
  ].join('\n')
}

describe('reading card attributes', () => {
  it('reads the three fields from「身份与责任」with the Issue milestone and labels', () => {
    const card = readCardAttributes(
      identity(['- 交付线：model', '- 性质：impl', '- 契约变更：additive']),
      { url, labels: ['line:model', 'kind:feature'], milestone: 'M1' },
    )
    expect(card).toEqual({
      issue: url,
      fields: { line: ['model'], nature: ['impl'], contractChange: ['additive'] },
      milestone: 'M1',
      labels: ['line:model', 'kind:feature'],
    })
  })

  it('keeps missing and repeated fields visible and ignores fields outside the section', () => {
    const body = `${identity(['- 交付线：model', '- 交付线：platform'])}\n- 性质：impl`
    expect(readCardAttributes(body, { url, labels: [] })).toMatchObject({
      fields: { line: ['model', 'platform'], nature: [], contractChange: [] },
      milestone: undefined,
    })
  })
})

const v1: TaskBindingV1 = {
  schemaVersion: 1,
  issue: { repository: 'owner/repo', id: 'I_7', number: 7, url },
  revision: 1,
  attempt: 'one',
  responsible: 'human',
  branch: 'human/task',
  route: { kind: 'track', track: 'legacy-refactor' },
  completionTarget: 'track',
  taskBase: 'a'.repeat(40),
  writeScope: ['tmp/issue-7', 'packages/session/session', 'pnpm-lock.yaml'],
  dispatch: `${url}#issuecomment-1`,
  conditions: [],
  authorization: [],
}
const v2: TaskBindingV2 = {
  ...v1,
  schemaVersion: 2,
  line: 'session-agent',
  nature: 'impl',
  contractChange: 'none',
  milestone: 'M1',
}
type Written = { line?: string; nature?: string; contractChange?: string }
function card(
  written: Written = { line: 'session-agent', nature: 'impl', contractChange: 'none' },
  patch: Partial<CardAttributes> = {},
): CardAttributes {
  const lines = [
    ...(written.line === undefined ? [] : [`- 交付线：${written.line}`]),
    ...(written.nature === undefined ? [] : [`- 性质：${written.nature}`]),
    ...(written.contractChange === undefined ? [] : [`- 契约变更：${written.contractChange}`]),
  ]
  const labels = [
    ...(written.line === undefined ? [] : [`line:${written.line}`]),
    ...(written.nature === undefined ? [] : [`nature:${written.nature}`]),
    ...(written.contractChange === undefined || written.contractChange === 'none'
      ? []
      : [`contract:${written.contractChange}`]),
    'kind:feature',
  ]
  return { ...readCardAttributes(identity(lines), { url, labels, milestone: 'M1' }), ...patch }
}
function findings(input: Partial<AttributeInput> = {}): AttributeFinding[] {
  return attributeFindings({
    binding: v2,
    card: card(),
    conditionCards: [],
    lines: table(),
    registry,
    ...input,
  })
}
const codes = (input: Partial<AttributeInput> = {}) => findings(input).map(f => [f.code, f.clause])

describe('attribute findings', () => {
  it('reports nothing for a consistent line card with a v2 binding', () => {
    expect(findings()).toEqual([])
  })

  it('accepts a line card routed to its own line track', () => {
    expect(
      codes({
        card: card({ line: 'model', nature: 'contract', contractChange: 'additive' }),
        binding: {
          ...v2,
          line: 'model',
          nature: 'contract',
          contractChange: 'additive',
          route: { kind: 'track', track: 'model' },
          writeScope: ['packages/model/model-contract/src'],
        },
      }),
    ).toEqual([])
  })

  it('reports missing, placeholder and milestone-less attributes', () => {
    expect(
      codes({ binding: undefined, card: card({ nature: 'impl', contractChange: 'none' }) }),
    ).toEqual([['attribute-missing', '交付线']])
    expect(
      codes({
        binding: undefined,
        card: card({ line: '{{线ID}}', nature: 'impl', contractChange: 'none' }),
      }),
    ).toEqual([['attribute-missing', '交付线']])
    expect(codes({ binding: undefined, card: card(undefined, { milestone: null }) })).toEqual([
      ['attribute-missing', 'milestone'],
    ])
  })

  it('reports unknown values and repeated fields as invalid', () => {
    expect(
      codes({
        binding: undefined,
        card: card({ line: 'unknown-line', nature: 'feature', contractChange: 'minor' }),
      }),
    ).toEqual([
      ['attribute-invalid', '交付线'],
      ['attribute-invalid', '性质'],
      ['attribute-invalid', '契约变更'],
    ])
    const repeated = card()
    repeated.fields.nature.push('design')
    expect(codes({ binding: undefined, card: repeated })).toContainEqual([
      'attribute-invalid',
      '性质',
    ])
  })

  it.each([
    [{ line: 'integration', nature: 'impl', contractChange: 'none' }, '合法组合:交付线'],
    [{ line: 'model', nature: 'integration', contractChange: 'none' }, '合法组合:交付线'],
    [{ line: 'model', nature: 'baseline', contractChange: 'none' }, '合法组合:交付线'],
    [{ line: 'model', nature: 'design', contractChange: 'additive' }, '合法组合:契约变更'],
    [{ line: 'model', nature: 'impl', contractChange: 'breaking' }, '合法组合:契约变更'],
  ])('reports the illegal combination %j', (written, clause) => {
    expect(codes({ binding: undefined, card: card(written) })).toEqual([
      ['attribute-invalid', clause],
    ])
  })

  it('reports drift between the body and the v2 binding, including the milestone', () => {
    expect(
      codes({ binding: { ...v2, nature: 'design', contractChange: 'additive', milestone: 'M0' } }),
    ).toEqual([
      ['attribute-binding-drift', 'binding.nature'],
      ['attribute-binding-drift', 'binding.contractChange'],
      ['attribute-binding-drift', 'binding.milestone'],
    ])
    expect(
      codes({
        binding: { ...v2, milestone: 'M0' },
        card: card(undefined, { milestone: undefined }),
      }),
    ).toEqual([])
  })

  it('reports a binding line outside the table', () => {
    expect(codes({ binding: { ...v2, line: 'gone' } })).toEqual([
      ['attribute-invalid', 'binding.line'],
      ['attribute-binding-drift', 'binding.line'],
    ])
  })

  it('reports a v1 binding and still checks route and scope from the body', () => {
    expect(codes({ binding: v1 })).toEqual([['binding-v1', 'binding']])
    expect(codes({ binding: { ...v1, route: { kind: 'track', track: 'model' } } })).toEqual([
      ['binding-v1', 'binding'],
      ['nature-route-mismatch', 'route.track'],
    ])
  })

  it.each([
    ['a line card off its line track', { line: 'model', nature: 'impl' }, 'legacy-refactor'],
    [
      'an integration card off the integration track',
      { line: 'integration', nature: 'integration' },
      'model',
    ],
    [
      'a line card of a trackless line off the integration track',
      { line: 'session-agent', nature: 'impl' },
      'model',
    ],
  ])('reports %s', (_, written, track) => {
    expect(
      codes({
        binding: { ...v1, route: { kind: 'track', track }, writeScope: ['tmp/x'] },
        card: card({ ...written, contractChange: 'none' }),
      }),
    ).toEqual([
      ['binding-v1', 'binding'],
      ['nature-route-mismatch', 'route.track'],
    ])
  })

  it('applies the cross-track rule to integration cards that write line paths', () => {
    const integration = card({
      line: 'integration',
      nature: 'integration',
      contractChange: 'breaking',
    })
    const binding = (route: TaskBindingV1['route'], writeScope: string[]): TaskBindingV1 => ({
      ...v1,
      route,
      writeScope,
    })
    const only = (input: Partial<AttributeInput>) =>
      codes({ card: integration, ...input }).filter(([code]) => code !== 'binding-v1')
    expect(
      only({ binding: binding({ kind: 'track', track: 'legacy-refactor' }, ['apps/cli']) }),
    ).toEqual([])
    expect(
      only({
        binding: binding({ kind: 'track', track: 'legacy-refactor' }, ['packages/model/model']),
      }),
    ).toEqual([['nature-route-mismatch', 'route.kind']])
    expect(
      only({
        binding: binding(
          { kind: 'cross-track', track: 'legacy-refactor', owners: ['session-owner'] },
          ['packages/model/model', 'packages/session/session'],
        ),
      }),
    ).toEqual([['nature-route-mismatch', 'route.owners']])
    expect(
      only({
        binding: binding(
          { kind: 'cross-track', track: 'legacy-refactor', owners: ['model-owner'] },
          ['apps/cli'],
        ),
      }),
    ).toEqual([['nature-route-mismatch', 'route.kind']])
  })

  it('reports write scope owned by another line or by the integration track', () => {
    const scope = (writeScope: string[]) => codes({ binding: { ...v2, writeScope } })
    expect(scope(['packages/model/model'])).toEqual([
      ['scope-outside-line', 'packages/model/model'],
    ])
    expect(scope(['apps/cli'])).toEqual([['scope-integration-path', 'apps/cli']])
    expect(scope(['README.md'])).toEqual([['scope-integration-path', 'README.md']])
    expect(scope(['packages'])).toEqual([
      ['scope-outside-line', 'packages'],
      ['scope-integration-path', 'packages'],
    ])
    expect(scope(['tmp/issue-7', 'pnpm-lock.yaml', 'packages/session/session/src'])).toEqual([])
  })

  it('limits contract cards to contract members and baseline cards to no repository writes', () => {
    expect(
      codes({
        card: card({ line: 'model', nature: 'contract', contractChange: 'none' }),
        binding: {
          ...v1,
          route: { kind: 'track', track: 'model' },
          writeScope: ['packages/model/model'],
        },
      }),
    ).toEqual([
      ['binding-v1', 'binding'],
      ['scope-outside-line', 'packages/model/model'],
    ])
    expect(
      codes({
        card: card({ line: 'integration', nature: 'baseline', contractChange: 'none' }),
        binding: { ...v1, writeScope: ['tmp/issue-7', 'docs/architecture'] },
      }),
    ).toEqual([
      ['binding-v1', 'binding'],
      ['scope-outside-line', 'docs/architecture'],
    ])
  })

  it('reports conditions on cards of other lines', () => {
    const target = (written: Written | undefined, condition = 'D-01') => ({
      condition,
      target: `https://github.com/owner/repo/issues/${condition.length}`,
      card: written === undefined ? undefined : card(written),
    })
    const model = { line: 'model', nature: 'impl', contractChange: 'none' }
    expect(
      codes({
        conditionCards: [
          target(model),
          target({ line: 'integration', nature: 'integration', contractChange: 'none' }, 'D-2'),
          target({ line: 'session-agent', nature: 'impl', contractChange: 'none' }, 'D-3'),
          target(undefined, 'D-4'),
        ],
      }),
    ).toEqual([['condition-cross-line', 'D-01']])
    expect(
      codes({
        binding: undefined,
        card: card({ line: 'integration', nature: 'integration', contractChange: 'none' }),
        conditionCards: [target(model)],
      }),
    ).toEqual([])
    expect(
      codes({
        binding: undefined,
        card: card({ line: 'integration', nature: 'baseline', contractChange: 'none' }),
        conditionCards: [target(undefined)],
      }),
    ).toEqual([['condition-cross-line', 'D-01']])
  })

  it('reports labels that differ from the body in the three families only', () => {
    const labelled = (labels: string[]) =>
      codes({ binding: undefined, card: card(undefined, { labels }) })
    expect(labelled(['line:session-agent', 'nature:impl', 'kind:bug'])).toEqual([])
    expect(labelled(['nature:impl'])).toEqual([['label-drift', 'line:']])
    expect(labelled(['line:session-agent', 'line:model', 'nature:impl'])).toEqual([
      ['label-drift', 'line:'],
    ])
    expect(labelled(['line:session-agent', 'nature:impl', 'contract:additive'])).toEqual([
      ['label-drift', 'contract:'],
    ])
    expect(
      codes({
        binding: undefined,
        card: card(
          { line: 'session-agent', nature: 'impl', contractChange: 'additive' },
          {
            labels: ['line:session-agent', 'nature:impl'],
          },
        ),
      }),
    ).toEqual([['label-drift', 'contract:']])
  })

  it('names the expected and actual values in messages', () => {
    const [drift] = findings({ binding: { ...v2, nature: 'design' } })
    expect(drift?.message).toContain('design')
    expect(drift?.message).toContain('impl')
  })
})
