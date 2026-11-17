import { expect, it } from 'vitest'
import { ShellAssemblyError, slots } from '@omne-harness/shell-contract'

it('exports the slot store, the assembly error, the slot table and the two point declarations, and nothing else at run time', async () => {
  const root = (await import('@omne-harness/shell-contract')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'ShellAssemblyError',
    'createSlotStore',
    'defineKeyedPoint',
    'definePoint',
    'slots',
  ])
})

it('declares four slots, three of them lists', () => {
  expect(slots).toEqual({
    gate: { kind: 'one' },
    pages: { kind: 'list' },
    sidebar: { kind: 'list' },
    attached: { kind: 'list' },
  })
  expect(ShellAssemblyError.prototype).toBeInstanceOf(Error)
})
