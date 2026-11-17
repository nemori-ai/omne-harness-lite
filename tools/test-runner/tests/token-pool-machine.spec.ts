// @module-tag slow
// 归慢层：真的起令牌池脚本的子进程排队、持有、被杀。核对整机令牌池（scripts/with-test-slot.mjs）的性质：
// 容量按核数算、部分发放、先来先得、持有者死后令牌回收、几个进程同时要时令牌之和不超过容量、归还后不留令牌，
// 以及运行器经它要令牌（machinePool）。
import { spawn, type ChildProcess } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readTestRunsConfig } from '../src/testing/config.ts'
import { machineCapacity } from '../src/testing/parallelism.ts'
import { machinePool, SLOT_SCRIPT } from '../src/testing/token-pool.ts'

let dir: string
let children: ChildProcess[] = []
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'omne-pool-')))
})
afterEach(() => {
  for (const child of children) if (child.exitCode === null) child.kill('SIGKILL')
  children = []
  rmSync(dir, { recursive: true, force: true })
})

function poolEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env['OMNE_TEST_SLOT_HELD']
  delete env['OMNE_WORKER_BUDGET']
  return {
    ...env,
    OMNE_TEST_SLOT_DIR: join(dir, 'locks'),
    OMNE_TEST_SLOT_LEDGER: join(dir, 'ledger.jsonl'),
    OMNE_TEST_SLOT_POLL_SECONDS: '1',
    OMNE_TEST_SLOT_CAPACITY: '4',
    ...extra,
  }
}

/**
 * 经令牌池起一件活：拿到令牌后在 `events` 里记一行「start 名字 令牌数 毫秒」，
 * 等 `<名字>.release` 出现（或过 `holdMs`）再记「end …」并结束。
 */
function job(
  name: string,
  request: readonly string[],
  options: { holdMs?: number; env?: Record<string, string> } = {},
): ChildProcess {
  const events = join(dir, 'events')
  const release = join(dir, `${name}.release`)
  const body = `
    const fs = require('node:fs')
    const g = process.env.OMNE_WORKER_BUDGET
    fs.appendFileSync(${JSON.stringify(events)}, 'start ${name} ' + g + ' ' + Date.now() + '\\n')
    const until = Date.now() + ${options.holdMs ?? 60_000}
    const tick = () => {
      if (fs.existsSync(${JSON.stringify(release)}) || Date.now() >= until) {
        fs.appendFileSync(${JSON.stringify(events)}, 'end ${name} ' + g + ' ' + Date.now() + '\\n')
        return
      }
      setTimeout(tick, 50)
    }
    tick()`
  const child = spawn(
    process.execPath,
    [SLOT_SCRIPT, ...request, '--', process.execPath, '-e', body],
    { env: poolEnv(options.env), stdio: ['ignore', 'pipe', 'pipe'] },
  )
  children.push(child)
  return child
}

interface Event {
  readonly kind: 'start' | 'end'
  readonly name: string
  readonly tokens: number
  readonly at: number
}

function events(): Event[] {
  const path = join(dir, 'events')
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .map(line => {
      const [kind, name, tokens, at] = line.split(' ')
      return {
        kind: kind as Event['kind'],
        name: name ?? '',
        tokens: Number(tokens),
        at: Number(at),
      }
    })
}

const started = (name: string) =>
  events().find(event => event.kind === 'start' && event.name === name)

