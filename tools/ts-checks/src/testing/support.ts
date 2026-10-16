// 测试运行入口与变异入口共用的几件事：读命令行参数、运行目录的时间戳、先把目标成员连同依赖构建一遍。
import { admissionRequested, turboBuildCaptured } from './turbo.ts'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestMember } from '../core/workspace.ts'

export interface Flags {
  readonly values: ReadonlyMap<string, string>
  readonly switches: ReadonlySet<string>
}

/** `valued` 里的参数各带一个值，`switches` 里的不带；认不出的参数连同用法一起报错。 */
export function parseFlags(
  argv: readonly string[],
  valued: readonly string[],
  switches: readonly string[],
  usage: string,
): Flags {
  const values = new Map<string, string>()
  const seen = new Set<string>()
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? ''
    if (switches.includes(arg)) seen.add(arg)
    else if (valued.includes(arg)) {
      const value = argv[index + 1]
      if (value === undefined || value === '') throw new Error(`${arg} 需要一个值`)
      values.set(arg, value)
      index += 1
    } else throw new Error(`未知参数 ${arg}\n${usage}`)
  }
  return { values, switches: seen }
}

export function timestamp(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  )
}

/** 测试跑的是依赖的 dist：把目标成员连同它们的依赖构建一遍。构建失败返回 false，日志落在运行目录。 */
export function buildTargets(
  root: string,
  targets: readonly TestMember[],
  runDir: string,
): boolean {
  const started = Date.now()
  process.stdout.write(`构建 ${targets.length} 个成员及其依赖 …`)
  const built = turboBuildCaptured(
    root,
    targets.map(member => member.name),
    admissionRequested(process.env),
  )
  const buildLog = join(runDir, 'build.log')
  writeFileSync(buildLog, built.output)
  console.log(` ${Math.round((Date.now() - started) / 1000)} 秒`)
  if (built.status === 0) return true
  console.log(`构建失败（退出码 ${built.status ?? -1}），没有运行。日志：${buildLog}`)
  return false
}
