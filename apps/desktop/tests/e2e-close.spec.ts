/**
 * @module-tag slow
 * Starts real child processes and waits out the close deadline.
 */
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { expect, it, vi } from 'vitest'
import { closeApplication } from '../e2e/close.ts'
import { listProcesses } from '../scripts/release-launch.ts'

const launcherStub = (pid: number | undefined) => ({
  pid,
  exitCode: null as number | null,
  signalCode: null,
  kill: vi.fn<(signal?: NodeJS.Signals | number) => boolean>(() => true),
})

it('正常退出就等它退，已经退了不再给可能被复用的 PID 发信号', async () => {
  const launcher = launcherStub(101)
  const close = vi.fn<() => Promise<void>>(async () => {
    setTimeout(() => {
      launcher.exitCode = 0
    }, 1)
  })
  await closeApplication({ close }, launcher, { pid: 101 })
  await closeApplication({ close }, launcher, { pid: 101 })
  expect(close).toHaveBeenCalledTimes(1)
  expect(launcher.kill).not.toHaveBeenCalled()
})

it('关不掉时先等自己起的子进程真退了，再把原来的失败报出去', async () => {
  const child = spawn(
    process.execPath,
    ['-e', 'console.log("ready"); setInterval(() => {}, 1000)'],
    {
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  )
  const exited = once(child, 'exit')
  const failure = new Error('driver could not close')
  try {
    await once(child.stdout, 'data')
    await expect(
      closeApplication({ close: () => Promise.reject(failure) }, child, { pid: child.pid! }),
    ).rejects.toBe(failure)
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
  } finally {
    child.kill('SIGKILL')
    await exited
  }
})

it('强杀之后也确认不了退出，就留下用户数据目录并报原来的失败', async () => {
  vi.useFakeTimers()
  const keepProfile = vi.fn<() => void>()
  const launcher = { ...launcherStub(undefined), kill: vi.fn(() => false) }
  const failure = new Error('driver could not close')
  try {
    const outcome = closeApplication(
      { close: () => Promise.reject(failure) },
      launcher,
      undefined,
      keepProfile,
    ).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await outcome).toBe(failure)
    expect(launcher.kill).toHaveBeenCalledWith('SIGKILL')
    expect(keepProfile).toHaveBeenCalledOnce()
  } finally {
    vi.useRealTimers()
  }
})

it.skipIf(process.platform === 'win32')(
  '关闭超时时收掉 Playwright 起的整个进程组，别人起的进程不动',
  async () => {
    const awake = 'setTimeout(() => {}, 30000)'
    const fixture = `const cp = require('node:child_process'); console.log(cp.spawn(process.execPath, ['-e', ${JSON.stringify(awake)}], { stdio: 'ignore' }).pid)`
    const other = spawn(process.execPath, ['-e', awake], { detached: true, stdio: 'ignore' })
    const child = spawn(process.execPath, ['-e', fixture], {
      detached: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    try {
      const [line] = (await once(child.stdout, 'data')) as [Buffer]
      const helper = Number(String(line).trim())
      expect(helper).toBeGreaterThan(0)
      await expect(
        closeApplication({ close: () => new Promise<void>(() => {}) }, child),
      ).rejects.toThrow('within 10 seconds')
      expect(listProcesses().some(entry => entry.pid === helper && entry.zombie !== true)).toBe(
        false,
      )
      expect(process.kill(other.pid!, 0)).toBe(true)
    } finally {
      if (child.exitCode === null && child.signalCode === null) process.kill(-child.pid!, 'SIGKILL')
      other.kill('SIGKILL')
    }
  },
  20_000,
)
