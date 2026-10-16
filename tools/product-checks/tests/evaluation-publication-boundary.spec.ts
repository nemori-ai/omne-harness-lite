import { expect, test } from 'vitest'
import { evaluationPublicationBoundary } from '../src/rules/evaluation-publication-boundary.ts'
const entry = '@omne-harness/evaluation-input-store/publication'
const imported = `import { publishLocalInputs, captureSessionRecipe } from '${entry}';`
test.each([
  'apps/cli/src/session-factory-assets.ts',
  'examples/model-invocation-minimal-demo/src/bootstrap.ts',
  'examples/model-invocation-minimal-demo/tests/bootstrap.spec.ts',
  'packages/assets/evaluation-input-store/tests/crash-worker.mjs',
  'packages/assets/evaluation-input-store/tests/source.spec.ts',
  'packages/model/model-request-runtime-local/tests/session-selection-fixture.ts',
  'packages/agent-loop/loop-extension-runner-local/tests/runner-chain-support.ts',
])('allowed publisher %s', path => {
  expect(evaluationPublicationBoundary.check([{ path, text: imported }])).toEqual([])
})
test.each([
  'apps/cli/src/entry-providers.ts',
  'apps/cli/src/session-runtime-root.ts',
  'packages/model/model-request-runtime-local/src/runtime.ts',
  'packages/agent-loop/loop-extension-runner-local/src/runner-chain.ts',
  'packages/agent-loop/loop-extension-runner-local/tests/unapproved-publication.ts',
  'packages/model/model-request-runtime-local/src/session-selection-fixture.ts',
  'packages/model/model-request-runtime-local/tests/unapproved-publication.ts',
  'packages/tools/asset-registry-local/src/index.ts',
  'examples/model-invocation-minimal-demo/src/runtime.ts',
  'apps/model-request-acceptance/src/bootstrap.ts',
  'examples/unrelated/tests/test.ts',
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
      { path: 'examples/model-invocation-minimal-demo/src/bootstrap.ts', text },
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
      {
        path: 'packages/model/model-request-runtime-local/tests/session-selection-fixture.ts',
        text,
      },
    ]),
  ).not.toEqual([])
})
test('an actual resolved alias cannot hide publication access', () => {
  expect(
    evaluationPublicationBoundary.check([
      {
        path: 'packages/model/model-request-runtime-local/src/runtime.ts',
        text: "import { publishLocalInputs } from 'publishAlias';",
        resolvedModules: {
          publishAlias: 'packages/assets/evaluation-input-store/src/publication.ts',
        },
      },
    ]),
  ).not.toEqual([])
})

test.each([
  `export * from '${entry}';`,
  `const x = await import('${entry}');`,
  `const x = require('${entry}');`,
  "import { publishLocalInputs } from '../../../assets/evaluation-input-store/src/publication.ts';",
])('runner source fixture cannot forward or use private publication: %s', text => {
  expect(
    evaluationPublicationBoundary.check([
      {
        path: 'packages/agent-loop/loop-extension-runner-local/tests/runner-chain-support.ts',
        text,
      },
    ]),
  ).not.toEqual([])
})

const admitted = '@omne-harness/evaluation-input-store/admitted'
test('only the actual application bootstrap can construct an admitted source through its public entry', () => {
  expect(
    evaluationPublicationBoundary.check([
      {
        path: 'apps/cli/src/session-bootstrap.ts',
        text: `import { createAdmittedEvaluationInputSource } from '${admitted}';`,
      },
    ]),
  ).toEqual([])
  for (const path of [
    'apps/cli/src/main.ts',
    'apps/cli/tests/unapproved.spec.ts',
    'packages/model/model-request-runtime-local/src/runtime.ts',
  ])
    expect(
      evaluationPublicationBoundary.check([
        { path, text: `import { createAdmittedEvaluationInputSource } from '${admitted}';` },
      ]),
    ).not.toEqual([])
})
test('the actual composed bootstrap fixture can publish source data', () => {
  expect(
    evaluationPublicationBoundary.check([
      { path: 'apps/cli/tests/session-bootstrap.spec.ts', text: imported },
    ]),
  ).toEqual([])
})
test.each([
  `export * from '${admitted}';`,
  `const source = await import('${admitted}');`,
  `const source = require('${admitted}');`,
  "import { createAdmittedEvaluationInputSource } from '../../../packages/assets/evaluation-input-store/src/admitted.ts';",
])('admitted source forwarding and private imports fail: %s', text => {
  expect(
    evaluationPublicationBoundary.check([{ path: 'apps/cli/src/session-bootstrap.ts', text }]),
  ).not.toEqual([])
})
test('resolved aliases cannot hide admitted source access', () => {
  expect(
    evaluationPublicationBoundary.check([
      {
        path: 'apps/cli/src/main.ts',
        text: "import { createAdmittedEvaluationInputSource } from 'sourceAlias';",
        resolvedModules: { sourceAlias: 'packages/assets/evaluation-input-store/src/admitted.ts' },
      },
    ]),
  ).not.toEqual([])
})
