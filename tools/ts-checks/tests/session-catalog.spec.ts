import { expect, it } from 'vitest'
import { sessionCatalogBoundary } from '../src/rules/session-catalog.ts'
import { REPOSITORY_RULES } from '../src/repository.ts'

const entry = '@omne-harness-lite/session-tenancy-table/maintenance'
const bootstrap = 'examples/model-invocation-minimal-demo/src/bootstrap.ts'
const use = `import { readSessionCatalogIn as read } from '${entry}'; await storage.read(tx => read(tx));`
it('checks the exact owner and provider test paths', () => {
  expect(REPOSITORY_RULES).toContain(sessionCatalogBoundary)
  for (const path of [bootstrap, 'packages/session/session-tenancy-table/tests/catalog.spec.ts'])
    expect(sessionCatalogBoundary.check([{ path, text: use }])).toEqual([])
  for (const path of [
    'examples/model-invocation-minimal-demo/src/tool.ts',
    'packages/session/session-tenancy-table/src/index.ts',
    'packages/session/session-tenancy-table/src/seed.ts',
    'packages/session/session-tenancy-table/src/cordis.ts',
    'apps/unrelated/tests/catalog.spec.ts',
  ])
    expect(sessionCatalogBoundary.check([{ path, text: use }])).not.toEqual([])
})
it.each([
  `export * from '${entry}';`,
  `export { readSessionCatalogIn } from '${entry}';`,
  `import * as all from '${entry}'; all.readSessionCatalogIn(tx);`,
  `import read from '${entry}'; read(tx);`,
  `import { otherOperation } from '${entry}'; otherOperation(tx);`,
  `const read = await import('${entry}');`,
  `const read = require('${entry}');`,
  `${use} export { read };`,
  `${use} const alias = read;`,
  `${use} function escape() { return read }`,
  `${use} ctx.provide('catalog', read);`,
  `${use} await import(opaquePath);`,
])('rejects forwarding or hidden loading from an approved file: %s', text => {
  expect(sessionCatalogBoundary.check([{ path: bootstrap, text }])).not.toEqual([])
})
it('rejects private relative paths and a resolved alias', () => {
  expect(
    sessionCatalogBoundary.check([
      {
        path: bootstrap,
        text: "import { readSessionCatalogIn } from '../../../packages/session/session-tenancy-table/src/maintenance.ts';",
      },
    ]),
  ).not.toEqual([])
  expect(
    sessionCatalogBoundary.check([
      {
        path: bootstrap,
        text: "import { readSessionCatalogIn } from '@alias/catalog';",
        resolvedModules: {
          '@alias/catalog': 'packages/session/session-tenancy-table/src/maintenance.ts',
        },
      },
    ]),
  ).not.toEqual([])
})
