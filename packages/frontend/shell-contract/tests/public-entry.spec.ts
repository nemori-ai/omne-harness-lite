import { expect, it } from 'vitest'
import { ShellAssemblyError, slots } from '@omne-harness/shell-contract'

it('exports the toast store, the figure store, the assembly error, the slot table, the contracts of the six shell points and of the actions, the key functions, the attribute a floating item is dragged by, the two point declarations, the two needs and the point a protocol need refers to, the declaration of a part with its check and its reading, the projection of the changes, and nothing else at run time', async () => {
  const root = (await import('@omne-harness/shell-contract')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'FLOAT_GRIP_ATTRIBUTE',
    'GRANTS_ITSELF',
    'LAYOUT_POINT',
    'NO_TENANT',
    'PARTS_POINT',
    'PART_ATTRIBUTE',
    'PROTOCOLS_POINT',
    'READ_FOR_ALL',
    'RENDER_POINT',
    'RESERVED_CHORDS',
    'SPEAKS_AS_SYSTEM',
    'STYLE_POINT',
    'ShellAssemblyError',
    'TOKENS_POINT',
    'actionAt',
    'actionsContract',
    'attachWhile',
    'bareChord',
    'changesOn',
    'chordLabel',
    'chordOf',
    'createFigureStore',
    'createToastStore',
    'defineKeyedPoint',
    'definePart',
    'definePoint',
    'defineRenderPoint',
    'judgeBinding',
    'keyClashes',
    'keymapContract',
    'keymapOf',
    'layersOf',
    'lookScope',
    'needPoint',
    'needProtocol',
    'normalChord',
    'partFault',
    'partsOn',
    'projectionOn',
    'protocolClientOf',
    'resolveKey',
    'serviceKey',
    'shellContracts',
    'slots',
    'tenantScope',
    'valueFault',
  ])
})

it('declares nine slots, four that hold one and five lists', () => {
  expect(slots).toEqual({
    gate: { kind: 'one' },
    pages: { kind: 'list' },
    sidebar: { kind: 'list' },
    float: { kind: 'list' },
    back: { kind: 'one' },
    say: { kind: 'one' },
    attached: { kind: 'list' },
    actions: { kind: 'list' },
    keymap: { kind: 'one' },
  })
  expect(ShellAssemblyError.prototype).toBeInstanceOf(Error)
})

it('declares the six points of the shell itself: the login gate fixed and closed, the other five open while running, the most specific item counting', async () => {
  const { shellContracts } = await import('@omne-harness/shell-contract')
  expect(
    shellContracts.map(contract => [
      contract.name,
      contract.arity,
      contract.binding,
      contract.resolve,
      contract.scopes === undefined || contract.scopes === 'all' ? 'open' : contract.scopes.why,
      contract.example === undefined ? 'no example' : 'example',
    ]),
  ).toEqual([
    ['shell.gate', 'one', 'build', 'conflict', 'no-tenant', 'no example'],
    ['shell.pages', 'list', 'run', 'most-specific', 'open', 'example'],
    ['shell.sidebar', 'list', 'run', 'most-specific', 'open', 'example'],
    ['shell.float', 'list', 'run', 'most-specific', 'open', 'example'],
    ['shell.back', 'one', 'run', 'most-specific', 'open', 'example'],
    ['shell.say', 'one', 'run', 'most-specific', 'open', 'example'],
  ])
})
