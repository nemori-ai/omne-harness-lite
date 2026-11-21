import { ChildProcess, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { linuxSandboxBlocker } from '../scripts/launch.ts'
import { packagedBinary } from '../scripts/packaged-path.ts'
import { startRelease } from '../scripts/start.ts'

vi.mock('node:child_process', { spy: true })
vi.mock('node:fs', { spy: true })
vi.mock('../scripts/launch.ts', { spy: true })
vi.mock('../scripts/packaged-path.ts', { spy: true })

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

function fixture() {
  const executable = join('out', 'release', 'omne')
  vi.mocked(packagedBinary).mockReturnValue(executable)
  vi.mocked(existsSync).mockReturnValue(true)
  vi.mocked(linuxSandboxBlocker).mockReturnValue(undefined)
  const child = new ChildProcess()
  vi.mocked(spawn).mockReturnValue(child)
  return { child, executable }
}

it.each([[], ['--user-data-dir=directory with spaces', '--extra']])(
  '起发行包时只带调用方给的参数，一个不加：%j',
  async (...args) => {
    const { child, executable } = fixture()
    const finished = startRelease(args)
    expect(packagedBinary).toHaveBeenCalledWith('release')
    expect(spawn).toHaveBeenCalledWith(executable, args, {
      cwd: join('out', 'release'),
      stdio: 'inherit',
    })
    child.emit('exit', 17, null)
    await expect(finished).resolves.toBe(17)
  },
)

it('还没打包就说该跑哪条命令，不退回裸的 Electron', async () => {
  fixture()
  vi.mocked(existsSync).mockReturnValue(false)
  await expect(startRelease([])).rejects.toThrow('pnpm run package')
  expect(spawn).not.toHaveBeenCalled()
})

it.runIf(process.platform === 'linux')('沙箱起不来就不起，带了 --no-sandbox 也一样', async () => {
  fixture()
  vi.mocked(linuxSandboxBlocker).mockReturnValue('sandbox unavailable')
  await expect(startRelease(['--no-sandbox'])).rejects.toThrow('sandbox unavailable')
  expect(spawn).not.toHaveBeenCalled()
})

it.skipIf(process.platform === 'win32')(
  '被信号结束时按 shell 的惯例返回 128 加信号号',
  async () => {
    const { child } = fixture()
    const finished = startRelease([])
    child.emit('exit', null, 'SIGTERM')
    await expect(finished).resolves.toBe(143)
  },
)

it('起不来时报出原因', async () => {
  const { child } = fixture()
  const finished = startRelease([])
  child.emit('error', new Error('EACCES'))
  await expect(finished).rejects.toThrow('EACCES')
})
