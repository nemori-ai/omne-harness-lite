// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import type { createUsageUiModule as Create } from '@omne-harness/usage-ui/cordis'

const given = vi.hoisted(() => ({ options: [] as Parameters<typeof Create>[0][] }))
vi.mock('@omne-harness/usage-ui/cordis', async original => {
  const real = await original<typeof import('@omne-harness/usage-ui/cordis')>()
  const createUsageUiModule: typeof Create = options => {
    given.options.push(options)
    return real.createUsageUiModule(options)
  }
  return { ...real, createUsageUiModule }
})

it('reads usage again every 60 seconds and keeps the layouts in the local storage of the page', async () => {
  const { USAGE_LAYOUTS_KEY } = await import('@omne-harness/usage-ui')
  await import('../src/page/assembly.tsx')
  expect(given.options).toHaveLength(1)
  const [options] = given.options
  expect(options?.refreshMs).toBe(60_000)
  const kept = new Map<string, string>()
  const local = {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
  }
  Object.defineProperty(window, 'localStorage', { value: local, configurable: true })
  const layouts = { tenant: [{ widget: 'usage.summary', width: 3, presentation: null }] }
  options?.store?.write(layouts)
  expect(JSON.parse(kept.get(USAGE_LAYOUTS_KEY) ?? 'null')).toEqual(layouts)
  expect(options?.store?.read()).toEqual(layouts)
})
