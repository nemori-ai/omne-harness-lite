import { join } from 'node:path'
import { expect, it } from 'vitest'
import { pinnedNode, ROOT, settingOf } from '../src/setting.ts'

it('finds the root of the repository and the Node version it pins', () => {
  expect(pinnedNode(ROOT)).toMatch(/^\d+\.\d+\.\d+$/)
  expect(() => pinnedNode(join(ROOT, 'benchmarks'))).toThrow('pins no Node version')
})

it('keeps results and data under the ignored tmp of the checkout, and baselines beside the suites', () => {
  expect(settingOf(ROOT, [])).toMatchObject({
    root: ROOT,
    baselines: join(ROOT, 'benchmarks', 'baselines'),
    results: join(ROOT, 'tmp', 'perf', 'results'),
    scratch: join(ROOT, 'tmp', 'perf', 'data'),
    pinnedNode: pinnedNode(ROOT),
  })
})
