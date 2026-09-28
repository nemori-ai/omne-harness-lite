import { expect, test } from 'vitest'
import { registryHistoryBoundary } from '../src/rules/registry-history-boundary.ts'
const entry = '@omne-harness-lite/evaluation-input-store/registry-history'
const factory = `import {createRegistryHistoryReader as create} from '${entry}'; const reader = create(deps)`
const bootstrap = 'examples/model-invocation-minimal-demo/src/bootstrap.ts'
const registry = 'packages/tools/asset-registry/src/registry.ts'
test.each([
  bootstrap,
  'examples/model-invocation-minimal-demo/tests/chain.ts',
  'packages/tools/asset-registry/tests/real.spec.ts',
  'packages/assets/evaluation-input-store/tests/history.spec.ts',
])('only trusted construction path %s admits the actual factory', path => {
  expect(registryHistoryBoundary.check([{ path, text: factory }])).toEqual([])
})
test.each([
  registry,
  'packages/model/model-request-runtime/src/index.ts',
  'packages/model/pi-ai-transport/src/index.ts',
  'apps/other/tests/chain.ts',
  'tools/probe/src/index.ts',
  'packages/assets/evaluation-input-store/src/index.ts',
])('factory is rejected in %s', path => {
  expect(registryHistoryBoundary.check([{ path, text: factory }])).not.toEqual([])
})
test.each([
  `import type {RegistryHistoryReader} from '${entry}'`,
  `import {type RegistryHistoryResult as Result} from '${entry}'`,
])('registry implementation may import the precise types: %s', text => {
  expect(registryHistoryBoundary.check([{ path: registry, text }])).toEqual([])
})
test.each([
  `import type {createRegistryHistoryReader} from '${entry}'`,
  `import type * as readers from '${entry}'`,
  `import * as readers from '${entry}'`,
  `export type {RegistryHistoryReader} from '${entry}'`,
  `export * from '${entry}'`,
  `const read = await import('${entry}')`,
  `const read = require('${entry}')`,
  `${factory}; const escaped = create`,
  `${factory}; export {create}`,
  `${factory}; ctx.provide('historyFactory', create)`,
  `${factory}; export function escape(){return create}`,
  `import {createRegistryHistoryReader} from '../../../packages/assets/evaluation-input-store/src/registry-history.ts'`,
])('even trusted paths cannot forward or hide history access: %s', text => {
  expect(registryHistoryBoundary.check([{ path: bootstrap, text }])).not.toEqual([])
})
test('TS-resolved private aliases do not bypass the public entry', () => {
  expect(
    registryHistoryBoundary.check([
      {
        path: bootstrap,
        text: "import {createRegistryHistoryReader} from 'historyAlias'",
        resolvedModules: {
          historyAlias: 'packages/assets/evaluation-input-store/src/registry-history.ts',
        },
      },
    ]),
  ).not.toEqual([])
})
