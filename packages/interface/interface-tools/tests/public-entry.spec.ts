import { expect, it } from 'vitest'

it('exports the tool, how a call is bound to where it looks, and how its parameters are read', async () => {
  const root = (await import('@omne-harness/interface-tools')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'APP_VIEW',
    'appViewAdoption',
    'appViewOf',
    'appViewToolModule',
    'attachAppView',
    'createAppViewAuthor',
    'lookContract',
    'lookParameterCodec',
    'modeOfArguments',
    'nowContract',
    'nowParameterCodec',
  ])
})
