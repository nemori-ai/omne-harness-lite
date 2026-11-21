/**
 * @module-tag slow
 * Starts real child processes and waits for them and their helpers to end.
 */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { dirname, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { monitorTestChild } from '../scripts/child-run.ts'

// Node itself plays the app: only processes carrying the launch's own user data marker are claimed
// by path, so the other Node processes of a test run are never touched.
const spec = {
  command: process.execPath,
  processDir: dirname(process.execPath),
  profile: 'test',
} as const
// Windows puts ordinary children in a job that ends them with their parent: these helpers must outlive it.
const helperDetached = process.platform === 'win32'
const profile = 'console.log(JSON.stringify({process:"main",buildProfile:"test"}));'
const now = () => /* wall-clock: observation-time -- compared with process start times */ Date.now()

function run(script: string, options: Parameters<typeof monitorTestChild>[3] = {}) {
  const spawnedAt = now()
  const child = spawn(process.execPath, ['-e', script], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  })
  return monitorTestChild(child, spec, spawnedAt, options)
}

describe('测试启动的输出与收尾', () => {
  it('起不来就以原因失败，不等退出', async () => {
    const spawnedAt = now()
    const child = spawn(join(dirname(process.execPath), 'no-such-electron-fixture'), [], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const monitor = monitorTestChild(child, spec, spawnedAt)
    await expect(monitor.finished).rejects.toThrow(/ENOENT|ENOTDIR/)
    await expect(monitor.reap()).resolves.toEqual([])
  })

  it('报的构建档不对就失败并结束它', async () => {
    const monitor = run(
      'console.log(JSON.stringify({process:"main",buildProfile:"release"})); setInterval(()=>{}, 1000)',
      { drainMs: 200 },
    )
    await expect(monitor.finished).rejects.toThrow('build profile release, expected test')
    await monitor.reap()
  }, 15_000)

  it('杀不掉也会收场并关掉管道', async () => {
    const spawnedAt = now()
    // No group of its own; on Windows a missing taskkill takes the same fallback.
    const child = spawn(process.execPath, ['-e', 'setInterval(()=>{}, 1000)'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const closed = once(child, 'close')
    const stop = vi.spyOn(child, 'kill').mockReturnValue(false)
    const monitor = monitorTestChild(child, spec, spawnedAt, { drainMs: 50 })
    try {
      if (process.platform === 'win32') vi.stubEnv('PATH', '')
      monitor.abort(new Error('interrupted launch'))
      await expect(monitor.finished).rejects.toThrow('interrupted launch')
      vi.unstubAllEnvs()
      expect(stop).toHaveBeenCalledWith('SIGKILL')
      expect([child.stdin, child.stdout, child.stderr].every(pipe => pipe.destroyed)).toBe(true)
      await expect(monitor.reap()).rejects.toThrow(
        `main process ${child.pid} is still running after cleanup`,
      )
    } finally {
      vi.unstubAllEnvs()
      stop.mockRestore()
      child.kill('SIGKILL')
      await closed
    }
  }, 30_000)

  it('主进程退出后辅助进程占着输出，等一段有限的时间就收场', async () => {
    const script =
      profile +
      `require("node:child_process").spawn(process.execPath, ["-e","setTimeout(()=>{}, 10000)"], {stdio:["ignore",1,2], detached:${helperDetached}}).unref();`
    const monitor = run(script, { drainMs: 150 })
    await expect(monitor.finished).rejects.toThrow('helpers kept its output open')
    await monitor.reap()
  }, 15_000)

  it('收掉自己脱离了的辅助进程，同一可执行文件起的别的进程不碰', async () => {
    const marker = join(dirname(process.execPath), randomUUID())
    let helperPid = 0
    const spawnedAt = now()
    const child = spawn(
      process.execPath,
      [
        '-e',
        profile +
          `const c = require("node:child_process").spawn(process.execPath, ["-e", "setTimeout(()=>{}, 20000)", "--", "--user-data-dir=${marker}"], {stdio:"ignore", detached:true});` +
          'console.log("helper=" + c.pid); c.unref(); process.stdin.resume(); process.stdin.on("end",()=>{});',
        '--',
        `--user-data-dir=${marker}`,
      ],
      { detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] },
    )
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      const found = /helper=(\d+)/.exec(chunk)
      if (found) helperPid = Number(found[1])
    })
    const monitor = monitorTestChild(child, spec, spawnedAt, { userDataDir: marker, drainMs: 300 })
    const other = spawn(
      process.execPath,
      ['-e', 'setTimeout(()=>{}, 20000)', '--', `--user-data-dir=${marker}-other`],
      { detached: process.platform !== 'win32', stdio: 'ignore' },
    )
    const closed = once(other, 'close')
    try {
      child.stdin.end()
      await expect(monitor.finished).resolves.toBe(0)
      expect(helperPid).toBeGreaterThan(0)
      await expect(monitor.reap()).resolves.toEqual([helperPid])
      await expect(monitor.reap()).resolves.toEqual([])
      expect(other.exitCode).toBeNull()
      expect(() => process.kill(other.pid!, 0)).not.toThrow()
    } finally {
      other.kill('SIGKILL')
      await closed
    }
  }, 20_000)
})
