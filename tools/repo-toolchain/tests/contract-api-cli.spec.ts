// @module-tag slow
// The diff reads snapshots from temporary Git repositories, and the CLI cases start real Node subprocesses.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { diffSnapshots, renderDiff, writeSnapshots } from '../src/declarations/contract-api.ts'
import { CONFIG, contractCheckout, setDist } from './fixtures/contract-api.ts'
import { commit, removeTemporaries, repository } from './fixtures/loop-canary/repository.ts'

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
    expect(diffSnapshots(root, CONFIG, base)).toMatchObject({ change: 'none' })

    setDist(root, 'packages/x/a', {
      'index.d.ts': 'export interface A {\n    a: string;\n    b?: number;\n}\n',
    })
    writeSnapshots(root, CONFIG)
    const additive = diffSnapshots(root, CONFIG, base)
    expect(additive.change).toBe('additive')
    expect(additive.members.find(item => item.member === 'packages/x/a')?.items).toEqual([
      { section: '入口 `.`', item: '`A`', kind: 'changed', change: 'additive' },
    ])

    setDist(root, 'packages/x/b', { 'index.d.ts': 'export {};\n' })
    writeSnapshots(root, CONFIG)
    const review = diffSnapshots(root, CONFIG, base)
    expect(review.change).toBe('review')
    expect(renderDiff(review).join('\n')).toContain(
      'packages/x/b：review\n    入口 `.` · `B`：删除，review',
    )

    expect(() => diffSnapshots(root, CONFIG, 'no-such-ref')).toThrow(/基线 no-such-ref/u)
  })

  it('reports a dist that differs from its snapshot and still exits 0; usage errors exit 2', () => {
    const { root } = committedCheckout()
    expect(cli(root, '--check')).toMatchObject({ status: 0 })
    setDist(root, 'packages/x/b', { 'index.d.ts': 'export type B = 2;\n' })
    const check = cli(root, '--check')
    expect(check.status).toBe(0)
    expect(check.stdout).toContain('packages/x/b：packages/x/b/api/b.api.md 与 dist 不一致，review')
    const json = cli(root, '--check', '--json')
    expect(JSON.parse(json.stdout)).toMatchObject({
      members: [
        { member: 'packages/x/a', status: 'match' },
        { member: 'packages/x/b', status: 'differs' },
      ],
    })
    const diff = cli(root, '--diff', 'HEAD', '--json')
    expect(JSON.parse(diff.stdout)).toMatchObject({ base: 'HEAD', change: 'none' })

    setDist(root, 'packages/x/b', undefined)
    expect(cli(root, '--write')).toMatchObject({ status: 1 })
    expect(cli(root, '--check', '--write')).toMatchObject({ status: 2 })
    expect(cli(root)).toMatchObject({ status: 2 })
    expect(cli(root, '--diff')).toMatchObject({ status: 2 })
  })
})