async function waitFor(condition: () => boolean, what: string, ms = 20_000): Promise<void> {
  const until = Date.now() + ms
  while (!condition()) {
    if (Date.now() > until) throw new Error(`等不到：${what}；事件：${JSON.stringify(events())}`)
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

const exited = (child: ChildProcess) =>
  new Promise<number>(resolve => {
    if (child.exitCode !== null) resolve(child.exitCode)
    else child.once('exit', code => resolve(code ?? -1))
  })

const release = (name: string) => writeFileSync(join(dir, `${name}.release`), '')

const tokenDirs = () =>
  existsSync(join(dir, 'locks'))
    ? readdirSync(join(dir, 'locks')).filter(name => /^core-\d+$/u.test(name))
    : []

describe('整机令牌池', { timeout: 60_000 }, () => {
  it('不钉容量时按核数减 reserveCores 算，与测试运行器的算法相同；不带 --want 整拿', async () => {
    const env = poolEnv()
    delete env['OMNE_TEST_SLOT_CAPACITY']
    const child = spawn(
      process.execPath,
      [SLOT_SCRIPT, process.execPath, '-e', 'console.log(process.env.OMNE_WORKER_BUDGET)'],
      { env, stdio: ['ignore', 'pipe', 'inherit'] },
    )
    children.push(child)
    let output = ''
    child.stdout?.on('data', chunk => (output += String(chunk)))
    expect(await exited(child)).toBe(0)
    expect(Number(output.trim())).toBe(machineCapacity(readTestRunsConfig().parallel))
    const line = JSON.parse(readFileSync(join(dir, 'ledger.jsonl'), 'utf8').trim()) as Record<
      string,
      unknown
    >
    expect(line).toMatchObject({
      capacity: Number(output.trim()),
      min: 1,
      tokens: Number(output.trim()),
    })
  })

  it('部分发放：只剩 1 个时要 4 个的拿 1 个；先拿的归还之后，后来者拿到更多；归还后不留令牌', async () => {
    job('a', ['--want', '3'])
    await waitFor(() => started('a') !== undefined, 'a 拿到令牌')
    const b = job('b', ['--want', '4'], { holdMs: 0 })
    expect(await exited(b)).toBe(0)
    expect(started('b')?.tokens).toBe(1)
    release('a')
    await waitFor(
      () => events().some(event => event.kind === 'end' && event.name === 'a'),
      'a 结束',
    )
    const c = job('c', ['--want', '4'], { holdMs: 0 })
    expect(await exited(c)).toBe(0)
    expect(started('c')?.tokens).toBe(4)
    await waitFor(() => tokenDirs().length === 0, '令牌都归还')
    const ledger = readFileSync(join(dir, 'ledger.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map(text => JSON.parse(text) as { tokens: number; want: number })
    expect(ledger.map(line => [line.want, line.tokens])).toEqual(
      expect.arrayContaining([
        [3, 3],
        [4, 1],
        [4, 4],
      ]),
    )
  })

  it('先来先得：排在前面的要 4 个、至少 4 个，后来要 1 个的也不越过它', async () => {
    job('holder', ['--want', '2'])
    await waitFor(() => started('holder') !== undefined, 'holder 拿到令牌')
    job('big', ['--want', '4', '--min', '4'])
    // big 先进队：等它的票出现再起 small。
    await waitFor(
      () => readdirSync(join(dir, 'locks')).some(name => name.startsWith('ticket-')),
      'big 领到票',
    )
    job('small', ['--want', '1'], { holdMs: 0 })
    await new Promise(resolve => setTimeout(resolve, 2500))
    expect(started('small')).toBeUndefined()
    release('holder')
    await waitFor(() => started('big') !== undefined, 'big 拿到令牌')
    expect(started('big')?.tokens).toBe(4)
    expect(started('small')).toBeUndefined()
    release('big')
    await waitFor(() => started('small') !== undefined, 'small 拿到令牌')
    expect(started('small')!.at).toBeGreaterThanOrEqual(started('big')!.at)
  })

  it('持有者被杀：它的令牌被下一个看队列的进程回收，等待者拿到全部', async () => {
    // 被包装的命令在包装进程被杀后成孤儿，5 秒后自己结束。
    const holder = job('holder', ['--want', '4'], { holdMs: 5000 })
    await waitFor(() => started('holder') !== undefined, 'holder 拿到令牌')
    const waiter = job('waiter', ['--want', '4'], { holdMs: 0 })
    await new Promise(resolve => setTimeout(resolve, 1500))
    expect(started('waiter')).toBeUndefined()
    holder.kill('SIGKILL')
    expect(await exited(waiter)).toBe(0)
    expect(started('waiter')?.tokens).toBe(4)
  })

  it('几个进程同时要：任何时刻拿着的令牌之和不超过容量，每个都拿到并跑完', async () => {
    const runs = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map(name =>
      job(name, ['--want', '2'], { holdMs: 600 }),
    )
    expect(await Promise.all(runs.map(exited))).toEqual([0, 0, 0, 0, 0, 0])
    const timeline = events().sort((a, b) => a.at - b.at || (a.kind === 'end' ? -1 : 1))
    let held = 0
    let peak = 0
    for (const event of timeline) {
      held += event.kind === 'start' ? event.tokens : -event.tokens
      peak = Math.max(peak, held)
    }
    expect(timeline.filter(event => event.kind === 'start')).toHaveLength(6)
    expect(peak).toBeLessThanOrEqual(4)
    expect(peak).toBeGreaterThan(2)
    expect(tokenDirs()).toEqual([])
  })
})

describe('运行器经整机令牌池要令牌', { timeout: 60_000 }, () => {
  it('两件活合起来不超过容量；归还之后再要的拿到全部；归还后不留令牌', async () => {
    const pool = machinePool(dir, poolEnv(), 2)
    expect(pool.capacity).toBe(4)
    const first = await pool.acquire({ want: 3, min: 1, label: 'first' })
    const second = await pool.acquire({ want: 3, min: 1, label: 'second' })
    expect([first.tokens, second.tokens]).toEqual([3, 1])
    await first.release()
    await second.release()
    const third = await pool.acquire({ want: 4, min: 1, label: 'third' })
    expect(third.tokens).toBe(4)
    await third.release()
    expect(tokenDirs()).toEqual([])
  })

  it('等太久放弃：要令牌的一方得到拒绝，不当作拿到', async () => {
    job('holder', ['--want', '4'])
    await waitFor(() => started('holder') !== undefined, 'holder 拿到令牌')
    const pool = machinePool(dir, poolEnv({ OMNE_TEST_SLOT_MAX_WAIT_SECONDS: '0' }), 2)
    await expect(pool.acquire({ want: 1, min: 1, label: 'late' })).rejects.toThrow('75')
  })
})
