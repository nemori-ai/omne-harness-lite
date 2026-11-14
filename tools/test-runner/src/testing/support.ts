import { admissionRequested, turboBuildCaptured } from './turbo.ts'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestMember } from '@omne-harness/repo-toolchain/core/workspace'

export interface Flags {
  readonly values: ReadonlyMap<string, string>
  readonly switches: ReadonlySet<string>
}

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

export function buildTargets(
  root: string,
  targets: readonly TestMember[],
  runDir: string,
  concurrency: number,
): boolean {
  const started = Date.now()
  process.stdout.write(`构建 ${targets.length} 个成员及其依赖 …`)
  const built = turboBuildCaptured(
    root,
    targets.map(member => member.name),
    admissionRequested(process.env),
    concurrency,
  )
  const buildLog = join(runDir, 'build.log')
  writeFileSync(buildLog, built.output)
  console.log(` ${Math.round((Date.now() - started) / 1000)} 秒`)
  if (built.status === 0) return true
  console.log(`构建失败（退出码 ${built.status ?? -1}），没有运行。日志：${buildLog}`)
  return false
}

export interface Command {
  readonly command: string
  readonly args: readonly string[]
}

export interface PnpmHost {
  readonly platform: NodeJS.Platform
  readonly path: string
  readonly execPath: string
}

export function pnpmCommand(host: Partial<PnpmHost> = {}): Command {
  const platform = host.platform ?? process.platform
  if (platform !== 'win32') return { command: 'pnpm', args: [] }
  const path = host.path ?? process.env['PATH'] ?? process.env['Path'] ?? ''
  const execPath = host.execPath ?? process.execPath
  const searched: string[] = []
  for (const directory of path.split(';')) {
    if (directory === '') continue
    const exe = join(directory, 'pnpm.exe')
    if (existsSync(exe)) return { command: exe, args: [] }
    if (!existsSync(join(directory, 'pnpm.cmd'))) {
      searched.push(`${directory}（没有 pnpm.exe，也没有 pnpm.cmd）`)
      continue
    }
    const entry = join(directory, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
    if (existsSync(entry)) return { command: execPath, args: [entry] }
    searched.push(`${directory}（有 pnpm.cmd，旁边没有 node_modules/pnpm/bin/pnpm.cjs）`)
  }
  throw new Error(
    searched.length === 0
      ? 'PATH 里没有可找的目录，起不了 pnpm'
      : `PATH 里找不到能起的 pnpm，找过的目录：${searched.join('；')}`,
  )
}
