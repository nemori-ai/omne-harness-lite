import { expect, it } from 'vitest'

it('exports the accepted environment contract from the package root', async () => {
  const root = (await import('@omne-harness/execution-environment')) as Record<string, unknown>
  expect(typeof root.createHostFiles).toBe('function')
  expect(typeof root.hostObjectToken).toBe('function')
})
