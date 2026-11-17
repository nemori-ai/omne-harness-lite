import { expect, it } from 'vitest'

it('exports the category, the package format, the block and the command protocol', async () => {
  const root = (await import('@omne-harness/loop-extension-contract')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'DECLARATION_PATH',
    'ENABLED_EXTENSIONS_BLOCK',
    'LOOP_EXTENSION_CATEGORY',
    'LOOP_EXTENSION_PACKAGE_LIMITS',
    'MODEL_CALL_NEED',
    'RUN_SETTING',
    'declarationOf',
    'loopExtensionBodyContract',
  ])
})
