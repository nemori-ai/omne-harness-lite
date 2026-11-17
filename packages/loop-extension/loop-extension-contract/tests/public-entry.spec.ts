import { expect, it } from 'vitest'

it('exports the category, the package format, the block and the command protocol', async () => {
  const root = (await import('@omne-harness/loop-extension-contract')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'COMMAND_OUTPUT_LIMIT_BYTES',
    'COMMAND_PROTOCOL',
    'DECLARATION_PATH',
    'ENABLED_EXTENSIONS_BLOCK',
    'ENABLED_EXTENSIONS_PUBLICATION',
    'LOOP_EXTENSION_CATEGORY',
    'LOOP_EXTENSION_PACKAGE_LIMITS',
    'MODEL_CALL_NEED',
    'RUN_SETTING',
    'commandRequest',
    'commandTimeoutMs',
    'declarationOf',
    'enabledExtensionsBinding',
    'enabledExtensionsDescriptor',
    'enabledExtensionsProducer',
    'loopExtensionBodyContract',
  ])
})
