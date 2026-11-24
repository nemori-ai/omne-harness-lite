import type { AnswerOf, LoginIdentity } from '@omne-harness/access-cordis-contract'
import { createCategoryPoint, type BodyContract } from '@omne-harness/assets'
import { assetsProtocol } from '@omne-harness/assets-protocol'
import {
  readJsonText,
  writeJsonText,
  type JsonLimits,
  type JsonValue,
} from '@omne-harness/json-text'
import { describe, expect, it } from 'vitest'
import { createAssetsContribution } from '../src/contribution.ts'
import type { CategoriesPort } from '../src/ports.ts'

const limits: JsonLimits = {
  maxBytes: 100_000,
  maxDepth: 50,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}

type Operations = (typeof assetsProtocol)['operations']
type Name = 'list-categories' | 'describe-category'

const SCHEMA = {
  kind: 'object',
  entries: [{ key: 'type', value: { kind: 'string', value: 'object' } }],
} as const
const LIMITS = { files: 200, fileBytes: 1_048_576, totalBytes: 8_388_608 }

function contract(category: string, layout: boolean): BodyContract {
  return {
    category,
    schema: SCHEMA,
    judge: () => ({ ok: true }),
    deriveDeclarations: () => ({ entries: [] }),
    references: () => [],
    ...(layout
      ? {
          layout: {
            namespace: `${category}s`,
            limits: LIMITS,
            inspect: async () => ({ ok: SCHEMA }),
          },
        }
      : {}),
  }
}

function deployment(): CategoriesPort {
  const point = createCategoryPoint()
  point.contribute({
    contract: contract('model-provider', false),
    display: { title: '模型供应商', summary: '模型供应商。' },
    generalCreation: 'closed',
    point: 'model-provider.items',
  })
  point.contribute({
    contract: contract('skill', true),
    display: { title: '技能', summary: '技能。', creation: '选一个技能目录。' },
    point: 'skill.items',
  })
  point.contribute({
    contract: contract('tool', false),
    display: { title: '工具', summary: '工具。' },
    point: 'tool.items',
  })
  return point
}

function contribution(categories: () => CategoriesPort | undefined) {
  const asked: string[] = []
  const made = createAssetsContribution({
    settings: () => undefined,
    categories,
    management: () => undefined,
    changes: () => undefined,
    principals: {
      async actingFor() {
        asked.push('actingFor')
        return { refused: 'denied' }
      },
    },
  })
  return { asked, made }
}

async function call<N extends Name>(
  name: N,
  categories: () => CategoriesPort | undefined,
  sample: unknown,
) {
  const read = readJsonText(JSON.stringify(sample), limits)
  if (read.kind !== 'ok') throw new Error('body')
  const body = assetsProtocol.operations[name].body.read(read.value, limits)
  if (!body.ok) throw new Error('body did not read')
  const { asked, made } = contribution(categories)
  const handler = made.operations[name] as (
    context: unknown,
    value: unknown,
  ) => Promise<AnswerOf<Operations[N]>>
  const answer = await handler(
    { principal: {} as LoginIdentity, messageId: 'm-1', signal: new AbortController().signal },
    body.value,
  )
  return { answer, asked }
}

function wire(name: Name, answer: Readonly<{ outcome: string; body?: unknown }>) {
  if (answer.outcome !== 'succeeded') return answer
  const codec: {
    write(value: unknown, at: JsonLimits): { ok: true; value: JsonValue } | { ok: false }
  } = assetsProtocol.operations[name].outcomes.succeeded
  const written = codec.write(answer.body, limits)
  if (!written.ok) throw new Error('the answer did not write')
  return { outcome: answer.outcome, body: JSON.parse(writeJsonText(written.value)) as unknown }
}

const list = (categories: () => CategoriesPort | undefined, after: string | null, limit: number) =>
  call('list-categories', categories, { after, limit })

