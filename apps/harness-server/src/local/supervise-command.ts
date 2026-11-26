import { spawn, type ChildProcess } from 'node:child_process'
import {
  beginSupervision,
  supervise,
  type SuperviseAction,
  type SuperviseConfig,
  type SuperviseEvent,
  type Supervision,
} from '@omne-harness/assembly'
import { monotonicClock, type Timer } from '../shutdown.ts'
import { UsageError } from './serve-command.ts'

export const SUPERVISE_USAGE =
  'usage: supervise [--fall-limit <n>] [--stable-ms <n>] [--backoff-base-ms <n>] [--backoff-max-ms <n>] [--stop-on-stdin-close] [serve options]'

const OWN = {
  '--fall-limit': 2,
  '--stable-ms': 30_000,
  '--backoff-base-ms': 500,
  '--backoff-max-ms': 5_000,
} as const
type Own = keyof typeof OWN
const STDIN_FLAG = '--stop-on-stdin-close'
const ACCEPTING = /"kind":"startup-result"[^\n]*"accepting":true/

type Plan = Readonly<{
  numbers: Record<Own, number>
  stopOnStdinClose: boolean
  serveArgs: readonly string[]
}>

export function supervisePlan(argv: readonly string[]): Plan {
  const numbers: Record<Own, number> = { ...OWN }
  const serveArgs: string[] = []
  let stopOnStdinClose = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string
    if (arg === STDIN_FLAG) stopOnStdinClose = true
    else if (arg in OWN) {
      const value = Number(argv[(index += 1)])
      if (!Number.isInteger(value) || value <= 0)
        throw new UsageError(`${arg} must be a positive integer`)
      numbers[arg as Own] = value
    } else serveArgs.push(arg)
  }
  return { numbers, stopOnStdinClose, serveArgs }
}

type Io = Readonly<{
  start: (serveArgs: readonly string[]) => ChildProcess
  stdout: (chunk: string) => void
  stderr: (line: string) => void
  onStop: (stop: (reason: string) => void) => () => void
}>

const leftAs = (code: number | null, signal: string | null): string =>
  code === null ? `(killed by ${signal ?? 'a signal'})` : `with ${String(code)}`

/** Keeps one `serve` up by the rules of the assembly's supervision; resolves with the code to end with. */
export function runSupervisor(plan: Plan, io: Io): Promise<number> {
  const config: SuperviseConfig = {
    fallLimit: plan.numbers['--fall-limit'],
    backoffBaseMs: plan.numbers['--backoff-base-ms'],
    backoffMaxMs: plan.numbers['--backoff-max-ms'],
  }
  return new Promise(resolve => {
    let state: Supervision = beginSupervision().state
    let child: ChildProcess | undefined
    let wait: Timer | undefined
    let settle: Timer | undefined
    let left = 'with 0'
    const say = (line: string) => io.stderr(`supervise: ${line}`)

    const dispatch = (event: SuperviseEvent): void => {
      const step = supervise(state, event, config)
      state = step.state
      for (const action of step.actions) act(action)
      if (state.kind !== 'held' && state.kind !== 'stopped') return
      offStop()
      resolve(state.code ?? (state.kind === 'held' ? 1 : 0))
    }
    const startChild = (): void => {
      const started = io.start(plan.serveArgs)
      child = started
      say(`started serve, process ${String(started.pid)}`)
      let seen = ''
      started.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
        io.stdout(chunk)
        if (settle !== undefined || child !== started) return
        seen = (seen + chunk).slice(-4096)
        if (!ACCEPTING.test(seen)) return
        const timer = monotonicClock.after(plan.numbers['--stable-ms'])
        settle = timer
        void timer.promise.then(() => settle === timer && dispatch({ kind: 'settled' }))
      })
      started.once('exit', (code, signal) => {
        settle?.cancel()
        settle = undefined
        child = undefined
        left = leftAs(code, signal)
        dispatch({ kind: 'exited', code })
      })
    }
    const act = (action: SuperviseAction): void => {
      switch (action.kind) {
        case 'start':
          return startChild()
        case 'wait': {
          say(`serve left ${left}; starting it again in ${String(action.ms)} ms`)
          const timer = monotonicClock.after(action.ms)
          wait = timer
          void timer.promise.then(() => wait === timer && dispatch({ kind: 'waited' }))
          return
        }
        case 'cancel-wait':
          wait?.cancel()
          wait = undefined
          return
        case 'stop-child':
          // The child was started to stop when its standard input closes: the one way that works on every platform.
          child?.stdin?.end()
          return
        case 'give-up':
          return say(
            action.reason === 'configuration'
              ? `serve left ${left}: a configuration error; it is not started again`
              : `serve left ${left}, ${String(config.fallLimit)} times in a row before it settled; it is not started again`,
          )
      }
    }
    const offStop = io.onStop(reason => {
      say(`stop requested: ${reason}`)
      dispatch({ kind: 'stop' })
    })
    startChild()
  })
}

/** `harness-server supervise`: a small parent that starts `serve` and starts it again by its exit code. */
export async function superviseCommand(argv: readonly string[], bin: string): Promise<number> {
  const plan = supervisePlan(argv)
  const keepAlive = setInterval(() => {}, 1 << 30)
  try {
    return await runSupervisor(plan, {
      start: serveArgs =>
        spawn(process.execPath, [bin, 'serve', ...serveArgs, STDIN_FLAG], {
          stdio: ['pipe', 'pipe', 'inherit'],
        }),
      stdout: chunk => void process.stdout.write(chunk),
      stderr: line => void process.stderr.write(`${line}\n`),
      onStop(stop) {
        const onSigint = () => stop('SIGINT')
        const onSigterm = () => stop('SIGTERM')
        const onStdin = () => stop('stdin closed')
        process.once('SIGINT', onSigint)
        process.once('SIGTERM', onSigterm)
        if (plan.stopOnStdinClose)
          process.stdin.once('end', onStdin).once('close', onStdin).resume()
        return () => {
          process.off('SIGINT', onSigint)
          process.off('SIGTERM', onSigterm)
          if (plan.stopOnStdinClose) process.stdin.destroy()
        }
      },
    })
  } finally {
    clearInterval(keepAlive)
  }
}
