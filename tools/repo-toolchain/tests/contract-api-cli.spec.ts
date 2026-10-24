// @module-tag slow
// The diff reads snapshots from temporary Git repositories, and the CLI cases start real Node subprocesses.
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BaseRevisionError,
  diffSnapshots,
  renderDiff,
  writeSnapshots,
} from '../src/declarations/contract-api.ts'
import { CONFIG, contractCheckout, setDist, write } from './fixtures/contract-api.ts'
import {
  commit,
  removeTemporaries,
  repository,
  temporaryDirectory,
} from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

const CLI = fileURLToPath(new URL('../src/declarations/api-cli.ts', import.meta.url))

const MEMBERS = {
  'packages/x/a': {
    name: '@fixture/a',
    exports: { '.': 'index.d.ts' },
    dist: { 'index.d.ts': 'export interface A {\n    a: string;\n}\n' },
  },
  'packages/x/b': {
    name: '@fixture/b',
    exports: { '.': 'index.d.ts' },
    dist: { 'index.d.ts': 'export type B = 1;\n' },
  },
}

/** A committed checkout whose snapshots match its dist. */
function committedCheckout(): { root: string; base: string } {
  const root = contractCheckout(MEMBERS, Object.keys(MEMBERS), repository())
  writeSnapshots(root, CONFIG)
  return { root, base: commit(root, 'snapshots') }
}

function setContracts(root: string, contracts: readonly string[]): void {
  write(
    root,
    CONFIG.members,
    JSON.stringify({ schemaVersion: 1, lines: [{ id: 'line', contracts }] }),
  )
}

function cli(root: string, ...args: string[]) {
  return spawnSync(process.execPath, ['--experimental-strip-types', CLI, '--root', root, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, OMNE_RUNNER_ROOT: root },
  })
}

describe('contract API diff and command', { timeout: 120_000 }, () => {
  it('classifies the working-tree snapshots against the snapshots at a base commit', () => {
    const { root, base } = committedCheckout()
    expect(diffSnapshots(root, CONFIG, base)).toMatchObject({ change: 'none', commit: base })

    setDist(root, 'packages/x/a', {
      'index.d.ts': 'export interface A {\n    a: string;\n    b?: number;\n}\n',
    })
    writeSnapshots(root, CONFIG)
    const additive = diffSnapshots(root, CONFIG, base)
    expect(additive.change).toBe('additive')
    expect(additive.members[0]).toMatchObject({
      directory: 'packages/x/a',
      status: 'compared',
      differences: [
        {
          target: { scope: 'export', entry: '.', name: 'A' },
          kind: 'changed',
          change: 'additive',
          proved: true,
        },
      ],
    })

    setDist(root, 'packages/x/b', { 'index.d.ts': 'export {};\n' })
    writeSnapshots(root, CONFIG)
    const review = diffSnapshots(root, CONFIG, base)
    expect(review.change).toBe('review')
    expect(renderDiff(review).join('\n')).toContain(
      'packages/x/b：review\n    入口 `.` · `B`：删除，review',
    )
  })

  it('does not read a gap as no change: no snapshot on either side, a dropped member, a renamed package', () => {
    const { root, base } = committedCheckout()
    // Neither side has the snapshot file.
    const bare = contractCheckout(MEMBERS, Object.keys(MEMBERS), repository())
    const bareBase = commit(bare, 'no snapshots')
    expect(diffSnapshots(bare, CONFIG, bareBase).members[0]).toMatchObject({
      status: 'compared',
      change: 'review',
      differences: [{ target: { scope: 'snapshot' }, kind: 'missing', change: 'review' }],
    })
    // b leaves the contract list and its snapshot is deleted: the base side still counts.
    setContracts(root, ['packages/x/a'])
    rmSync(join(root, 'packages/x/b/api'), { recursive: true, force: true })
    expect(diffSnapshots(root, CONFIG, base).members[1]).toMatchObject({
      directory: 'packages/x/b',
      status: 'compared',
      before: 'packages/x/b/api/b.api.md',
      change: 'review',
      differences: [{ target: { scope: 'snapshot' }, kind: 'removed', change: 'review' }],
    })
    // a is renamed: its snapshot path moves with the package name, and the rename is review.
    setContracts(root, Object.keys(MEMBERS))
    const manifest = join(root, 'packages/x/a/package.json')
    writeFileSync(
      manifest,
      readFileSync(manifest, 'utf8').replace('@fixture/a', '@fixture/renamed'),
    )
    rmSync(join(root, 'packages/x/a/api'), { recursive: true, force: true })
    writeSnapshots(root, CONFIG)
    expect(diffSnapshots(root, CONFIG, base).members[0]).toMatchObject({
      before: 'packages/x/a/api/a.api.md',
      after: 'packages/x/a/api/renamed.api.md',
      change: 'review',
      differences: [{ target: { scope: 'snapshot' }, kind: 'renamed', change: 'review' }],
    })
  })

  it('tells a base that is not a commit from a Git failure', () => {
    const { root } = committedCheckout()
    expect(() => diffSnapshots(root, CONFIG, 'no-such-ref')).toThrow(BaseRevisionError)
    const outside = temporaryDirectory('contract-api-not-git-')
    contractCheckout(MEMBERS, Object.keys(MEMBERS), outside)
    let thrown: unknown
    try {
      diffSnapshots(outside, CONFIG, 'HEAD')
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(Error)
    expect(thrown).not.toBeInstanceOf(BaseRevisionError)
    expect(thrown instanceof Error ? thrown.cause : undefined).toBeInstanceOf(Error)
  })

  it('reports a dist that differs from its snapshot and still exits 0; usage errors exit 2', () => {
    const { root } = committedCheckout()
    expect(cli(root, '--check')).toMatchObject({ status: 0 })
    setDist(root, 'packages/x/b', { 'index.d.ts': 'export type B = 2;\n' })
    const check = cli(root, '--check')
    expect(check.status).toBe(0)
    expect(check.stdout).toContain('packages/x/b：packages/x/b/api/b.api.md 与 dist 不一致，review')
    const json = JSON.parse(cli(root, '--check', '--json').stdout)
    expect(json).toMatchObject({
      members: [
        {
          directory: 'packages/x/a',
          status: 'match',
          sha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
        },
        { directory: 'packages/x/b', status: 'differs' },
      ],
    })
    expect(JSON.parse(cli(root, '--diff', 'HEAD', '--json').stdout)).toMatchObject({
      base: 'HEAD',
      change: 'none',
    })

    setDist(root, 'packages/x/b', undefined)
    expect(cli(root, '--write')).toMatchObject({ status: 1 })
    expect(cli(root, '--check', '--write')).toMatchObject({ status: 2 })
    expect(cli(root)).toMatchObject({ status: 2 })
    expect(cli(root, '--diff').stderr).toContain('--diff 要一个值')
    expect(cli(root, '--diff', 'no-such-ref')).toMatchObject({
      status: 2,
      stderr: expect.stringContaining('不是这个仓库里的提交'),
    })
  })
})
