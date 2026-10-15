// @module-tag slow
// Runs the real formatting sandbox and Git hook through child processes.
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import {
  commit,
  git,
  removeTemporaries,
  repository,
  temporaryDirectory,
  write,
} from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)
const runner = fileURLToPath(new URL('../../../', import.meta.url))

it(
  'isolates the real formatting self-test from external roots without changing its subject',
  { timeout: 60_000 },
  () => {
    const subject = repository()
    const path = 'packages/demo/src/index.ts'
    write(subject, path, 'export const value={dirty:true}\n')
    commit(subject, 'external subject')
    write(subject, path, 'export const value={staged:true}\n')
    git(subject, 'add', path)
    write(subject, path, 'export const value={unstaged:true}\n')
    const snapshot = () => ({
      bytes: readFileSync(join(subject, path)),
      head: git(subject, 'rev-parse', 'HEAD'),
      index: git(subject, 'write-tree'),
      status: git(subject, 'status', '--porcelain=v1'),
    })
    const before = snapshot()
    const env = { ...process.env, OMNE_SUBJECT_ROOT: subject, OMNE_RUNNER_ROOT: runner }
    const formal = spawnSync('bash', [join(runner, 'scripts/format.sh'), 'check'], {
      env,
      encoding: 'utf8',
    })
    expect(formal.status, formal.stdout + formal.stderr).toBe(1)
    const result = spawnSync('bash', [join(runner, 'scripts/test-formatting.sh')], {
      env,
      encoding: 'utf8',
    })
    expect(result.status, result.stdout + result.stderr).toBe(0)
    expect(result.stdout).toContain(
      'Formatting scope, idempotence, staged-index, real-commit, editor-path, and hook-install tests passed.',
    )
    expect(snapshot()).toEqual(before)
  },
)

it('rejects an always-successful formatter instead of reporting an empty self-test pass', () => {
  const fake = temporaryDirectory('format-negative-')
  for (const dir of ['scripts', '.vscode', 'node_modules/oxfmt/bin'])
    mkdirSync(join(fake, dir), { recursive: true })
  for (const path of [
    'scripts/test-formatting.sh',
    'scripts/git-environment.sh',
    'scripts/format.sh',
    'scripts/pre-commit-format',
    'scripts/install-format-hook.sh',
    '.vscode/settings.json',
    '.oxfmtrc.json',
    'pnpm-workspace.yaml',
  ])
    copyFileSync(join(runner, path), join(fake, path))
  const pinned = /\n {2}oxfmt: (\S+)\n/u.exec(
    readFileSync(join(runner, 'pnpm-workspace.yaml'), 'utf8'),
  )
  writeFileSync(
    join(fake, 'node_modules/oxfmt/package.json'),
    JSON.stringify({ version: pinned?.[1] }),
  )
  writeFileSync(
    join(fake, 'node_modules/oxfmt/bin/oxfmt'),
    '#!/usr/bin/env node\nprocess.exit(0)\n',
    { mode: 0o755 },
  )
  const result = spawnSync('bash', [join(fake, 'scripts/test-formatting.sh')], { encoding: 'utf8' })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('an unformatted maintained TypeScript file passed check')
})
