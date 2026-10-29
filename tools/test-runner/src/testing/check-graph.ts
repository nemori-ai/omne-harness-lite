// `pnpm run check` 的步骤图运行器：步骤只声明「先于我完成的步骤」，没有依赖的就同时跑。
// 重负载的步骤（构建、类型检查、成员测试、验收、pytest）自己按预算起多进程，不受这里的并发限制；
// 轻负载的单线程检查受 `lightConcurrency` 限制，免得在核少的机器上把重步骤挤慢。
// 任一步失败：不再起新步骤，正在跑的整棵进程树终止，退出码取第一个失败的那一步。每步的输出落自己的日志。
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { closeSync, mkdirSync, openSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export interface CheckStep {
  readonly name: string
  /** 可执行文件与参数。 */
  readonly command: readonly string[]
  /** 先于本步完成的步骤名。 */
  readonly after: readonly string[]
  /** 自己按预算起多进程的步骤；轻步骤受 `lightConcurrency` 限制。 */
  readonly heavy: boolean
  /** 按计划跑的步骤（跑不跑、跑哪些成员由影响面计划定）；其余是每次都跑的常驻检查。 */
  readonly planned?: boolean
  /** 开始前整个删掉的目录（相对根）。 */
  readonly clean?: readonly string[]
}

export interface StepResult {
  readonly name: string
  /** -1：起不来或被终止。 */
  readonly exitCode: number
  /** 相对整张图开始的毫秒。 */
  readonly startedMs: number
  readonly endedMs: number
  readonly logPath: string
  /** 因别的步骤失败而被终止。 */
  readonly cancelled: boolean
}

export interface GraphRun {
  /** 按开始顺序。没开始的步骤不在内。 */
  readonly results: readonly StepResult[]
  /** 因失败而没有开始的步骤名。 */
  readonly skipped: readonly string[]
  readonly wallMs: number
}

export interface GraphOptions {
  readonly root: string
  readonly logDir: string
  readonly env: NodeJS.ProcessEnv
  readonly lightConcurrency: number
  /**
   * 同时跑几个重步骤，缺省 1：重步骤各自按预算把机器占满，两个一起只会互相挤、让预算采样看到对方的尖峰。
   * 轻步骤不占这条道。
   */
  readonly heavyConcurrency?: number
  /** 一步失败后继续跑别的步骤（依赖失败的仍不启动），用于一次看全部失败；缺省失败即终止其余。 */
  readonly keepGoing?: boolean
  readonly onStart?: (step: CheckStep, logPath: string) => void
  readonly onFinish?: (result: StepResult) => void
}

/** 日志文件名：步骤名里的 `:` 换成 `-`。 */
export const logNameOf = (name: string) => `${name.replaceAll(':', '-')}.log`

/** 核对步骤图：名字唯一、依赖都存在、没有环。 */
export function checkGraph(steps: readonly CheckStep[]): void {
  const names = new Set<string>()
  for (const step of steps) {
    if (names.has(step.name)) throw new Error(`步骤名重复：${step.name}`)
    names.add(step.name)
  }
  for (const step of steps)
    for (const dependency of step.after)
      if (!names.has(dependency)) throw new Error(`步骤 ${step.name} 依赖不存在的 ${dependency}`)
  const visiting = new Set<string>()
  const done = new Set<string>()
  const byName = new Map(steps.map(step => [step.name, step]))
  const visit = (name: string) => {
    if (done.has(name)) return
    if (visiting.has(name)) throw new Error(`步骤图有环，经过 ${name}`)
    visiting.add(name)
    for (const dependency of byName.get(name)?.after ?? []) visit(dependency)
    visiting.delete(name)
    done.add(name)
  }
  for (const step of steps) visit(step.name)
}

/** 终止整棵进程树：Windows 用 taskkill，POSIX 给进程组发 SIGTERM（子进程以 detached 起，自成一组）。 */
function terminate(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

export async function runGraph(
  steps: readonly CheckStep[],
  options: GraphOptions,
): Promise<GraphRun> {
  checkGraph(steps)
  mkdirSync(options.logDir, { recursive: true })
  const started = Date.now()
  const finished = new Map<string, StepResult>()
  const running = new Map<string, ChildProcess>()
  const pending = new Set(steps.map(step => step.name))
  const byName = new Map(steps.map(step => [step.name, step]))
  const results: StepResult[] = []
  const terminated = new Set<string>()
  let failed = false
  let lightRunning = 0
  let heavyRunning = 0
  const heavyConcurrency = options.heavyConcurrency ?? 1

  const ready = (step: CheckStep) =>
    step.after.every(name => finished.get(name)?.exitCode === 0) &&
    (step.heavy ? heavyRunning < heavyConcurrency : lightRunning < options.lightConcurrency)

  const launch = (step: CheckStep): Promise<void> => {
    pending.delete(step.name)
    if (step.heavy) heavyRunning += 1
    else lightRunning += 1
    for (const directory of step.clean ?? [])
      rmSync(join(options.root, directory), { recursive: true, force: true })
    const logPath = join(options.logDir, logNameOf(step.name))
    const log = openSync(logPath, 'w')
    const startedMs = Date.now() - started
    options.onStart?.(step, logPath)
    const [command, ...args] = step.command
    const child = spawn(command ?? '', args, {
      cwd: options.root,
      env: options.env,
      stdio: ['ignore', log, log],
      detached: process.platform !== 'win32',
    })
    running.set(step.name, child)
    return new Promise(resolve => {
      const settle = (exitCode: number) => {
        running.delete(step.name)
        closeSync(log)
        if (step.heavy) heavyRunning -= 1
        else lightRunning -= 1
        const result: StepResult = {
          name: step.name,
          exitCode,
          startedMs,
          endedMs: Date.now() - started,
          logPath,
          cancelled: terminated.has(step.name),
        }
        finished.set(step.name, result)
        results.push(result)
        options.onFinish?.(result)
        if (exitCode !== 0 && !failed) {
          failed = true
          if (options.keepGoing !== true)
            for (const [name, other] of running) {
              terminated.add(name)
              terminate(other)
            }
        }
        resolve()
      }
      child.once('error', () => settle(-1))
      child.once('exit', code => settle(code ?? -1))
    })
  }

  const inFlight = new Set<Promise<void>>()
  while (pending.size > 0 || inFlight.size > 0) {
    if (!failed)
      for (const name of pending) {
        const step = byName.get(name)
        if (step !== undefined && ready(step)) {
          const promise = launch(step).then(() => {
            inFlight.delete(promise)
          })
          inFlight.add(promise)
        }
      }
    if (inFlight.size === 0) break
    await Promise.race(inFlight)
  }
  return { results, skipped: [...pending], wallMs: Date.now() - started }
}
