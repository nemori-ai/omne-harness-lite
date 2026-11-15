import { expect, it } from 'vitest'
import { ShellAssemblyError, slots } from '@omne-harness/shell-contract'

it('exports the slot store, the assembly error and the slot table, and nothing else at run time', async () => {
  const root = (await import('@omne-harness/shell-contract')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['ShellAssemblyError', 'createSlotStore', 'slots'])
})

it('declares three slots, two of them lists', () => {
  expect(slots).toEqual({
    gate: { kind: 'one' },
    pages: { kind: 'list' },
    sidebar: { kind: 'list' },
  })
  expect(ShellAssemblyError.prototype).toBeInstanceOf(Error)
})
