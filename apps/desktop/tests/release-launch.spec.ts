/**
 * @module-tag slow
 * Starts real child processes and waits for them to end.
 */
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { finish, launch } from '../scripts/release-launch.ts'

// Matched by descent and process group only: by path it would claim every Node process tests start.
const location = { command: '/nonexistent/omne', processDir: '/nonexistent' }

it('起不来的可执行文件把原因报出来，不当成一次空跑', async () => {
  const command = join(dirname(process.execPath), 'missing-verify-release-fixture')
  await expect(launch(command, [], location, { deadlineMs: 100 })).rejects.toMatchObject({
    code: 'ENOENT',
  })
})

it.skipIf(process.platform === 'win32')('没有执行权限的文件报 EACCES', async () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'verify-spawn-')))
  try {
    const command = join(directory, 'app')
    writeFileSync(command, '', { mode: 0o600 })
    await expect(launch(command, [], location, { deadlineMs: 100 })).rejects.toMatchObject({
      code: 'EACCES',
    })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

it.skipIf(process.platform === 'win32')(
  '进程组停不掉时检查照样结束，但不把它算作已退出',
  async () => {
    const started = await launch(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      location,
      {
        deadlineMs: 100,
        stopGraceMs: 100,
      },
    )
    const kill = process.kill.bind(process)
    const stop = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      if (pid === -started.app.pid) throw Object.assign(new Error('cannot stop'), { code: 'EPERM' })
      return kill(pid, signal)
    })
    try {
      await expect(started.app.exited).resolves.toMatchObject({ timedOut: true })
      expect(stop).toHaveBeenCalledWith(-started.app.pid, 'SIGKILL')
      expect(started.app.isRunning()).toBe(true)
      await expect(finish(started)).rejects.toThrow('could not confirm the exit')
    } finally {
      stop.mockRestore()
      kill(started.app.pid, 'SIGKILL')
      await vi.waitFor(() => expect(started.app.isRunning()).toBe(false))
      await finish(started)
    }
  },
)

it.skipIf(process.platform === 'win32')(
  '杀不掉的辅助进程一直记着，等后来真停掉了才放下',
  async () => {
    const script = `
      const { spawn } = require('node:child_process')
      const helper = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' })
      console.log(helper.pid)
      helper.unref()
    `
    const started = await launch(process.execPath, ['-e', script], location, { deadlineMs: 10_000 })
    await started.app.exited
    const pid = Number(started.app.stdout().trim())
    expect(pid).toBeGreaterThan(0)
    const kill = process.kill.bind(process)
    const refuse = vi.spyOn(process, 'kill').mockImplementation((target, signal) => {
      if (target === pid && signal === 'SIGKILL')
        throw Object.assign(new Error('access denied'), { code: 'EPERM' })
      return kill(target, signal)
    })
    try {
      await expect(finish(started, [], 100)).rejects.toThrow(
        `could not confirm the exit of helpers after killing them: ${pid}`,
      )
      expect(kill(pid, 0)).toBe(true)
    } finally {
      refuse.mockRestore()
      const stopped = await finish(started, [], 250)
      expect(stopped.map(entry => entry.pid)).toContain(pid)
    }
  },
  30_000,
)
