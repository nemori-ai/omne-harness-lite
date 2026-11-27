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

it('declares the six points of the shell itself as fixed when the application is built', async () => {
  const { shellContracts } = await import('@omne-harness/shell-contract')
  const shared = {
    tree: 'client',
    keyFrom: null,
    key: 'none',
    item: { kind: 'pure', fields: { render: 'function' } },
    resolve: 'conflict',
    binding: 'build',
    version: 1,
    revision: 1,
    keys: 'private',
    conformance: null,
  }
  expect(shellContracts.map(({ scopes: _scopes, ...rest }) => rest)).toEqual([
    {
      ...shared,
      name: 'shell.gate',
      arity: 'one',
      gives: 'nothing',
      onError: 'the gate shows that this item cannot be read',
      summary:
        'The login gate: all the shell shows while nobody is signed in. Fixed when the app is built: a plugin cannot add to it while the app runs.',
    },
    {
      ...shared,
      name: 'shell.pages',
      arity: 'list',
      gives: 'the tenant scope, and a subject when the page is brought up on one',
      onError: 'only this page shows that it cannot be read',
      summary:
        'The pages of the shell, in the order of their order and id. Fixed when the app is built: a plugin cannot add to it while the app runs.',
    },
    {
      ...shared,
      name: 'shell.sidebar',
      arity: 'list',
      gives: 'the tenant scope',
      onError: 'only this section shows that it cannot be read',
      summary:
        'The sections of the sidebar, in the order of their order and id. Fixed when the app is built: a plugin cannot add to it while the app runs.',
    },
    {
      ...shared,
      name: 'shell.float',
      arity: 'list',
      gives: 'the tenant scope',
      onError: 'only this item is not drawn',
      summary:
        'What floats over the whole application once somebody is signed in, in the order of their order and id. Fixed when the app is built: a plugin cannot add to it while the app runs.',
    },
    {
      ...shared,
      name: 'shell.back',
      arity: 'one',
      gives:
        "the tenant scope; turn, which turns the application to its other face; and home, which goes where the front's home goes",
      onError: 'only this item shows that it cannot be read; the shell still turns to the front',
      summary:
        'The back of the application: its other face once somebody is signed in. Fixed when the app is built: a plugin cannot add to it while the app runs.',
    },
    {
      ...shared,
      name: 'shell.say',
      arity: 'one',
      revision: 2,
      item: {
        kind: 'pure',
        fields: {
          targets: 'function',
          current: 'function',
          subscribe: 'function',
          say: 'function',
          show: 'function',
        },
      },
      gives: 'nothing: the shell hands the tenant scope with each call',
      onError:
        'a reading that throws or answers undefined lets nothing be said; a say that throws ends unknown and is not said again',
      summary:
        'Where the words a person says to the figure go: the item draws nothing, and the shell asks it afresh each time. Fixed when the app is built: a plugin cannot add to it while the app runs.',
    },
  ]) // Until the shell reads them for the tenant who asks, they are closed to plugins; the gate for good.
  expect(shellContracts.map(contract => [contract.name, contract.scopes])).toEqual([
    ['shell.gate', expect.objectContaining({ why: 'no-tenant' })],
    ...['shell.pages', 'shell.sidebar', 'shell.float', 'shell.back', 'shell.say'].map(name => [
      name,
      expect.objectContaining({ why: 'one-per-process' }),
    ]),
  ])
})
