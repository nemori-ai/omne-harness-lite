// @module-tag slow
// status and task-sync against a real task worktree and a local bare remote.
import { readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { auditRanges } from '@omne-harness/repo-toolchain/core/task-context'
import { commit, init, integrationFixture } from './fixtures/integration.ts'
import { openIntegration } from '../src/integration/engine.ts'
import { contextPath } from '../src/integration/context.ts'
import { git, repository } from '../src/integration/git.ts'
import { taskStatus, taskSync } from '../src/integration/sync.ts'

const homes: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true }))
})
const cliPath = fileURLToPath(new URL('../src/integration/cli.ts', import.meta.url))
function cli(root: string, args: string[]) {
  return spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, ...args, '--root', root],
    {
      encoding: 'utf8',
      env: process.env,
    },
  )
}
function fixture() {
  const f = integrationFixture()
  homes.push(f.home)
  vi.stubEnv('PATH', `${f.bin}:${process.env.PATH}`)
  vi.stubEnv('OMNE_GH_FIXTURE', f.home)
  return f
}
type Fixture = ReturnType<typeof fixture>
async function bound(): Promise<Fixture> {
  const f = fixture()
  f.authority(
    {
      schemaVersion: 1,
      responsible: 'human',
      basis: ['fixture authority'],
      action: 'dispatch',
      task: f.binding,
      confirmations: [],
    },
    1,
  )
  await (
    await openIntegration({ root: f.root })
  ).execute({
    kind: 'start',
    authority: f.binding.dispatch,
    issue: f.binding.issue.url,
    revision: 1,
    attempt: 'one',
  })
  return f
}
let clones = 0
/** Another writer moves the remote track; returns the new remote head. */
function advanceTarget(f: Fixture, name: string, orphan = false): string {
  const other = join(f.home, `upstream-${++clones}`)
  init(other)
  git(other, ['remote', 'add', 'origin', f.remote])
  git(other, ['fetch', 'origin', 'integration/runtime'])
  git(other, orphan ? ['checkout', '--orphan', 'next'] : ['checkout', '-b', 'next', 'FETCH_HEAD'])
  if (orphan) git(other, ['rm', '-rfq', '--ignore-unmatch', '.'])
  const head = commit(other, name, `${name}\n`)
  git(other, ['push', '--force', 'origin', `${head}:refs/heads/integration/runtime`])
  return head
}
/** The executor merges a target commit into the task branch with plain Git. */
function mergeTarget(f: Fixture, target: string, unrelated = false): void {
  git(f.root, ['fetch', 'origin', target])
  git(f.root, ['merge', '--no-edit', ...(unrelated ? ['--allow-unrelated-histories'] : []), target])
}
function snapshot(f: Fixture) {
  return { bytes: readFileSync(contextPath(f.root)), entries: gitDirEntries(f) }
}
function gitDirEntries(f: Fixture): string[] {
  return readdirSync(repository(f.root).gitDir).filter(name => name.includes('context'))
}

describe('status', () => {
  it('reports an unbound tree without reading the remote', () => {
    const f = fixture()
    renameSync(f.remote, `${f.remote}.gone`)
    const result = cli(f.root, ['status'])
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
      bound: false,
      root: repository(f.root).root,
      branch: 'human/task',
      head: f.main,
    })
  })
  it('reports the bound task, both baselines and the current remote target', async () => {
    const f = await bound()
    const result = cli(f.root, ['status'])
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      bound: true,
      issue: f.binding.issue.url,
      revision: 1,
      attempt: 'one',
      taskBase: f.main,
      targetBase: f.initial,
      target: { ref: 'refs/heads/integration/runtime', head: f.initial },
      relation: 'current',
    })
  })
  it('reports a targetBase behind the remote target, and one on another history as diverged', async () => {
    const f = await bound()
    const next = advanceTarget(f, 'upstream')
    expect(taskStatus(f.root)).toMatchObject({
      targetBase: f.initial,
      target: { head: next },
      relation: 'behind',
    })
    const orphan = advanceTarget(f, 'orphan', true)
    expect(taskStatus(f.root)).toMatchObject({ target: { head: orphan }, relation: 'diverged' })
  })
  it('fails with a nonzero exit when the remote target cannot be read', async () => {
    const f = await bound()
    renameSync(f.remote, `${f.remote}.gone`)
    const result = cli(f.root, ['status'])
    expect(result.status).toBe(2)
    expect(result.stdout).toBe('')
    expect(JSON.parse(result.stderr)).toMatchObject({ code: 'unknown' })
    expect(JSON.parse(result.stderr).message).toContain('Cannot read remote refs')
  })
})

