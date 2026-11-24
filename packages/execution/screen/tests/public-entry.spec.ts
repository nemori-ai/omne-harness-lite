import { expect, it } from 'vitest'

it('the root entry exports the backend contract, its shared functions and the choice by system', async () => {
  const root = (await import('@omne-harness/screen')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'diagnoseScreen',
    'libraryBackend',
    'macosRequestScreenAccess',
    'macosScreenPermission',
    'monitorsProblem',
    'regionWithin',
    'screenBackendFor',
    'selfCheck',
  ])
})
