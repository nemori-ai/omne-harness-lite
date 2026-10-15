import { execFileSync, spawnSync } from 'node:child_process'
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
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
// TypeScript 7 declares package exports without `./bin/tsc`; locate the bin from its manifest.
const tsc = join(dirname(require.resolve('typescript/package.json')), 'bin/tsc')

export interface IsolatedWorkspace {
  readonly root: string
  build(group: string, name: string): void
  typecheck(group: string, name: string): void
  dispose(): void
}

export function isolatedProductWorkspace(): IsolatedWorkspace {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'omne-package-template-'))
  cpSync(join(repoRoot, 'tsconfig.base.json'), join(root, 'tsconfig.base.json'))
  cpSync(join(repoRoot, 'vitest.tiers.mts'), join(root, 'vitest.tiers.mts'))
  const host: unknown = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
  const engines = hostNode(host)
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*/*\n')
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ private: true, engines: { node: engines } }),
  )
  const types = dirname(require.resolve('@types/node/package.json'))
  mkdirSync(join(root, 'node_modules/@types'), { recursive: true })
  symlinkSync(types, join(root, 'node_modules/@types/node'), 'dir')
  const vitest = dirname(require.resolve('vitest/package.json'))
  symlinkSync(vitest, join(root, 'node_modules/vitest'), 'dir')
  git(root, ['init', '-q'])
  git(root, ['symbolic-ref', 'HEAD', 'refs/heads/main'])
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '-m', 'isolated workspace'])
  const run = (config: string, group: string, name: string): void => {
    const result = spawnSync(process.execPath, [tsc, '-p', config], {
      cwd: join(root, 'packages', group, name),
      encoding: 'utf8',
    })
    if (result.status !== 0)
      throw new Error(result.stderr || result.stdout || `tsc -p ${config} failed`)
  }
  return {
    root,
    build: (group, name) => run('tsconfig.build.json', group, name),
    typecheck: (group, name) => run('tsconfig.test.json', group, name),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  }
}

function hostNode(value: unknown): string {
  if (typeof value !== 'object' || value === null || !('engines' in value))
    throw new Error('Host package.json must declare engines.node')
  const engines = value.engines
  if (typeof engines !== 'object' || engines === null || !('node' in engines))
    throw new Error('Host package.json must declare engines.node')
  if (typeof engines.node !== 'string')
    throw new Error('Host package.json must declare engines.node')
  return engines.node
}

function git(root: string, args: readonly string[]): void {
  execFileSync(
    'git',
    ['-c', 'user.name=someone', '-c', 'user.email=someone@example.com', ...args],
    {
      cwd: root,
      stdio: 'pipe',
    },
  )
}
