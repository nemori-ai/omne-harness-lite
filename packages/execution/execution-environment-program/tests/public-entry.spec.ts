import { expect, it } from 'vitest'

it('exports the provider, its name and its default ceilings', async () => {
  const root = (await import('@omne-harness/execution-environment-program')) as Record<
    string,
    unknown
  >
  expect(Object.keys(root).sort()).toEqual([
    'createProgramProvider',
    'defaultProgramCeilings',
    'programProviderName',
  ])
})
