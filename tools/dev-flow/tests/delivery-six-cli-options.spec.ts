// @module-tag slow
import { spawnSync } from 'node:child_process'
import { realpathSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { ghEnv, writeGh } from './fixtures/gh.ts'

const home = realpathSync(mkdtempSync(join(tmpdir(), 'six-cli-options-'))),
  missing = join(home, 'absent.json'),
  calls = join(home, 'unexpected-gh'),
  bin = join(home, 'bin')
mkdirSync(bin)
writeGh(bin, `#!/bin/sh\ntouch '${calls}'\nexit 97\n`)
afterAll(() => rmSync(home, { recursive: true, force: true }))

const commands = [
  {
    name: 'board',
    path: 'delivery/board-cli.ts',
    args: ['delivered', '--issue', '1', '--config', missing],
    option: '--config',
    flag: '--dry-run',
  },
  {
    name: 'dispatch',
    path: 'delivery/dispatch-cli.ts',
    args: ['post', '--spec', missing, '--text', missing],
    option: '--spec',
    flag: '--dry-run',
  },
  {
    name: 'labels',
    path: 'delivery/labels-cli.ts',
    args: ['--issue', '1', '--config', missing],
    option: '--config',
    flag: '--apply',
  },
  {
    name: 'milestone',
    path: 'delivery/milestone-cli.ts',
    args: ['create', 'test', '--due', '2026-12-01', '--config', missing],
    option: '--config',
    flag: undefined,
  },
  {
    name: 'worktree',
    path: 'integration/worktree-cli.ts',
    args: ['prepare', '--issue', '1', '--tree', home, '--root', home, '--config', missing],
    option: '--config',
    flag: undefined,
  },
  {
    name: 'gate',
    path: 'integration/gate-cli.ts',
    args: ['wait', '--run', '1', '--note', missing, '--config', missing],
    option: '--config',
    flag: undefined,
  },
]

function run(path: string, args: string[]) {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL(`../src/${path}`, import.meta.url)), ...args],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        ...ghEnv(bin),
        OMNE_DELIVERY_FACTS: 'direct',
      },
      timeout: 10_000,
    },
  )
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(2)
  expect(result.stdout).toBe('')
  expect(existsSync(calls)).toBe(false)
  const error: unknown = JSON.parse(result.stderr)
  expect(error).toMatchObject({
    kind: expect.stringContaining('-error'),
    message: expect.any(String),
  })
  if (
    typeof error !== 'object' ||
    error === null ||
    !('message' in error) ||
    typeof error.message !== 'string'
  )
    throw new Error('Missing CLI error message')
  return error.message
}

describe.each(commands)('$name public option boundary', ({ path, args, option, flag }) => {
  it('preserves valid syntax through the input-file boundary, with or without --', () => {
    expect(run(path, args)).not.toContain('Usage:')
    expect(run(path, [...args, '--'])).not.toContain('Usage:')
  })
  it('rejects duplicate values before reading files or calling GitHub', () => {
    expect(run(path, [...args, option, 'other.json'])).toContain('Usage:')
  })
  it('rejects unknown options and missing values', () => {
    expect(run(path, [...args, '--unknown'])).toContain('Usage:')
    expect(run(path, [...args, option])).toContain('Usage:')
  })
  it('does not resume option parsing after --', () => {
    expect(run(path, [...args, '--', '--unknown'])).toContain('Usage:')
  })
  it('distinguishes presence flags from explicit boolean values', () => {
    if (flag === undefined) {
      expect(run(path, [...args, '--apply'])).toContain('Usage:')
    } else {
      expect(run(path, [...args, flag])).not.toContain('Usage:')
      expect(run(path, [...args, flag, flag])).toContain('Usage:')
      expect(run(path, [...args, `${flag}=false`])).toContain('Usage:')
      expect(run(path, [...args, flag, 'false'])).toContain('Usage:')
    }
  })
})

it('keeps worktree remove --force as a presence flag without running removal', () => {
  expect(
    run('integration/worktree-cli.ts', [
      'remove',
      '--tree',
      join(home, 'absent-tree'),
      '--root',
      home,
      '--force',
    ]),
  ).not.toContain('Usage:')
  expect(run('integration/worktree-cli.ts', ['remove', '--force', '--force'])).toContain('Usage:')
  expect(run('integration/worktree-cli.ts', ['remove', '--force=false'])).toContain('Usage:')
})

it('allows an option-looking milestone title only after --', () => {
  expect(
    run('delivery/milestone-cli.ts', [
      'create',
      '--due',
      '2026-12-01',
      '--config',
      missing,
      '--',
      '--draft',
    ]),
  ).not.toContain('Usage:')
})