describe('task-sync', () => {
  it('moves only targetBase forward to a merged remote target commit', async () => {
    const f = await bound()
    const before = JSON.parse(readFileSync(contextPath(f.root), 'utf8'))
    const next = advanceTarget(f, 'upstream')
    mergeTarget(f, next)
    const input = join(f.home, 'task-sync.json')
    writeFileSync(input, JSON.stringify({ kind: 'task-sync', target: next }))
    const result = cli(f.root, ['execute', '--input', input])
    expect(result.status, result.stderr).toBe(0)
    const after = JSON.parse(readFileSync(contextPath(f.root), 'utf8'))
    expect(after).toEqual({ ...before, targetBase: next })
    expect(Object.keys(after)).toEqual(Object.keys(before))
    expect(JSON.parse(result.stdout)).toEqual(after)
    expect(gitDirEntries(f)).toEqual(['omne-integration-context.json'])
    expect(taskStatus(f.root)).toMatchObject({ targetBase: next, relation: 'current' })
  })
  it('keeps the context file as it is when target already equals targetBase', async () => {
    const f = await bound()
    const before = statSync(contextPath(f.root)),
      bytes = readFileSync(contextPath(f.root))
    expect(taskSync(f.root, f.initial)).toMatchObject({ targetBase: f.initial })
    expect(readFileSync(contextPath(f.root)).equals(bytes)).toBe(true)
    expect(statSync(contextPath(f.root)).ino).toBe(before.ino)
  })
  it('refuses an unbound tree without creating a context', () => {
    const f = fixture()
    expect(() => taskSync(f.root, f.initial)).toThrow('not bound to a task')
    expect(gitDirEntries(f)).toEqual([])
  })

  const refusals: [string, (f: Fixture) => string, string][] = [
    [
      'a target that is not merged into HEAD',
      f => advanceTarget(f, 'upstream'),
      'is not merged into HEAD',
    ],
    [
      'a target outside the remote target history',
      f => commit(f.root, 'feature', 'local only\n'),
      'is not in the history of remote refs/heads/integration/runtime',
    ],
    [
      'a target that would move targetBase backward',
      f => {
        const next = advanceTarget(f, 'upstream')
        mergeTarget(f, next)
        taskSync(f.root, next)
        return f.initial
      },
      'can only move forward',
    ],
    [
      'a target on another history',
      f => {
        const orphan = advanceTarget(f, 'orphan', true)
        mergeTarget(f, orphan, true)
        return orphan
      },
      'can only move forward',
    ],
    [
      'a tree with an untracked file',
      f => {
        const next = advanceTarget(f, 'upstream')
        mergeTarget(f, next)
        writeFileSync(join(f.root, 'scratch'), 'not committed\n')
        return next
      },
      'not clean',
    ],
    [
      'a tree with a staged change',
      f => {
        const next = advanceTarget(f, 'upstream')
        mergeTarget(f, next)
        writeFileSync(join(f.root, 'upstream'), 'edited\n')
        git(f.root, ['add', 'upstream'])
        return next
      },
      'not clean',
    ],
    [
      'an unreadable remote',
      f => {
        const next = advanceTarget(f, 'upstream')
        mergeTarget(f, next)
        renameSync(f.remote, `${f.remote}.gone`)
        return next
      },
      'Cannot read remote refs',
    ],
  ]
  it.each(refusals)(
    'refuses %s and leaves the context file unchanged',
    async (_, arrange, message) => {
      const f = await bound()
      const target = arrange(f)
      const before = snapshot(f)
      expect(() => taskSync(f.root, target)).toThrow(message)
      const after = snapshot(f)
      expect(after.bytes.equals(before.bytes)).toBe(true)
      expect(after.entries).toEqual(before.entries)
    },
  )
})

it('feeds the synced targetBase to baselines while the task audit keeps its taskBase', async () => {
  const f = await bound()
  const next = advanceTarget(f, 'upstream')
  mergeTarget(f, next)
  taskSync(f.root, next)
  const result = cli(f.root, ['baselines'])
  expect(result.status, result.stderr).toBe(0)
  const resolved = JSON.parse(result.stdout)
  expect(resolved.targetBase).toBe(next)
  expect(resolved.audits).toHaveLength(1)
  expect(resolved.audits[0].binding.taskBase).toBe(f.main)
  expect(auditRanges(f.root)).toEqual([
    {
      label: `${f.binding.issue.url}@1/one`,
      base: f.main,
      head: repository(f.root).head,
    },
    { label: 'target integration edits', base: next, head: 'HEAD' },
  ])
  const stale = cli(f.root, ['baselines', '--base', f.initial])
  expect(stale.status).toBe(2)
  expect(JSON.parse(stale.stderr)).toMatchObject({ code: 'stale' })
})
