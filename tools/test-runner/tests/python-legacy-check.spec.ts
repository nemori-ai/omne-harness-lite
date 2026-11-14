import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, inject, it, vi } from 'vitest'
import { pythonStep, type PlanFile } from '../src/testing/steps.ts'
import { planCheck } from '../src/testing/scope.ts'

declare module 'vitest' {
  export interface ProvidedContext {
    pythonToolingRoot: string
  }
}

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
const repository = fileURLToPath(new URL('../../../', import.meta.url))
function put(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

it.each(['local', 'runner'])(
  'the %s Python step prunes archive conftest and tests but reports active failure',
  mode => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-python-legacy-')))
    roots.push(root)
    put(root, 'package.json', readFileSync(join(repository, 'package.json'), 'utf8'))
    put(
      root,
      'scripts/with-test-slot.sh',
      '#!/usr/bin/env bash\nOMNE_TEST_SLOT_HELD=stub exec "$@"\n',
    )
    chmodSync(join(root, 'scripts/with-test-slot.sh'), 0o755)
    put(root, 'pytest.ini', '[pytest]\ntestpaths = tools/spec-tools/tests\n')
    for (const path of ['tools/spec-tools/tests', '.meta_harness/tooling/tests'])
      mkdirSync(join(root, path), { recursive: true })
    put(root, 'tools/spec-tools/tests/test_live.py', 'def test_live():\n    assert True\n')
    put(
      root,
      'tools/spec-tools/tests/generated/old.legacy/conftest.py',
      'raise RuntimeError("archived conftest executed")\n',
    )
    put(
      root,
      'tools/spec-tools/tests/generated/old.legacy/test_poison.py',
      'raise RuntimeError("archived test executed")\n',
    )
    const file: PlanFile = {
      head: '',
      dirty: false,
      base: { ref: '', mergeBase: '' },
      plan: planCheck(
        [],
        [],
        {
          excludeRoots: [],
          globalPaths: [],
          readers: [],
          memberDocuments: [],
          pythonPaths: [],
          residentPaths: [],
          residentBuild: [],
        },
        new Set(),
        true,
      ),
    }
    expect(process.env['OMNE_SUBJECT_ROOT']).toBeUndefined()
    expect(process.env['OMNE_RUNNER_ROOT']).toBeUndefined()
    const pythonToolingRoot = inject('pythonToolingRoot')
    const names = [
      'OMNE_RUNNER_ROOT',
      'UV_PROJECT',
      'UV_PROJECT_ENVIRONMENT',
      'UV_NO_SYNC',
      'PYTEST_ADDOPTS',
    ]
    const before = names.map(name => process.env[name])
    try {
      if (mode === 'runner') process.env['OMNE_RUNNER_ROOT'] = pythonToolingRoot
      else delete process.env['OMNE_RUNNER_ROOT']
      process.env['UV_PROJECT'] = pythonToolingRoot
      process.env['UV_PROJECT_ENVIRONMENT'] = join(pythonToolingRoot, '.venv')
      process.env['UV_NO_SYNC'] = '1'
      process.env['PYTEST_ADDOPTS'] = `--confcutdir='${root}'`
      expect(pythonStep(root, file)).toBe(0)
      put(
        root,
        'tools/spec-tools/tests/current.legacy-not/test_poison.py',
        'def test_bad():\n    assert False, "active test failed"\n',
      )
      expect(pythonStep(root, file)).not.toBe(0)
    } finally {
      names.forEach((name, index) => {
        const value = before[index]
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      })
    }
    expect(names.map(name => process.env[name])).toEqual(before)
  },
  20_000,
)

it('the Python step passes xdist settings to the child only and leaves process.env alone', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-python-env-')))
  roots.push(root)
  const file = { plan: { python: { run: true, reason: 'test' } } } as unknown as PlanFile
  const before = process.env['PYTEST_XDIST_AUTO_NUM_WORKERS']
  const runner = process.env['OMNE_RUNNER_ROOT']
  try {
    delete process.env['PYTEST_XDIST_AUTO_NUM_WORKERS']
    delete process.env['OMNE_RUNNER_ROOT']
    pythonStep(root, file)
    expect(process.env['PYTEST_XDIST_AUTO_NUM_WORKERS']).toBeUndefined()
  } finally {
    if (before === undefined) delete process.env['PYTEST_XDIST_AUTO_NUM_WORKERS']
    else process.env['PYTEST_XDIST_AUTO_NUM_WORKERS'] = before
    if (runner !== undefined) process.env['OMNE_RUNNER_ROOT'] = runner
  }
})

it('the runner Python step collects the spec-tools and tooling test directories and nothing else', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-python-paths-')))
  roots.push(root)
  put(root, 'pytest.ini', '[pytest]\ntestpaths = tools/spec-tools/tests\n')
  put(root, 'tools/spec-tools/tests/test_live.py', 'def test_live():\n    assert True\n')
  put(root, '.meta_harness/tooling/tests/test_tooling.py', 'def test_tooling():\n    assert True\n')
  const file: PlanFile = { plan: { python: { run: true, reason: 'test' } } } as unknown as PlanFile
  const pythonToolingRoot = inject('pythonToolingRoot')
  const failing = 'def test_bad():\n    assert False, "must not be collected or must fail"\n'
  vi.stubEnv('OMNE_RUNNER_ROOT', pythonToolingRoot)
  vi.stubEnv('UV_PROJECT', pythonToolingRoot)
  vi.stubEnv('UV_PROJECT_ENVIRONMENT', join(pythonToolingRoot, '.venv'))
  vi.stubEnv('UV_NO_SYNC', '1')
  vi.stubEnv('PYTEST_ADDOPTS', `--confcutdir='${root}'`)
  try {
    expect(pythonStep(root, file)).toBe(0)
    put(root, 'elsewhere/test_stray.py', failing)
    expect(pythonStep(root, file)).toBe(0)
    put(root, '.meta_harness/tooling/tests/test_bad.py', failing)
    expect(pythonStep(root, file)).not.toBe(0)
  } finally {
    vi.unstubAllEnvs()
  }
}, 60_000)
