import { expect, it } from 'vitest'

it('exports the close protocol and the pure parts of the process-level assembly', async () => {
  const root = (await import('@omne-harness/assembly')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'LeaseId',
    'admitCall',
    'beginSupervision',
    'createCloseProtocol',
    'declareRow',
    'edgesOf',
    'finishCall',
    'generationFell',
    'judgeStamp',
    'needsOf',
    'noGenerations',
    'noVersions',
    'parsePointer',
    'parseStamp',
    'planChange',
    'prepareGeneration',
    'promoteGeneration',
    'standbyFailed',
    'standingOfVersion',
    'startsAfter',
    'stateOfGeneration',
    'stepVersions',
    'stopsAfter',
    'supervise',
    'superviseRow',
  ])
})
