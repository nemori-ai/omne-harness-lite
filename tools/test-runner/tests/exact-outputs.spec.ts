/**
 * @module-tag slow
 * Slow: runs real turbo builds on a temporary workspace. A build that turbo restores from its cache
 * leaves in `dist/` only the files the cache holds.
 */
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { TestMember } from '@omne-harness/repo-toolchain/core/workspace'
import { runTurboTests, type MemberSchedule } from '../src/testing/run.ts'
import { localPool } from '../src/testing/token-pool.ts'
import { turboBuild, turboBuildCaptured } from '../src/testing/turbo.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const MEMBER = 'members/alpha'
const NAME = '@fixture/alpha'
// The member script does not clean its output: whatever leaves `dist/` in these cases, the runner removed.
const BUILD = `node -e "const fs=require('node:fs');fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/index.js','built')"`
const TEST = `node -e "process.exit(0)"`

function workspace(): string {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'omne-exact-outputs-')))
  roots.push(root)
  const put = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  put(
    'package.json',
    '{ "name": "fixture-root", "private": true, "packageManager": "pnpm@12.18.0" }\n',
  )
  put('pnpm-workspace.yaml', 'packages:\n  - members/*\n')
  // As in the repository, outputs are not inputs: a file left in `dist/` must not change the task's key.
  put('.gitignore', 'dist\n.turbo\nrun-*\n')
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  put(
    `${MEMBER}/package.json`,
    JSON.stringify({ name: NAME, scripts: { build: BUILD, 'test:fast': TEST } }),
  )
  return root
}

const has = (root: string, file: string) => existsSync(join(root, MEMBER, 'dist', file))
const leaveStale = (root: string) =>
  writeFileSync(join(root, MEMBER, 'dist', 'old-layout.js'), 'old')
const summaries = (root: string) =>
  existsSync(join(root, '.turbo/runs')) ? readdirSync(join(root, '.turbo/runs')) : []

const HIT = '1 cached, 1 total'

// The first runs miss: turbo starts the script through pnpm, which writes its lockfile into the
// fixture, and the lockfile is part of every task key. Build until the cache answers.
function warmed(root: string): void {
  let output = ''
  for (let round = 0; round < 4 && !output.includes(HIT); round += 1)
    output = turboBuildCaptured(root, [NAME], false, 1).output
  expect(output).toContain(HIT)
  expect(has(root, 'index.js')).toBe(true)
}

describe('the runner leaves exact outputs after its own turbo runs', { timeout: 120_000 }, () => {
  it('a captured build restored from the cache drops the file an earlier layout left, and leaves no summary behind', () => {
    const root = workspace()
    warmed(root)
    leaveStale(root)
    const again = turboBuildCaptured(root, [NAME], false, 1)
    expect(again.status, again.output).toBe(0)
    expect(again.output).toContain(HIT)
    expect([has(root, 'index.js'), has(root, 'old-layout.js')]).toEqual([true, false])
    expect(summaries(root)).toEqual([])
  })

  it('the build of the check does the same', () => {
    const root = workspace()
    warmed(root)
    leaveStale(root)
    expect(turboBuild(root, [NAME], false, 1)).toBe(0)
    expect([has(root, 'index.js'), has(root, 'old-layout.js')]).toEqual([true, false])
  })

  it('the build a test run starts does the same', async () => {
    const root = workspace()
    warmed(root)
    leaveStale(root)
    const targets: TestMember[] = [{ path: MEMBER, name: NAME, script: TEST, dependencies: [] }]
    const schedule: MemberSchedule = {
      source: localPool(1),
      demand: () => ({ want: 1, min: 1, perWorker: 1, weightSource: 'default' }),
    }
    const runDir = mkdtempSync(join(root, 'run-'))
    const build = { build: true, admission: false }
    await runTurboTests(root, targets, runDir, schedule, 'fast', build, () => {})
    expect([has(root, 'index.js'), has(root, 'old-layout.js')]).toEqual([true, false])
  })

  it('an admission build does not read the cache: the member script ran and owns its output, so nothing is removed', () => {
    const root = workspace()
    warmed(root)
    leaveStale(root)
    const again = turboBuildCaptured(root, [NAME], true, 1)
    expect(again.status, again.output).toBe(0)
    expect(again.output).toContain('0 cached, 1 total')
    expect([has(root, 'index.js'), has(root, 'old-layout.js')]).toEqual([true, true])
  })
})
