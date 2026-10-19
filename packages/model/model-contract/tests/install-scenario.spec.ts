// @module-tag slow
// Runs the facility's scenario step in hand-built consumer directories: node starts as a child
// process. The script must run with the consumer directory as its working directory and without
// any inherited module path, and its exit status decides the check.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, expect, it } from 'vitest'
import { runScenario, type Report } from './install/consumer.ts'
import { requiredCheckIds } from './install/judgment.ts'

const packageDirectory = fileURLToPath(new URL('..', import.meta.url))
const workspaceRoot = join(packageDirectory, '..', '..', '..')
const workDirectory = join(workspaceRoot, 'tmp/install-closure/model-contract-scenario-spec')
const root = realpathSync(mkdtempSync(join(tmpdir(), 'install-scenario-')))
afterAll(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(workDirectory, { recursive: true, force: true })
})

function layout(name: string, script: string): { project: string; script: string } {
  const project = join(root, name, 'project')
  mkdirSync(join(project, 'node_modules/inner'), { recursive: true })
  writeFileSync(join(project, 'package.json'), '{"name":"consumer","private":true,"type":"module"}')
  writeFileSync(
    join(project, 'node_modules/inner/package.json'),
    '{"name":"inner","version":"1.0.0","type":"module","exports":{".":{"import":"./index.js"}}}',
  )
  writeFileSync(join(project, 'node_modules/inner/index.js'), 'export const answer = 42\n')
  const file = join(root, name, 'scenario.mjs')
  writeFileSync(file, script)
  return { project, script: file }
}

it('passes a scenario that imports an installed package from the consumer directory', () => {
  const { project, script } = layout(
    'ok',
    "import { answer } from 'inner'\nconsole.log(`answer=${answer} cwd=${process.cwd()}`)\n",
  )
  const { check, scenario } = runScenario(project, script)
  expect(check).toMatchObject({ id: 'scenario-run', ok: true })
  expect(check.detail).toContain('answer=42')
  expect(scenario).toEqual({ script, output: expect.stringContaining(`cwd=${project}`) })
})

it('fails a scenario that exits non-zero and keeps the tail of its output', () => {
  const { project, script } = layout(
    'fails',
    "console.log('step one')\nconsole.error('step two broke')\nprocess.exit(3)\n",
  )
  const { check, scenario } = runScenario(project, script)
  expect(check.ok).toBe(false)
  expect(check.detail).toContain('exit 3')
  expect(check.detail).toContain('step two broke')
  expect(scenario.output).toContain('step one')
})

it('fails a scenario that imports something the consumer does not have', () => {
  const { project, script } = layout('missing', "await import('not-installed')\n")
  expect(runScenario(project, script).check.ok).toBe(false)
})

it('requires the scenario check only when a scenario was given', () => {
  expect(requiredCheckIds(['m'])).not.toContain('scenario-run')
  expect(requiredCheckIds(['m'], { scenario: true })).toContain('scenario-run')
})

it('lets a scenario import a closure member that is not the target', () => {
  const script = join(root, 'closure-member.mjs')
  writeFileSync(
    script,
    [
      "import { tenant, accountCodec } from '@omne-harness/legal-identity'",
      "import { MODEL_SEND } from '@omne-harness/model-contract'",
      'console.log(`imported ${typeof tenant} ${typeof accountCodec.parse} ${MODEL_SEND}`)',
      '',
    ].join('\n'),
  )
  // The vitest bin shim sets NODE_PATH, and a developer shell may allow the network.
  const { NODE_PATH: _path, OMNE_INSTALL_ALLOW_NETWORK: _network, ...environment } = process.env
  const run = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      join(packageDirectory, 'tests/install/cli.ts'),
      '--member',
      packageDirectory,
      '--work-dir',
      workDirectory,
      '--scenario',
      script,
    ],
    { encoding: 'utf8', env: environment },
  )
  const report = JSON.parse(run.stdout) as Report
  expect(report.checks.filter(check => !check.ok)).toEqual([])
  expect(report.checks.find(check => check.id === 'scenario-run')?.detail).toContain('imported')
  const manifest = JSON.parse(
    readFileSync(join(workDirectory, 'project/package.json'), 'utf8'),
  ) as {
    dependencies: Record<string, string>
  }
  expect(Object.keys(manifest.dependencies).sort()).toEqual([...report.closure.workspace].sort())
  expect(run.status).toBe(0)
})
