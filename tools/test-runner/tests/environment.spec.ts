// 环境自检与自愈（准入与预检开始时）：依赖目录与锁文件不一致时离线安装，索引为 LF 而工作副本为 CRLF 的已跟踪文件从索引重新检出；
// 已一致时什么都不动；有内容改动的 CRLF 文件不覆盖。只改工作副本与依赖目录，结果写成记录里的一栏。
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
  parseEnvironmentHealing,
  type EnvironmentIo,
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

/** 假的离线安装：记下调用次数；`succeed` 时把锁文件抄进依赖目录（pnpm 安装成功后 `.pnpm/lock.yaml` 就是这样）。 */
function installer(succeed: boolean) {
  const calls: string[] = []
  const io: EnvironmentIo = {
    install: at => {
      calls.push(at)
      if (succeed) put('node_modules/.pnpm/lock.yaml', read('pnpm-lock.yaml'))
      return {
        status: succeed ? 0 : 1,
        output: succeed ? 'Done\n' : 'ERR_PNPM_NO_OFFLINE_TARBALL\n',
      }
    },
  }
  return { io, calls }
}

describe('依赖目录与锁文件', () => {
  it('已一致：不安装，记 in-sync', () => {
    put('node_modules/.pnpm/lock.yaml', read('pnpm-lock.yaml'))
    const { io, calls } = installer(true)
    const healed = healEnvironment(root, io)
    expect(healed.dependencies.status).toBe('in-sync')
    expect(calls).toEqual([])
  })

  it('依赖目录的锁文件副本与锁文件不同（合并后没重装）：离线安装一次，成功后记 reinstalled', () => {
    put('node_modules/.pnpm/lock.yaml', 'lockfileVersion: 9\nold: true\n')
    const { io, calls } = installer(true)
    const healed = healEnvironment(root, io)
    expect(calls).toEqual([root])
    expect(healed.dependencies.status).toBe('reinstalled')
    expect(read('node_modules/.pnpm/lock.yaml')).toBe(read('pnpm-lock.yaml'))
  })

  it('没有依赖目录（从未安装）同样安装；离线安装失败记 install-failed 并带输出', () => {
    const { io, calls } = installer(false)
    const healed = healEnvironment(root, io)
    expect(calls).toEqual([root])
    expect(healed.dependencies.status).toBe('install-failed')
    expect(healed.dependencies.detail).toContain('ERR_PNPM_NO_OFFLINE_TARBALL')
  })

  it('没有锁文件：不安装，记 no-lockfile', () => {
    rmSync(join(root, 'pnpm-lock.yaml'))
    const { io, calls } = installer(true)
    expect(healEnvironment(root, io).dependencies.status).toBe('no-lockfile')
    expect(calls).toEqual([])
  })
})

describe('工作副本的换行', () => {
  const synced = () => {
    put('node_modules/.pnpm/lock.yaml', read('pnpm-lock.yaml'))
    return installer(true).io
  }

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
    put('node_modules/.pnpm/lock.yaml', read('pnpm-lock.yaml'))
    const lines = describeHealing(healEnvironment(root, installer(true).io)).join('\n')
    expect(lines).toContain('依赖')
    expect(lines).toContain('换行')
    put('a.txt', 'one\r\ntwo\r\n')
    expect(describeHealing(healEnvironment(root, installer(true).io)).join('\n')).toContain('a.txt')
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
      caches: { test: 'off', depGraph: 'on', mutation: 'unknown' },
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
