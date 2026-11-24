import { expect, it } from 'vitest'
import { ShellAssemblyError, slots } from '@omne-harness/shell-contract'

it('exports the toast store, the figure store, the assembly error, the slot table, the contracts of the five shell points, the attribute a floating item is dragged by, the two point declarations, the two needs and the point a protocol need refers to, the declaration of a part with its check and its reading, and nothing else at run time', async () => {
  const root = (await import('@omne-harness/shell-contract')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'FLOAT_GRIP_ATTRIBUTE',
    'LAYOUT_POINT',
    'PARTS_POINT',
    'PART_ATTRIBUTE',
    'PROTOCOLS_POINT',
    'RENDER_POINT',
    'STYLE_POINT',
    'ShellAssemblyError',
    'TOKENS_POINT',
    'attachWhile',
    'changesOn',
    'createFigureStore',
    'createToastStore',
    'defineKeyedPoint',
    'definePart',
    'definePoint',
    'defineRenderPoint',
    'lookScope',
    'needPoint',
    'needProtocol',
    'partFault',
    'partsOn',
    'serviceKey',
    'shellContracts',
    'slots',
    'tenantScope',
    'valueFault',
  ])
})

it('declares six slots, two that hold one and four lists', () => {
  expect(slots).toEqual({
    gate: { kind: 'one' },
    pages: { kind: 'list' },
    sidebar: { kind: 'list' },
    float: { kind: 'list' },
    back: { kind: 'one' },
    attached: { kind: 'list' },
  })
  expect(ShellAssemblyError.prototype).toBeInstanceOf(Error)
})

it('declares the five points of the shell itself as fixed when the application is built', async () => {
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
  expect(shellContracts).toEqual([
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
  ])
})
