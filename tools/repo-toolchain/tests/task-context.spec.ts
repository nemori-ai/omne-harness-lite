import { realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { baselines, resolveBaseline, taskContextPath } from '../src/core/task-context.ts'
import {
  commit,
  git,
  removeTemporaries,
  repository,
  write,
} from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

/** A task context for this tree as the flow tool's start writes it. */
function bind(root: string, taskBase: string, targetBase: string, branch = 'main'): void {
  const actual = realpathSync(root)
  const ownerTask = {
    issue: { url: 'https://github.com/owner/repo/issues/1' },
    revision: 1,
    attempt: 'one',
    taskBase,
    writeScope: ['src'],
  }
  writeFileSync(
    taskContextPath(root),
    JSON.stringify({
      schemaVersion: 1,
      root: actual,
      gitDir: realpathSync(join(actual, '.git')),
      branch,
      targetBase,
      tasks: [],
      ownerTask,
      operation: null,
    }),
  )
}

describe('baselines', () => {
  it('is pending without a task context and keeps the explicit base', () => {
    const root = repository()
    expect(baselines(root, 'main')).toEqual({ state: 'pending', targetBase: 'main', audits: [] })
  })

  it('is bound with a task context and audits the owner task from its taskBase', () => {
    const root = repository()
    const taskBase = git(root, 'rev-parse', 'HEAD')
    write(root, 'src/a.ts', 'export const a = 1\n')
    const head = commit(root, 'task work')
    bind(root, taskBase, taskBase)
    expect(baselines(root)).toEqual({
      state: 'bound',
      targetBase: taskBase,
      audits: [{ binding: expect.objectContaining({ taskBase }), taskSource: head }],
    })
  })

  it('refuses a context written for another branch as stale', () => {
    const root = repository()
    const head = git(root, 'rev-parse', 'HEAD')
    bind(root, head, head, 'someone/other')
    expect(() => baselines(root)).toThrow('Context belongs to another tree or branch')
  })
})

describe('resolveBaseline', () => {
  it('falls back to main when the tree has no context and no origin/main', () => {
    const root = repository()
    expect(resolveBaseline(root, undefined, {})).toEqual({
      state: 'pending',
      targetBase: 'main',
      source: 'main',
      audits: [],
    })
  })

  it('prefers origin/main to main when the remote-tracking ref exists', () => {
    const root = repository()
    git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
    expect(resolveBaseline(root, undefined, {})).toMatchObject({
      targetBase: 'origin/main',
      source: 'origin/main',
    })
  })

  it('takes the explicit argument before the BASELINE variable, and both before origin/main', () => {
    const root = repository()
    git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
    expect(resolveBaseline(root, 'HEAD~0', { BASELINE: 'other' })).toMatchObject({
      targetBase: 'HEAD~0',
      source: 'explicit',
    })
    expect(resolveBaseline(root, undefined, { BASELINE: 'HEAD' })).toMatchObject({
      targetBase: 'HEAD',
      source: 'explicit',
    })
  })

  it('treats an empty argument and an empty BASELINE as not given', () => {
    const root = repository()
    expect(resolveBaseline(root, '', { BASELINE: '' })).toMatchObject({ source: 'main' })
  })

  it('takes the fixed targetBase from a bound tree before origin/main', () => {
    const root = repository()
    const taskBase = git(root, 'rev-parse', 'HEAD')
    write(root, 'src/a.ts', 'export const a = 1\n')
    commit(root, 'task work')
    git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
    bind(root, taskBase, taskBase)
    expect(resolveBaseline(root, undefined, {})).toMatchObject({
      state: 'bound',
      targetBase: taskBase,
      source: 'task',
    })
  })

  it('accepts an explicit base that names the fixed targetBase and refuses any other', () => {
    const root = repository()
    const taskBase = git(root, 'rev-parse', 'HEAD')
    write(root, 'src/a.ts', 'export const a = 1\n')
    const head = commit(root, 'task work')
    bind(root, taskBase, taskBase)
    expect(resolveBaseline(root, taskBase, {})).toMatchObject({ source: 'task' })
    expect(() => resolveBaseline(root, head, {})).toThrow(
      'Explicit base differs from fixed targetBase',
    )
    expect(() => resolveBaseline(root, undefined, { BASELINE: head })).toThrow(
      'Explicit base differs from fixed targetBase',
    )
  })
})
