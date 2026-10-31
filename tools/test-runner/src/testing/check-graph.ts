// `pnpm run check` 的步骤图运行器：步骤只声明「先于我完成的步骤」，没有依赖的就同时跑。
// 重步骤（构建、类型检查、成员测试、验收）自己按预算起多进程把机器占满，所以同时至多 `heavyConcurrency` 个（缺省 1）；
// 轻步骤（含 pytest；pytest 自己用 xdist 起预算四分之一的进程）受 `lightConcurrency` 限制，免得在核少的机器上把重步骤挤慢；两类步骤同等优先级：
// 把轻步骤降级量过（24 核），pytest 与 check:docs 这些关键路径上的轻步骤被挤慢 40% 到 100%，重步骤早完成的时间全空等。
// 任一步失败：不再起新步骤，正在跑的整棵进程树终止，退出码取第一个失败的那一步；`keepGoing` 时其余照跑，依赖失败步骤的不启动。
// 每步的输出落自己的日志。
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { closeSync, mkdirSync, openSync, rmSync, writeSync } from 'node:fs'
import { join } from 'node:path'

/** 一条命令：可执行文件与参数，至少有可执行文件。 */
export type Command = readonly [string, ...string[]]

export interface CheckStep {
  readonly name: string
  readonly command: Command
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
  /** -1：起不来或被信号结束，`reason` 写原因。 */
  readonly exitCode: number
  /** 相对整张图开始的毫秒。 */
  readonly startedMs: number
  readonly endedMs: number
  readonly logPath: string
  /** 因别的步骤失败而被终止。 */
  readonly cancelled: boolean
  /** 起不来（spawn 出错、日志打不开、要清的目录删不掉）或被信号结束时的原因；正常退出没有。 */
  readonly reason?: string
}

export interface GraphRun {
  /** 按结束顺序。没开始的步骤不在内。 */
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

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

export async function runGraph(
  steps: readonly CheckStep[],
  options: GraphOptions,
): Promise<GraphRun> {
  checkGraph(steps)
  const heavyConcurrency = options.heavyConcurrency ?? 1
  if (options.lightConcurrency < 1 || heavyConcurrency < 1)
    throw new Error('轻、重步骤的并发都至少为 1，否则有步骤永远起不了')
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

  const ready = (step: CheckStep) =>
    step.after.every(name => finished.get(name)?.exitCode === 0) &&
    (step.heavy ? heavyRunning < heavyConcurrency : lightRunning < options.lightConcurrency)

  const terminateAll = () => {
    for (const [name, child] of running) {
      terminated.add(name)
      terminate(child)
    }
  }
  // 运行器自己被打断时把正在跑的整棵树都终止：子进程在 POSIX 上自成进程组，终端的信号到不了它们。
  const onSignal = () => {
    terminateAll()
    process.exitCode = 130
  }
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, onSignal)

  const launch = (step: CheckStep): Promise<void> => {
    pending.delete(step.name)
    if (step.heavy) heavyRunning += 1
    else lightRunning += 1
    const logPath = join(options.logDir, logNameOf(step.name))
    const startedMs = Date.now() - started
    let settled = false
    return new Promise(resolve => {
      const settle = (exitCode: number, reason?: string, log?: number) => {
        if (settled) return
        settled = true
        running.delete(step.name)
        if (log !== undefined) closeSync(log)
        if (step.heavy) heavyRunning -= 1
        else lightRunning -= 1
        const result: StepResult = {
          name: step.name,
          exitCode,
          startedMs,
          endedMs: Date.now() - started,
          logPath,
          cancelled: terminated.has(step.name),
          ...(reason === undefined ? {} : { reason }),
        }
        finished.set(step.name, result)
        results.push(result)
        options.onFinish?.(result)
        if (exitCode !== 0 && !failed) {
          failed = true
          if (options.keepGoing !== true) terminateAll()
        }
        resolve()
      }
      // 起不来的原因也写进这一步的日志，日志读者不必再找别处。
      const failToStart = (reason: string, log?: number) => {
        if (log !== undefined) writeSync(log, `${reason}\n`)
        settle(-1, reason, log)
      }
      let log: number | undefined
      try {
        for (const directory of step.clean ?? [])
          rmSync(join(options.root, directory), { recursive: true, force: true })
        log = openSync(logPath, 'w')
        options.onStart?.(step, logPath)
        const [command, ...args] = step.command
        const child = spawn(command, args, {
          cwd: options.root,
          env: options.env,
          stdio: ['ignore', log, log],
          detached: process.platform !== 'win32',
        })
        running.set(step.name, child)
        const opened = log
        child.once('error', error => failToStart(`起不来：${message(error)}`, opened))
        child.once('exit', (code, signal) =>
          settle(code ?? -1, signal === null ? undefined : `被信号 ${signal} 结束`, opened),
        )
      } catch (error) {
        failToStart(`起不来：${message(error)}`, log)
      }
    })
  }

  const inFlight = new Set<Promise<void>>()
  try {
    while (pending.size > 0 || inFlight.size > 0) {
      if (!failed || options.keepGoing === true)
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
  } finally {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.off(signal, onSignal)
  }
  return { results, skipped: [...pending], wallMs: Date.now() - started }
}
