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
    'windowBackendFor',
  ])
})

it('the testing entry exports the window backend contract suite and a stand-in over a scene', async () => {
  const testing = (await import('@omne-harness/screen/testing')) as Record<string, unknown>
  expect(Object.keys(testing).sort()).toEqual([
    'pngOf',
    'windowBackendOfScene',
    'windowContractCases',
  ])
})
