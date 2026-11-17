import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CPU_METER,
  cpuMeterAvailable,
  meteredArgs,
  readMeteredCpu,
} from '../src/testing/cpu-meter.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function scratch(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cpu-meter-')))
  dirs.push(dir)
  return dir
}

const BURN = (ms: number, exit: number) =>
  `const t = Date.now(); while (Date.now() - t < ${ms}) {} process.exit(${exit})`

describe('计 CPU 的启动器', () => {
  it.skipIf(!cpuMeterAvailable())(
    '等被起的命令结束，记下它整棵进程树用的 CPU 秒，原样带回它的退出码',
    () => {
      const result = join(scratch(), 'cpu.json')
      const run = spawnSync(
        process.execPath,
        meteredArgs(result, process.execPath, ['-e', BURN(400, 3)]),
        { encoding: 'utf8' },
      )
      expect(run.status).toBe(3)
      expect(readMeteredCpu(result)).toBeGreaterThanOrEqual(0.2)
    },
  )

  it.skipIf(!cpuMeterAvailable())('孙进程的 CPU 也算在里面', () => {
    const result = join(scratch(), 'cpu.json')
    const grandchild = `require('node:child_process').spawnSync(process.execPath, ['-e', ${JSON.stringify(BURN(400, 0))}])`
    const run = spawnSync(
      process.execPath,
      meteredArgs(result, process.execPath, ['-e', grandchild]),
      { encoding: 'utf8' },
    )
    expect(run.status).toBe(0)
    expect(readMeteredCpu(result)).toBeGreaterThanOrEqual(0.2)
  })

  it('参数不对时以 2 退出，不起任何命令', () => {
    const run = spawnSync(process.execPath, ['--experimental-strip-types', CPU_METER, 'x.json'], {
      encoding: 'utf8',
    })
    expect(run.status).toBe(2)
    expect(run.stderr).toContain('用法')
  })

  it('读结果：没有文件、不是 JSON、不是非负数都按没量到算', () => {
    const dir = scratch()
    const at = (text: string) => {
      writeFileSync(join(dir, 'r.json'), text)
      return join(dir, 'r.json')
    }
    expect(readMeteredCpu(join(dir, 'absent.json'))).toBeUndefined()
    expect(readMeteredCpu(at('{'))).toBeUndefined()
    expect(readMeteredCpu(at('{"cpuSeconds":-1}'))).toBeUndefined()
    expect(readMeteredCpu(at('{"cpuSeconds":"1"}'))).toBeUndefined()
    expect(readMeteredCpu(at('{"cpuSeconds":1.5}'))).toBe(1.5)
  })

  it('只在 Linux 上有：别的平台运行器照旧直接起命令', () => {
    expect(cpuMeterAvailable('darwin')).toBe(false)
    expect(cpuMeterAvailable('win32')).toBe(false)
  })
})
