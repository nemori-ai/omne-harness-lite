import type { AnswerOf, LoginIdentity } from '@omne-harness/access-cordis-contract'
import { assetsProtocol } from '@omne-harness/assets-protocol'
import { readJsonText, writeJsonText, type JsonLimits } from '@omne-harness/json-text'
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

type Operation = (typeof assetsProtocol.operations)['list-categories']
type Listing = ReturnType<CategoriesPort['list']>[number]

const listing = (category: string, title: string): Listing => ({
  category,
  display: { title, summary: `${title}。` },
})
const ALL = [
  listing('model-provider', '模型供应商'),
  listing('skill', '技能'),
  listing('tool', '工具'),
]

function contribution(categories: CategoriesPort | undefined) {
  const asked: string[] = []
  const made = createAssetsContribution({
    settings: () => undefined,
    categories: () => categories,
    principals: {
      async actingFor() {
        asked.push('actingFor')
        return { refused: 'denied' }
      },
    },
  })
  return { asked, made }
}

async function list(categories: CategoriesPort | undefined, after: string | null, limit: number) {
  const read = readJsonText(JSON.stringify({ after, limit }), limits)
  if (read.kind !== 'ok') throw new Error('body')
  const body = assetsProtocol.operations['list-categories'].body.read(read.value, limits)
  if (!body.ok) throw new Error('body did not read')
  const { asked, made } = contribution(categories)
  const handler = made.operations['list-categories'] as (
    context: unknown,
    value: unknown,
  ) => Promise<AnswerOf<Operation>>
  const answer = await handler(
    {
      principal: {} as LoginIdentity,
      messageId: 'm-1',
      signal: new AbortController().signal,
    },
    body.value,
  )
  return { answer, asked }
}

function wire(answer: AnswerOf<Operation>) {
  if (answer.outcome !== 'succeeded') return answer
  const written = assetsProtocol.operations['list-categories'].outcomes.succeeded.write(
    answer.body,
    limits,
  )
  if (!written.ok) throw new Error('the page did not write')
  return { outcome: answer.outcome, body: JSON.parse(writeJsonText(written.value)) as unknown }
}

describe('list-categories', () => {
  it('answers every category of the deployment with its name and summary, without asking for a tenant', async () => {
    const { answer, asked } = await list({ list: () => ALL }, null, 100)
    expect(wire(answer)).toEqual({
      outcome: 'succeeded',
      body: {
        items: [
          { category: 'model-provider', title: '模型供应商', summary: '模型供应商。' },
          { category: 'skill', title: '技能', summary: '技能。' },
          { category: 'tool', title: '工具', summary: '工具。' },
        ],
        next: null,
      },
    })
    expect(asked).toEqual([])
  })

  it('pages by limit and continues after the last category of a page', async () => {
    const first = await list({ list: () => ALL }, null, 2)
    expect(wire(first.answer)).toMatchObject({
      body: { items: [{ category: 'model-provider' }, { category: 'skill' }], next: 'skill' },
    })
    const second = await list({ list: () => ALL }, 'skill', 2)
    expect(wire(second.answer)).toMatchObject({
      body: { items: [{ category: 'tool' }], next: null },
    })
    const exact = await list({ list: () => ALL }, null, 3)
    expect(wire(exact.answer)).toMatchObject({ body: { next: null } })
  })

  it('answers basis-unavailable when the extension point is not there or cannot list', async () => {
    expect((await list(undefined, null, 10)).answer).toEqual({ outcome: 'basis-unavailable' })
    const throwing: CategoriesPort = {
      list() {
        throw new Error('gone')
      },
    }
    expect((await list(throwing, null, 10)).answer).toEqual({ outcome: 'basis-unavailable' })
  })

  it('takes the categories at each call', async () => {
    let current = ALL.slice(0, 1)
    const port: CategoriesPort = { list: () => current }
    const { made } = contribution(port)
    const handler = made.operations['list-categories'] as (
      context: unknown,
      value: unknown,
    ) => Promise<AnswerOf<Operation>>
    const page = { after: null, limit: 10 }
    const context = { principal: {}, messageId: 'm', signal: new AbortController().signal }
    expect(await handler(context, page)).toMatchObject({
      body: { items: [{ category: 'model-provider' }] },
    })
    current = ALL
    expect(await handler(context, page)).toMatchObject({ body: { items: { length: 3 } } })
  })
})
