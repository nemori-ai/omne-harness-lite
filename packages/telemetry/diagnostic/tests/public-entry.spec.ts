import { expect, it } from 'vitest'

it('exports the diagnostic port from the package root', async () => {
  const root = (await import('@omne-harness/diagnostic')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['createDiagnosticPort', 'keepBusinessResult'])
})
