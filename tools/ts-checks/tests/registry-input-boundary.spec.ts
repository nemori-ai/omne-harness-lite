import { expect, test } from 'vitest'
import { registryInputBoundary } from '../src/rules/registry-input-boundary.ts'
const entry = '@omne-harness-lite/evaluation-input-store/registry-inputs'
const named = `import { createRegistryInputReader } from '${entry}'; const reader = createRegistryInputReader(deps);`
test.each([
  'packages/tools/asset-registry/src/input.ts',
  'packages/tools/asset-registry/tests/source.spec.ts',
  'examples/model-invocation-minimal-demo/src/bootstrap.ts',
  'examples/model-invocation-minimal-demo/tests/sources.spec.ts',
  'packages/assets/evaluation-input-store/tests/registry.spec.ts',
])('approved exact path %s', path => {
  expect(registryInputBoundary.check([{ path, text: named }])).toEqual([])
})
test.each([
  'packages/model/model-request-runtime/src/runtime.ts',
  'packages/model/pi-ai-transport/src/index.ts',
  'packages/tools/other/src/input.ts',
  'examples/model-invocation-minimal-demo/src/runtime.ts',
  'scripts/forward.mjs',
  'tools/some-helper/src/index.ts',
  'packages/assets/evaluation-input-store/src/index.ts',
])('unapproved path %s', path => {
  expect(registryInputBoundary.check([{ path, text: named }])).not.toEqual([])
})
test.each([
  `export { createRegistryInputReader } from '${entry}';`,
  `export * from '${entry}';`,
  `import * as readers from '${entry}';`,
  `import Reader from '${entry}';`,
  `const readers = require('${entry}');`,
  `const readers = await import('${entry}');`,
  `${named} const other = createRegistryInputReader;`,
  `${named} export { createRegistryInputReader };`,
  `${named} return createRegistryInputReader;`,
  `${named} register(createRegistryInputReader);`,
  `import { readArbitraryRoot } from '${entry}';`,
  `import { createRegistryInputReader } from '../../../assets/evaluation-input-store/src/registry-inputs.ts';`,
])('forwarding or private-path negative %s', text => {
  expect(
    registryInputBoundary.check([{ path: 'packages/tools/asset-registry/src/input.ts', text }]),
  ).not.toEqual([])
})
test('a TS-resolved alias cannot hide access, even at an approved path', () => {
  expect(
    registryInputBoundary.check([
      {
        path: 'packages/tools/asset-registry/src/input.ts',
        text: "import { createRegistryInputReader } from 'sourceAlias';",
        resolvedModules: {
          sourceAlias: 'packages/assets/evaluation-input-store/src/registry-inputs.ts',
        },
      },
    ]),
  ).not.toEqual([])
})
test('explicit type imports are permitted to the same trusted consumers', () => {
  expect(
    registryInputBoundary.check([
      {
        path: 'packages/tools/asset-registry/src/input.ts',
        text: `import type { RegistryInputResult } from '${entry}'; import { type RegistryInputRequest } from '${entry}';`,
      },
    ]),
  ).toEqual([])
})
