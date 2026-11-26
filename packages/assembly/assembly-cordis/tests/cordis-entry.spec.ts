import { expect, it } from 'vitest'

it('the cordis entry exports the entry of a row, the step that swaps its generation and the supervision of rows', async () => {
  const cordis = (await import('@omne-harness/assembly-cordis/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'EntryRefused',
    'RowSupervisor',
    'SupervisionRefused',
    'defineEntry',
    'liveEdges',
    'swapRow',
  ])
})
