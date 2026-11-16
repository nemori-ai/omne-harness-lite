import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { closeSync, mkdirSync, openSync, rmSync, writeSync } from 'node:fs'
import { join } from 'node:path'

export type Command = readonly [string, ...string[]]

export interface CheckStep {
  readonly name: string
  readonly command: Command
  readonly after: readonly string[]
  readonly heavy: boolean
  readonly planned?: boolean
  readonly clean?: readonly string[]
}

export interface StepResult {
  readonly name: string
  readonly exitCode: number
  readonly startedMs: number
  readonly endedMs: number
  readonly logPath: string
  readonly cancelled: boolean
  readonly reason?: string
}

export interface GraphRun {
  readonly results: readonly StepResult[]
  readonly skipped: readonly string[]
  readonly wallMs: number
}

export interface GraphOptions {
  readonly root: string
  readonly logDir: string
  readonly env: NodeJS.ProcessEnv
  readonly lightConcurrency: number
  readonly heavyConcurrency?: number
  readonly keepGoing?: boolean
  readonly onStart?: (step: CheckStep, logPath: string) => void
  readonly onFinish?: (result: StepResult) => void
}

export const logNameOf = (name: string) => `${name.replaceAll(':', '-')}.log`

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
