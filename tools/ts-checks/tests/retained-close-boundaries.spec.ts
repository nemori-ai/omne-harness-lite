import { expect, test } from 'vitest'
import { corePureImports } from '../src/index.ts'

test('the tool definition can reuse pure close-control types without loading a Cordis face', () => {
  const path = 'core/tool-execution-runtime/src/runtime-provider.ts'
  expect(
    corePureImports.check([
      {
        path,
        text: "import type { RetainedCloseControl } from '@omne-harness-lite/assembly-lifecycle'",
      },
    ]),
  ).toEqual([])
  for (const specifier of [
    '@omne-harness-lite/assembly-lifecycle/cordis',
    '@omne-harness-lite/assembly-lifecycle/private',
    '@omne-harness-lite/assembly-lifecycle/src/lifetime.ts',
    '@deepseek-ai/cordis',
  ]) {
    expect(corePureImports.check([{ path, text: `import '${specifier}'` }])).toHaveLength(1)
  }
})
