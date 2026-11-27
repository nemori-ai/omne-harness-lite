import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkoutOf, prepare } from '../src/prepare.ts'

const HEAD = 'a'.repeat(40)
const OTHER = 'b'.repeat(40)

let root: string
let said: string[]
let calls: string[]

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'perf-prepare-')))
  said = []
  calls = []
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const build = (directory: string): void => {
  for (const file of ['apps/harness-server/dist/lab/bin.js', 'apps/cli/dist/bin.js']) {
    mkdirSync(join(directory, file, '..'), { recursive: true })
    writeFileSync(join(directory, file), '')
  }
}

type Answer = Readonly<{ status: number; stdout?: string; stderr?: string }>

const exec =
  (over: (line: string) => Answer | undefined = () => undefined) =>
  (command: string, args: readonly string[]) => {
    const line = [command, ...args].join(' ')
    calls.push(line)
    const answer = over(line) ?? {
      status: 0,
      stdout: line.includes('rev-parse HEAD')
        ? HEAD
        : line.includes(`${'main'}^{commit}`)
          ? HEAD
          : line.includes('^{commit}')
            ? OTHER
            : '',
    }
    return Promise.resolve({
      status: answer.status,
      stdout: answer.stdout ?? '',
      stderr: answer.stderr ?? '',
    })
  }

const say = (line: string): void => void said.push(line)

describe('preparing a checkout of a commit', () => {
  it('uses this checkout for the commit it is at, when it is clean and built', async () => {
    build(root)
    expect(await prepare(root, 'main', say, exec())).toBe(root)
    expect(said).toEqual([])
  })

  it('says to build this checkout first when it is not', async () => {
    expect(await prepare(root, 'main', say, exec())).toEqual({
      state: 'blocked',
      reason: 'this checkout is not built: run pnpm run build first',
    })
  })

  it('checks another commit out beside the results, installs and builds it, and keeps it for the next time', async () => {
    const directory = checkoutOf(root, OTHER)
    const building = exec(line => {
      if (line.includes('worktree add')) mkdirSync(directory, { recursive: true })
      if (line.includes('run build')) build(directory)
      return undefined
    })
    expect(await prepare(root, 'feature', say, building)).toBe(directory)
    expect(said).toEqual([
      `checking out ${OTHER.slice(0, 12)}`,
      `installing ${OTHER.slice(0, 12)}`,
      `building the native dependency of ${OTHER.slice(0, 12)}`,
      `building ${OTHER.slice(0, 12)}`,
    ])
    expect(calls).toContain('pnpm install --frozen-lockfile --ignore-scripts --prefer-offline')
    expect(calls.indexOf('pnpm run prepare:native')).toBeGreaterThan(
      calls.indexOf('pnpm install --frozen-lockfile --ignore-scripts --prefer-offline'),
    )
    expect(calls.some(line => line.includes(`worktree add --detach ${directory} ${OTHER}`))).toBe(
      true,
    )
    calls = []
    said = []
    expect(await prepare(root, 'feature', say, building)).toBe(directory)
    expect(said).toEqual([])
    expect(calls.some(line => line.includes('worktree add'))).toBe(false)
  })

  it('does not use this checkout for its own commit while it holds changes', async () => {
    build(root)
    const dirty = exec(line =>
      line.includes('status --porcelain') ? { status: 0, stdout: ' M x.ts' } : undefined,
    )
    const answer = await prepare(root, 'main', say, dirty)
    expect(answer).toMatchObject({ state: 'blocked' })
    expect(said[0]).toBe(`checking out ${HEAD.slice(0, 12)}`)
  })

  it('is blocked by a name that is no commit, by a step that fails, and by a commit older than the lab server', async () => {
    const unknown = exec(line => (line.includes('^{commit}') ? { status: 128 } : undefined))
    expect(await prepare(root, 'nowhere', say, unknown)).toEqual({
      state: 'blocked',
      reason: 'nowhere is not a commit of this repository',
    })
    const failing = exec(line =>
      line.includes('install') ? { status: 1, stderr: 'no such package' } : undefined,
    )
    expect(await prepare(root, 'feature', say, failing)).toEqual({
      state: 'blocked',
      reason: `installing ${OTHER.slice(0, 12)} failed: no such package`,
    })
    const compiler = exec(line =>
      line.includes('prepare:native') ? { status: 1, stderr: 'g++: error: -std=c++20' } : undefined,
    )
    expect(await prepare(root, 'feature', say, compiler)).toEqual({
      state: 'blocked',
      reason: `building the native dependency of ${OTHER.slice(0, 12)} failed: g++: error: -std=c++20 (a system compiler too old for it needs CC and CXX set: CONTRIBUTING.md)`,
    })
    expect(await prepare(root, 'feature', say, exec())).toEqual({
      state: 'blocked',
      reason: `${OTHER.slice(0, 12)} has no lab server to run: it is older than the suites`,
    })
  })
})
