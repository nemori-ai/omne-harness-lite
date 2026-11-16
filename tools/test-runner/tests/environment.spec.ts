// 环境自检与自愈（准入与预检开始时）：依赖一栏照抄启动段（scripts/check-bootstrap.mjs）交来的结果，没有就记 not-bootstrapped；
// 索引为 LF 而工作副本为 CRLF 的已跟踪文件从索引重新检出，有内容改动的不覆盖。结果写成记录里的一栏。
// 依赖的核对与离线重装本身由启动段做，测试在 tests/check-bootstrap.spec.ts。
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { repositoryEnv } from '@omne-harness/repo-toolchain/core/git-environment'
import { parseAdmissionRun } from '../src/testing/admission-run.ts'
import {
  describeHealing,
  healEnvironment,
  parseBootstrap,
  parseEnvironmentHealing,
  type BootstrapResult,
} from '../src/testing/environment.ts'

let root: string
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-environment-')))
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, env: repositoryEnv(process.env), encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  // 换行判定不依赖机器的 autocrlf：读字节、算 blob 哈希与索引比。
  git('config', 'core.autocrlf', 'false')
  put('.gitignore', 'node_modules/\n')
  put('a.txt', 'one\ntwo\n')
  put('b.txt', 'alpha\nbeta\n')
  put('c.txt', 'keep\n')
  put('pnpm-lock.yaml', 'lockfileVersion: 9\n')
  git('add', '-A')
  git('-c', 'user.name=E', '-c', 'user.email=e@example.invalid', 'commit', '-qm', 'base')
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const put = (path: string, text: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const BOOTSTRAP: BootstrapResult = {
  toolchain: { pnpm: '12.18.0', node: 'v26.13.1', runtime: 'v26.13.1' },
  dependencies: {
    status: 'in-sync',
    detail: 'node_modules/.pnpm/lock.yaml 与 pnpm-lock.yaml 的本体相同',
  },
  native: { status: 'ok', detail: 'node-pty 的 spawn-helper 可用' },
}

describe('依赖一栏取启动段的结果', () => {
  it('有启动段的结果：照抄它的依赖一栏，不碰依赖目录', () => {
    expect(healEnvironment(root, BOOTSTRAP).dependencies).toEqual(BOOTSTRAP.dependencies)
    expect(describeHealing(healEnvironment(root, BOOTSTRAP)).join('\n')).toContain('，不动')
  })

  it('进程内直接调用、没有启动段的结果：记 not-bootstrapped', () => {
    expect(healEnvironment(root, undefined).dependencies.status).toBe('not-bootstrapped')
  })

  it('parseBootstrap 只认启动段写出的形状；空、坏 JSON、install-failed 都不认', () => {
    expect(parseBootstrap(JSON.stringify(BOOTSTRAP))).toEqual(BOOTSTRAP)
    expect(parseBootstrap(undefined)).toBeUndefined()
    expect(parseBootstrap('')).toBeUndefined()
    expect(parseBootstrap('{')).toBeUndefined()
    expect(
      parseBootstrap(
        JSON.stringify({ ...BOOTSTRAP, dependencies: { status: 'install-failed', detail: 'x' } }),
      ),
    ).toBeUndefined()
    expect(
      parseBootstrap(JSON.stringify({ ...BOOTSTRAP, native: { status: 'broken' } })),
    ).toBeUndefined()
  })
})

describe('工作副本的换行', () => {
  const synced = () => BOOTSTRAP

  it('索引 LF、工作副本 CRLF 且只有换行不同：从索引重新检出；有内容改动的 CRLF 文件不覆盖，记在 kept', () => {
    put('a.txt', 'one\r\ntwo\r\n')
    put('b.txt', 'alpha\r\nchanged\r\n')
    const healed = healEnvironment(root, synced())
    expect(healed.lineEndings).toEqual({ restored: ['a.txt'], kept: ['b.txt'] })
    expect(read('a.txt')).toBe('one\ntwo\n')
    expect(read('b.txt')).toBe('alpha\r\nchanged\r\n')
    expect(read('c.txt')).toBe('keep\n')
  })

  it('全部一致时什么都不动', () => {
    const healed = healEnvironment(root, synced())
    expect(healed.lineEndings).toEqual({ restored: [], kept: [] })
  })

  it('仓库 core.autocrlf=true（检出就写 CRLF）：不重新检出，写明改法', () => {
    execFileSync('git', ['config', 'core.autocrlf', 'true'], { cwd: root })
    put('a.txt', 'one\r\ntwo\r\n')
    const healed = healEnvironment(root, synced())
    expect(healed.lineEndings.restored).toEqual([])
    expect(healed.lineEndings.blocked).toContain('core.autocrlf=true')
    expect(read('a.txt')).toBe('one\r\ntwo\r\n')
    expect(describeHealing(healed).join('\n')).toContain('core.autocrlf input')
  })

  it('索引本来就是 CRLF 的文件不算', () => {
    put('d.txt', 'x\r\ny\r\n')
    execFileSync('git', ['add', 'd.txt'], { cwd: root, env: repositoryEnv(process.env) })
    expect(healEnvironment(root, synced()).lineEndings).toEqual({ restored: [], kept: [] })
  })
})

describe('记录与说明', () => {
  it('说明逐项写做了什么；一致时也写明「不动」', () => {
    const lines = describeHealing(healEnvironment(root, BOOTSTRAP)).join('\n')
    expect(lines).toContain('依赖')
    expect(lines).toContain('换行')
    put('a.txt', 'one\r\ntwo\r\n')
    expect(describeHealing(healEnvironment(root, BOOTSTRAP)).join('\n')).toContain('a.txt')
  })

  it('自愈结果是运行记录的一栏：写进去能读回；形状不对的记录不是记录', () => {
    const base = {
      schemaVersion: 1,
      kind: 'admission-run',
      head: 'a'.repeat(40),
      tree: 'c'.repeat(40),
      dirty: false,
      worktree: '/work/tree',
      admission: true,
      caches: { test: 'off', depGraph: 'on' },
      fullRequested: true,
      mode: 'full',
      base: null,
      resumeFrom: null,
      steps: [{ name: 'check:docs', ran: true, exit: 0, seconds: 1 }],
      failedStep: null,
      startedAt: '2026-11-01T01:00:00.000Z',
      finishedAt: '2026-11-01T01:05:00.000Z',
    }
    const environment = {
      dependencies: { status: 'reinstalled', detail: 'pnpm install --offline --frozen-lockfile' },
      lineEndings: { restored: ['docs/a.md'], kept: [] },
    }
    expect(parseAdmissionRun({ ...base, environment })?.environment).toEqual(environment)
    expect(parseAdmissionRun(base)?.environment).toBeUndefined()
    expect(
      parseAdmissionRun({ ...base, environment: { dependencies: { status: 'weird' } } }),
    ).toBeUndefined()
    expect(parseEnvironmentHealing(environment)).toEqual(environment)
    expect(parseEnvironmentHealing({ lineEndings: { restored: 'x' } })).toBeUndefined()
  })
})
