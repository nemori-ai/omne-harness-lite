import { decodeProviderName } from '@omne-harness/model-contract'
import { expect, it } from 'vitest'
import { officialCatalog } from '../src/official-catalog.ts'

const openrouter = (() => {
  const decoded = decodeProviderName('openrouter')
  if (!('ok' in decoded)) throw new Error('provider name')
  return decoded.ok
})()

it('lists one catalog model per official profile of the provider, by the name the provider gives it', () => {
  const catalog = officialCatalog(openrouter, () => false)
  const models = catalog.map(entry => entry.model)
  expect(models).toHaveLength(46)
  expect(new Set(models).size).toBe(46)
  expect(catalog.filter(entry => entry.kind === 'llm')).toHaveLength(43)
  expect(catalog.filter(entry => entry.kind === 'decisions')).toEqual([
    {
      kind: 'decisions',
      model: 'openai/gpt-6-luna-decisions',
      title: 'openai/gpt-6-luna-decisions',
      input: ['text'],
      output: ['text'],
      maxQuestions: '200',
      enabled: false,
    },
    {
      kind: 'decisions',
      model: 'typesafe/jev-1.13',
      title: 'typesafe/jev-1.13',
      input: ['text'],
      output: ['text'],
      enabled: false,
    },
    expect.objectContaining({ kind: 'decisions', model: 'typesafe/jev-1.14' }),
  ])
  expect(models).toContain('anthropic/claude-opus-5.5')
  expect(models).toContain('z-ai/glm-5.3-prime')
  expect(catalog.every(entry => entry.title === entry.model)).toBe(true)
})

it('takes the modalities, the window and the reasoning efforts from the profile', () => {
  const catalog = officialCatalog(openrouter, () => false)
  const omni = catalog.find(entry => entry.model === 'qwen/qwen3.8-omni-flash')
  expect(omni?.input).toContain('voice')
  const sol = catalog.find(entry => entry.model === 'openai/gpt-6.1-sol')
  if (sol?.kind !== 'llm') throw new Error('the chat model is not in the catalog')
  expect(sol.efforts.length).toBeGreaterThan(0)
  expect(sol.window).toMatch(/^[1-9][0-9]*$/u)
  for (const entry of catalog) expect(entry.input).toContain('text')
})

it('marks enabled exactly the models the release enables', () => {
  const catalog = officialCatalog(openrouter, model => model.startsWith('anthropic/'))
  expect(
    catalog
      .filter(entry => entry.enabled)
      .map(entry => entry.model)
      .sort(),
  ).toEqual(
    catalog
      .map(entry => entry.model)
      .filter(model => model.startsWith('anthropic/'))
      .sort(),
  )
})

it('lists the chat, the decisions and the live model OpenAI serves itself, each with the facts of its kind', () => {
  const openai = decodeProviderName('openai')
  if (!('ok' in openai)) throw new Error('provider name')
  const catalog = officialCatalog(openai.ok, model => model === 'gpt-live-1.1')
  expect(catalog.map(entry => [entry.kind, entry.model, entry.enabled])).toEqual([
    ['llm', 'gpt-6-luna', false],
    ['decisions', 'gpt-6-luna', false],
    ['live', 'gpt-live-1.1', true],
  ])
  expect(catalog[1]).toMatchObject({ kind: 'decisions', maxQuestions: '400' })
  expect(catalog[2]).toEqual({
    kind: 'live',
    model: 'gpt-live-1.1',
    title: 'gpt-live-1.1',
    input: ['voice', 'text'],
    output: ['voice', 'text'],
    enabled: true,
  })
})

it('a provider with no official profile has an empty catalog', () => {
  const other = decodeProviderName('elsewhere')
  if (!('ok' in other)) throw new Error('provider name')
  expect(officialCatalog(other.ok, () => true)).toEqual([])
})
