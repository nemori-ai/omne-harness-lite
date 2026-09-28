import { expect, test } from 'vitest'
import { evaluationPublicationBoundary } from '../src/rules/evaluation-publication-boundary.ts'
const entry = '@omne-harness-lite/evaluation-input-store/publication'
const imported = `import { publishLocalInputs, captureSessionRecipe } from '${entry}';`
test.each([
  'apps/model-request-acceptance/src/bootstrap.ts',
  'apps/model-request-acceptance/tests/bootstrap.spec.ts',
  'packages/assets/evaluation-input-store/tests/crash-worker.mjs',
  'packages/assets/evaluation-input-store/tests/source.spec.ts',
  'packages/model/model-request-runtime/tests/session-selection-fixture.ts',
])('allowed publisher %s', path => {
  expect(evaluationPublicationBoundary.check([{ path, text: imported }])).toEqual([])
})
test.each([
  'packages/model/model-request-runtime/src/runtime.ts',
  'packages/model/model-request-runtime/src/session-selection-fixture.ts',
  'packages/model/model-request-runtime/tests/unapproved-publication.ts',
  'packages/tools/asset-registry/src/index.ts',
  'apps/model-request-acceptance/src/runtime.ts',
  'apps/cli/src/bootstrap.ts',
  'scripts/forward.mjs',
])('unapproved publisher %s', path => {
  expect(evaluationPublicationBoundary.check([{ path, text: imported }])).not.toEqual([])
})
test.each([
  `export * from '${entry}';`,
  `const x = await import('${entry}');`,
  `const x = require('${entry}');`,
  "import { publishLocalInputs } from '../../../packages/assets/evaluation-input-store/src/publication.ts';",
])('forwarding or private entry is rejected: %s', text => {
  expect(
    evaluationPublicationBoundary.check([
      { path: 'apps/model-request-acceptance/src/bootstrap.ts', text },
    ]),
  ).not.toEqual([])
})
test.each([
  `export * from '${entry}';`,
  `const x = await import('${entry}');`,
  `const x = require('${entry}');`,
  "import { publishLocalInputs } from '../../../assets/evaluation-input-store/src/publication.ts';",
])('named source fixture cannot forward or use private publication: %s', text => {
  expect(
    evaluationPublicationBoundary.check([
      { path: 'packages/model/model-request-runtime/tests/session-selection-fixture.ts', text },
    ]),
  ).not.toEqual([])
})
test('an actual resolved alias cannot hide publication access', () => {
  expect(
    evaluationPublicationBoundary.check([
      {
        path: 'packages/model/model-request-runtime/src/runtime.ts',
        text: "import { publishLocalInputs } from 'publishAlias';",
        resolvedModules: {
          publishAlias: 'packages/assets/evaluation-input-store/src/publication.ts',
        },
      },
    ]),
  ).not.toEqual([])
})
