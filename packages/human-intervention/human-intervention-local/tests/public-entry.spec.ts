import { expect, it } from 'vitest'
import { hitlSqlMaterials } from '@omne-harness/human-intervention-local'
it('exposes registered SQL materials without a global service instance', () => {
  const materials = hitlSqlMaterials()
  expect(materials.participants.map(item => item.participant)).toEqual([
    'hitl.local-plan',
    'hitl.requests',
    'hitl.terminal',
  ])
  expect(materials.readHandlers.map(item => item.handler)).toEqual([
    'hitl.pool-read',
    'hitl.request-read',
    'hitl.terminal-read',
  ])
})
