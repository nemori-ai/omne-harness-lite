import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { constants } from 'node:os'
import { fileURLToPath } from 'node:url'

export const CPU_METER = fileURLToPath(import.meta.url)

export function cpuMeterAvailable(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'linux' && existsSync('/proc/self/stat')
}

function ticksPerSecond(): number {
  const run = spawnSync('getconf', ['CLK_TCK'], { encoding: 'utf8' })
  const value = Number(run.stdout?.trim())
  return Number.isFinite(value) && value > 0 ? value : 100
}

function reapedChildrenTicks(): number {
  const fields = readFileSync('/proc/self/stat', 'utf8').split(') ')[1]?.split(' ') ?? []
  return Number(fields[13]) + Number(fields[14])
}

export function meteredArgs(
  resultFile: string,
  command: string,
  args: readonly string[],
): string[] {
  return ['--experimental-strip-types', CPU_METER, resultFile, '--', command, ...args]
}

export function readMeteredCpu(resultFile: string): number | undefined {
  try {
    const parsed = JSON.parse(readFileSync(resultFile, 'utf8')) as { cpuSeconds?: unknown }
    return typeof parsed.cpuSeconds === 'number' && parsed.cpuSeconds >= 0
      ? parsed.cpuSeconds
      : undefined
  } catch {
    return undefined
  }
}

async function main(argv: readonly string[]): Promise<number> {
  const [resultFile, separator, command, ...args] = argv
  if (resultFile === undefined || separator !== '--' || command === undefined) {
    process.stderr.write('用法：cpu-meter.ts <结果文件> -- <命令> [参数…]\n')
    return 2
  }
  const ticks = ticksPerSecond()
  const before = reapedChildrenTicks()
  const child = spawn(command, args, { stdio: 'inherit' })
  const forward = (signal: NodeJS.Signals) => child.kill(signal)
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, forward)
  const code = await new Promise<number>(settle => {
    child.once('error', error => {
      process.stderr.write(`cpu-meter: ${command}: ${error.message}\n`)
      settle(127)
    })
    child.once('exit', (exitCode, signal) =>
      settle(exitCode ?? 128 + (signal === null ? 1 : (constants.signals[signal] ?? 1))),
    )
  })
  const cpuSeconds = Math.round(((reapedChildrenTicks() - before) / ticks) * 100) / 100
  writeFileSync(resultFile, `${JSON.stringify({ cpuSeconds })}\n`)
  return code
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)))
