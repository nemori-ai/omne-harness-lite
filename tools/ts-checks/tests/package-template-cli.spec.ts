import { afterEach, expect, it } from 'vitest'
import { spawnSync, execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const cli = join(repo, 'tools/ts-checks/src/package-template/cli.ts')
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'omne-template-cli-'))
  roots.push(root)
  mkdirSync(join(root, 'packages'))
  mkdirSync(join(root, '.meta_harness/design/architecture'), { recursive: true })
  cpSync(
    join(repo, '.meta_harness/design/architecture/constraints.json'),
    join(root, '.meta_harness/design/architecture/constraints.json'),
  )
  cpSync(join(repo, 'tsconfig.base.json'), join(root, 'tsconfig.base.json'))
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*/*\n')
  writeFileSync(join(root, 'package.json'), JSON.stringify({ engines: { node: '>=24 <25' } }))
  execFileSync('git', ['init', '-q', root])
  execFileSync('git', ['-C', root, 'add', '.'])
  execFileSync('git', [
    '-C',
    root,
    '-c',
    'user.name=Test fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '-qm',
    'Fixture\n\nHarness: codex\nAgent-Role: main',
  ])
  return root
}
function run(root: string, args: string[]) {
  return spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args, '--root', root], {
    encoding: 'utf8',
    timeout: 15_000,
  })
}
it('runs real preview/write/scan paths and rejects a Cordis leak despite a current marker', () => {
  const root = fixture(),
    create = ['create', '--group', 'util', '--name', 'sample', '--variant', 'module']
  const preview = run(root, create)
  expect(preview.status).toBe(0)
  expect(JSON.parse(preview.stdout).written).toBe(false)
  expect(run(root, [...create, '--write']).status).toBe(0)
  const member = 'packages/util/sample'
  for (const file of ['README.md', 'README_ZH.md', 'src/index.ts'])
    writeFileSync(
      join(root, member, file),
      file.endsWith('.ts') ? 'export const example = 1\n' : '# Completed fixture\n',
    )
  const clean = run(root, ['scan', '--member', member, '--check', '--json'])
  expect(clean.stderr).toBe('')
  expect(clean.status).toBe(0)
  expect(JSON.parse(clean.stdout).packages).toHaveLength(1)
  const before = readFileSync(join(root, member, 'package.json'))
  writeFileSync(
    join(root, member, 'src/index.ts'),
    "export { Context } from '@deepseek-ai/cordis'\n",
  )
  const leak = run(root, ['scan', '--member', member, '--check', '--json'])
  expect(leak.status).toBe(1)
  expect(
    JSON.parse(leak.stdout).packages[0].findings.some(
      (finding: { code: string }) => finding.code === 'IC-4',
    ),
  ).toBe(true)
  expect(readFileSync(join(root, member, 'package.json'))).toEqual(before)
  expect(run(root, ['scan', '--member', member, '--json']).status).toBe(0)
}, 20_000)
it('reports malformed options and unknown members with no successful check', () => {
  const root = fixture()
  expect(run(root, ['create', '--name', 'sample', '--name', 'again']).status).toBe(2)
  expect(run(root, ['scan', '--member', 'packages/util/missing', '--check']).status).toBe(2)
  expect(run(root, ['scan', '--write']).status).toBe(2)
  expect(run(root, ['scan', '--json']).status).toBe(0)
})
