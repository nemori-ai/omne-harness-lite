import { expect, it } from 'vitest'
import { corePureImports } from '../src/index.ts'

it('keeps tree binding dependencies confined to the binding closure', () => {
  const check = (name: string, target: string) =>
    corePureImports.check([
      { path: `core/cordis-plugin-tree/src/${name}`, text: `import '${target}'` },
    ])
  expect(check('load.ts', '@deepseek-ai/cordis')).toEqual([])
  expect(check('load.ts', '@omne-harness-lite/assembly-lifecycle/cordis')).toEqual([])
  expect(check('prepare.ts', './prepared.ts')).toEqual([])
  expect(check('tree.ts', 'validate-npm-package-name')).toEqual([])
  for (const target of [
    '@deepseek-ai/cordis',
    '@omne-harness-lite/kernel-basis/cordis',
    './cordis.ts',
    './load.ts',
    './prepared.ts',
  ])
    expect(check('index.ts', target)).toHaveLength(1)
  expect(check('load.ts', '@omne-harness-lite/assembly-lifecycle/src/cordis.ts')).toHaveLength(1)
  expect(check('tree.ts', 'node:fs')).toHaveLength(1)
})
