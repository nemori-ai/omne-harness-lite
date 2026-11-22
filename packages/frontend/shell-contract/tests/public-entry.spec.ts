import { expect, it } from 'vitest'
import { ShellAssemblyError, slots } from '@omne-harness/shell-contract'

it('exports the toast store, the figure store, the assembly error, the slot table, the contracts of the three shell points and the two point declarations, and nothing else at run time', async () => {
  const root = (await import('@omne-harness/shell-contract')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'ShellAssemblyError',
    'createFigureStore',
    'createToastStore',
    'defineKeyedPoint',
    'definePoint',
    'serviceKey',
    'serviceOf',
    'shellContracts',
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

it('declares the three points of the shell itself as fixed when the application is built', async () => {
  const { shellContracts } = await import('@omne-harness/shell-contract')
  expect(
    shellContracts.map(contract => [
      contract.name,
      contract.arity,
      contract.binding,
      contract.tree,
    ]),
  ).toEqual([
    ['shell.gate', 'one', 'build', 'client'],
    ['shell.pages', 'list', 'build', 'client'],
    ['shell.sidebar', 'list', 'build', 'client'],
  ])
})
