// @module-tag slow
// Slow: every case runs the package-template CLI as a child process over a temporary git workspace (tsc and git included). File total 19.1 s on the full-admission fast-tier ledger, 56.1 s under load; 2 of its 13 cases are over the 2.5 s per-case budget on the admission run, all 13 under load, and one reached 6 s under load against the 5 s timeout (tools/test-runner/README_ZH.md「归层」).
import { afterEach, expect, it } from 'vitest'
import { spawnSync, execFileSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const cli = join(repo, 'tools/dev-flow/src/package-template/cli.ts')
const roots: string[] = []
/** Nodes that template 3.0.0 generates and versions 2.0.0 and 1.0.0 did not. */
const SKELETON_ONLY = [
  'index.md',
  'SPEC.md',
  'docs',
  'schema',
  'verification',
  'adr',
  'examples',
  'resources',
  'acceptance',
  'src/README.md',
  'src/index.md',
  'tests/README.md',
  'tests/index.md',
  'tests/fixtures',
]
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function fixture() {
  // native: on Windows tmpdir() may be an 8.3 short name that the JS realpath keeps, while Git
  // reports the long name and the installed repo-toolchain compares the two literally.
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'omne-template-cli-')))
  roots.push(root)
  mkdirSync(join(root, 'packages'))
  mkdirSync(join(root, 'docs/architecture'), { recursive: true })
  writeFileSync(join(root, 'docs/architecture/policy.md'), '# Fixture policy\n')
  writeFileSync(
    join(root, 'docs/architecture/constraints.json'),
    JSON.stringify({
      schemaVersion: 2,
      domains: [],
      roles: [],
      rules: [{ id: 'IC-4', source: 'docs/architecture/policy.md' }],
    }),
  )
  // 根 tsconfig.base.json 只是指向共享预设的 extends；隔离工作区里直接放预设本身。
  cpSync(join(repo, 'tools/repo-config/tsconfig.base.json'), join(root, 'tsconfig.base.json'))
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
  mkdirSync(join(root, member, 'tests'), { recursive: true })
  writeFileSync(join(root, member, 'tests/value.spec.ts'), 'export {}\n')
  const manifestPath = join(root, member, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.omneHarness = {
    packageTemplate: { id: 'typescript-package', version: '3.0.0', variant: 'module' },
  }
  writeFileSync(manifestPath, JSON.stringify(manifest))
  const clean = run(root, ['scan', '--member', member, '--check', '--json'])
  expect(clean.stderr).toBe('')
  // A full tree assertion does not resolve this fixture's unknown architectural role.
  expect(clean.status).toBe(0)
  expect(JSON.parse(clean.stdout).packages[0].structure).toBe('pass')
  expect(JSON.parse(clean.stdout).packages[0].integration).toBe('unknown')
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
it.each([
  'manifest-link',
  'manifest-directory',
  'manifest-missing',
  'member-link',
  'member-file',
  'group-link',
  'group-file',
  'root-link',
])(
  'rejects %s during real all-package discovery instead of reporting an empty successful inventory',
  kind => {
    const root = fixture()
    expect(
      run(root, ['create', '--group', 'util', '--name', 'sample', '--variant', 'module', '--write'])
        .status,
    ).toBe(0)
    const member = 'packages/util/sample'
    const node = kind.startsWith('manifest')
      ? `${member}/package.json`
      : kind.startsWith('member')
        ? member
        : kind.startsWith('group')
          ? 'packages/util'
          : 'packages'
    const target = join(root, 'outside')
    if (kind === 'manifest-link') writeFileSync(target, readFileSync(join(root, node)))
    else mkdirSync(target)
    rmSync(join(root, node), { recursive: true, force: true })
    if (kind.endsWith('link')) symlinkSync(target, join(root, node))
    else if (kind === 'manifest-directory') mkdirSync(join(root, node))
    else if (kind.endsWith('file')) writeFileSync(join(root, node), 'Invalid directory node\n')
    for (const selection of [[], ['--member', member]]) {
      const result = run(root, ['scan', '--check', '--json', ...selection])
      expect(result.status).toBe(2)
      expect(result.stderr).toMatch(/product discovery/u)
      expect(result.stdout).toBe('')
    }
  },
  20_000,
)

it('previews, writes and checks domain drafts through the real CLI', () => {
  const root = fixture()
  const preview = run(root, ['create-domain', '--group', 'sample'])
  expect(preview.status).toBe(0)
  expect(JSON.parse(preview.stdout)).toMatchObject({
    written: false,
    files: ['README.md', 'documentation.json'],
  })
  expect(run(root, ['create-domain', '--group', 'sample', '--write']).status).toBe(0)
  const draft = run(root, ['scan', '--group', 'sample', '--check', '--json'])
  expect(draft.status).toBe(1)
  expect(
    JSON.parse(draft.stdout).domains[0].findings.some(
      (item: { code: string }) => item.code === 'draft',
    ),
  ).toBe(true)
  const all = run(root, ['scan', '--json'])
  expect(all.status).toBe(0)
  expect(JSON.parse(all.stdout).packages).toEqual([])
  expect(JSON.parse(all.stdout).domains[0].structure).toBe('fail')
  writeFileSync(
    join(root, 'packages/sample/README.md'),
    '# Completed group\n\nActual group responsibilities.\n',
  )
  expect(run(root, ['scan', '--group', 'sample', '--check']).status).toBe(0)
  expect(run(root, ['create-domain', '--group', 'sample', '--write']).status).toBe(2)
  expect(run(root, ['create-domain', '--group', '../escape', '--write']).status).toBe(2)
  expect(
    run(root, ['scan', '--group', 'sample', '--member', 'packages/sample/member']).status,
  ).toBe(2)
  rmSync(join(root, 'packages/sample/documentation.json'))
  expect(run(root, ['scan', '--group', 'sample', '--check']).status).toBe(1)
}, 20_000)

it.each(['1.0.0', '2.0.0'])(
  'keeps the exact %s package marker and reports older through the real CLI',
  version => {
    const root = fixture()
    const create = ['create', '--group', 'util', '--name', 'old', '--variant', 'module']
    expect(run(root, [...create, '--write']).status).toBe(0)
    const member = 'packages/util/old'
    for (const file of ['README.md', 'README_ZH.md'])
      writeFileSync(
        join(root, member, file),
        '# Value\n\nThis fixture exports the constant value 1.\n',
      )
    writeFileSync(join(root, member, 'src/index.ts'), 'export const value = 1\n')
    mkdirSync(join(root, member, 'tests'), { recursive: true })
    writeFileSync(
      join(root, member, 'tests/value.spec.ts'),
      "import { expect, it } from 'vitest'\nimport { value } from '../src/index.ts'\nit('exports one', () => expect(value).toBe(1))\n",
    )
    for (const path of SKELETON_ONLY)
      rmSync(join(root, member, path), { recursive: true, force: true })
    if (version === '1.0.0') rmSync(join(root, member, 'documentation.json'))
    const manifestPath = join(root, member, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest.omneHarness = {
      packageTemplate: { id: 'typescript-package', version, variant: 'module' },
    }
    writeFileSync(manifestPath, JSON.stringify(manifest))
    const before = readFileSync(manifestPath)
    const inventory = run(root, ['scan', '--member', member, '--json'])
    expect(inventory.status).toBe(0)
    expect(JSON.parse(inventory.stdout).packages[0]).toMatchObject({
      adoption: 'older',
      structure: 'pass',
    })
    expect(run(root, ['scan', '--member', member, '--check']).status).toBe(1)
    expect(run(root, create).status).toBe(2)
    expect(run(root, [...create, '--write']).status).toBe(2)
    expect(readFileSync(manifestPath)).toEqual(before)
  },
  20_000,
)
