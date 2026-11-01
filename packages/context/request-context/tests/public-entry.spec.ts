import { expect, it } from 'vitest'

it('the root entry exports the factories and the initial values of the default strategies', async () => {
  const root = (await import('@omne-harness/request-context')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'DEFAULT_COMPACTION_POLICY',
    'DEFAULT_REPRESENTATION_CONFIG',
    'DEFAULT_TRIM_BYTES',
    'createAbsentConversionResults',
    'createContextAccounting',
    'createContextSourceRegistry',
    'createDefaultCompactionPolicy',
    'createDefaultRepresentationPolicy',
  ])
  for (const [name, value] of Object.entries(root))
    expect(typeof value, name).toBe(
      name.startsWith('create') ? 'function' : name === 'DEFAULT_TRIM_BYTES' ? 'string' : 'object',
    )
})
