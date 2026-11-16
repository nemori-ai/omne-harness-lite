import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('exports the time source, the system source and the waits at the root, and the simulated source on its own entry', async () => {
  const root = (await import('@omne-harness/time-source')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['every', 'sleep', 'systemTime', 'waitUntil'])
  const simulated = (await import('@omne-harness/time-source/simulated')) as Record<string, unknown>
  expect(Object.keys(simulated)).toEqual(['simulatedTime'])
  const parsed: unknown = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  )
  expect(parsed).toMatchObject({ dependencies: {}, engines: { node: '>=24' } })
})