describe('list-categories', () => {
  it('answers every category with its name, summary and creation, without asking for a tenant', async () => {
    const { answer, asked } = await list(deployment, null, 100)
    expect(wire('list-categories', answer)).toEqual({
      outcome: 'succeeded',
      body: {
        items: [
          {
            category: 'model-provider',
            title: '模型供应商',
            summary: '模型供应商。',
            creation: 'none',
          },
          { category: 'skill', title: '技能', summary: '技能。', creation: 'directory' },
          { category: 'tool', title: '工具', summary: '工具。', creation: 'data' },
        ],
        next: null,
      },
    })
    expect(asked).toEqual([])
  })

  it('pages by limit and continues after the last category of a page', async () => {
    const first = await list(deployment, null, 2)
    expect(wire('list-categories', first.answer)).toMatchObject({
      body: { items: [{ category: 'model-provider' }, { category: 'skill' }], next: 'skill' },
    })
    const second = await list(deployment, 'skill', 2)
    expect(wire('list-categories', second.answer)).toMatchObject({
      body: { items: [{ category: 'tool' }], next: null },
    })
    const single = await list(deployment, null, 1)
    expect(wire('list-categories', single.answer)).toMatchObject({
      body: { items: [{ category: 'model-provider' }], next: 'model-provider' },
    })
    const exact = await list(deployment, null, 3)
    expect(wire('list-categories', exact.answer)).toMatchObject({ body: { next: null } })
  })

  it('answers basis-unavailable when the extension point is not there or cannot list', async () => {
    expect((await list(() => undefined, null, 10)).answer).toEqual({
      outcome: 'basis-unavailable',
    })
    const throwing = {
      ...deployment(),
      list() {
        throw new Error('gone')
      },
    }
    expect((await list(() => throwing, null, 10)).answer).toEqual({
      outcome: 'basis-unavailable',
    })
  })

  it('takes the categories at each call', async () => {
    let current: CategoriesPort = createCategoryPoint()
    const { made } = contribution(() => current)
    const handler = made.operations['list-categories'] as (
      context: unknown,
      value: unknown,
    ) => Promise<AnswerOf<Operations['list-categories']>>
    const page = { after: null, limit: 10 }
    const context = { principal: {}, messageId: 'm', signal: new AbortController().signal }
    expect(await handler(context, page)).toMatchObject({ body: { items: [] } })
    current = deployment()
    expect(await handler(context, page)).toMatchObject({ body: { items: { length: 3 } } })
  })
})

describe('describe-category', () => {
  const describeOf = (
    category: string,
    categories: () => CategoriesPort | undefined = deployment,
  ) => call('describe-category', categories, { category })

  it('a directory category gives its three limits and the hint for creating one', async () => {
    const { answer, asked } = await describeOf('skill')
    expect(wire('describe-category', answer)).toEqual({
      outcome: 'succeeded',
      body: {
        category: 'skill',
        title: '技能',
        summary: '技能。',
        hint: '选一个技能目录。',
        creation: { kind: 'directory', limits: LIMITS },
      },
    })
    expect(asked).toEqual([])
  })

  it('a data category gives the schema of its body; one closed to creation gives none', async () => {
    expect(wire('describe-category', (await describeOf('tool')).answer)).toMatchObject({
      body: { hint: null, creation: { kind: 'data', schema: { type: 'object' } } },
    })
    expect(wire('describe-category', (await describeOf('model-provider')).answer)).toMatchObject({
      body: { creation: { kind: 'none' } },
    })
  })

  it('a category closed to creation gives none even when its contract has a directory layout', async () => {
    const point = createCategoryPoint()
    point.contribute({
      contract: contract('bundle', true),
      display: { title: '包', summary: '包。' },
      generalCreation: 'closed',
      point: 'bundle.items',
    })
    expect(
      wire('describe-category', (await describeOf('bundle', () => point)).answer),
    ).toMatchObject({
      body: { creation: { kind: 'none' } },
    })
  })

  it('a category not there is not-found; no extension point is basis-unavailable', async () => {
    expect((await describeOf('gone')).answer).toEqual({ outcome: 'not-found', body: {} })
    expect((await describeOf('skill', () => undefined)).answer).toEqual({
      outcome: 'basis-unavailable',
    })
  })
})
