import { describe, expect, it } from 'vitest'
import type { UsageSource } from '@omne-harness/usage-contract'
import { createUsageSources } from '@omne-harness/usage'

const named = (name: string): UsageSource<unknown> => ({
  name,
  limits: { page: 1, works: 1 },
  list: () => Promise.resolve({ ok: { entries: [], undated: 0, next: null } }),
})

describe('the registry of usage sources', () => {
  it('refuses a second source of a taken name and keeps the first', () => {
    const registry = createUsageSources<unknown>()
    const first = named('model')
    expect(registry.register(first)).toMatchObject({ kind: 'registered' })
    expect(registry.register(named('model'))).toEqual({ kind: 'conflict', name: 'model' })
    expect(registry.current()).toEqual([first])
  })

  it('withdraws only its own registration, once, and frees the name', () => {
    const registry = createUsageSources<unknown>()
    const model = registry.register(named('model'))
    const tool = named('tool')
    registry.register(tool)
    if (model.kind !== 'registered') throw new Error('registration')
    model.withdraw()
    model.withdraw()
    expect(registry.current()).toEqual([tool])
    const again = named('model')
    expect(registry.register(again)).toMatchObject({ kind: 'registered' })
    expect(registry.current()).toEqual([tool, again])
  })
})
