import { expect, it } from 'vitest'

it('the root entry exports the processor, its name, the media source of Model and the converter category', async () => {
  const root = (await import('@omne-harness/media-adapters')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'CONVERTER_CATEGORY',
    'REFERENCES_PROCESSOR',
    'converterBodyContract',
    'converterCategoryDisplay',
    'createConverterDefinitions',
    'createModelMediaSource',
    'createReferencesProcessor',
    'createToolMediaStore',
    'parseConverterBody',
  ])
})
