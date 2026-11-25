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
  expect(models).toHaveLength(43)
  expect(new Set(models).size).toBe(43)
  expect(models).toContain('anthropic/claude-opus-5.5')
  expect(models).toContain('z-ai/glm-5.3-prime')
  expect(catalog.every(entry => entry.title === entry.model)).toBe(true)
})

it('takes the modalities, the window and the reasoning efforts from the profile', () => {
  const catalog = officialCatalog(openrouter, () => false)
  const omni = catalog.find(entry => entry.model === 'qwen/qwen3.8-omni-flash')
  expect(omni?.input).toContain('voice')
  const sol = catalog.find(entry => entry.model === 'openai/gpt-6.1-sol')
  expect(sol?.efforts.length).toBeGreaterThan(0)
  expect(sol?.window).toMatch(/^[1-9][0-9]*$/u)
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

it('a provider with no official profile has an empty catalog', () => {
  const other = decodeProviderName('elsewhere')
  if (!('ok' in other)) throw new Error('provider name')
  expect(officialCatalog(other.ok, () => true)).toEqual([])
})
