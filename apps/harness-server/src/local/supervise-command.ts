import { spawn, type ChildProcess } from 'node:child_process'
import { isAbsolute } from 'node:path'
import {
  beginSupervision,
  supervise,
  type SuperviseAction,
  type SuperviseConfig,
  type SuperviseEvent,
  type Supervision,
} from '@omne-harness/assembly'
import { monotonicClock, type Timer } from '../shutdown.ts'
import { entryOfVersion } from './install-root.ts'
import { readVersions, tellVersions, type Told } from '@omne-harness/assembly-cordis'
import { UsageError } from './serve-command.ts'

export const SUPERVISE_USAGE =
  'usage: supervise [--install-root <abs dir>] [--fall-limit <n>] [--stable-ms <n>] [--backoff-base-ms <n>] [--backoff-max-ms <n>] [--stop-on-stdin-close] [serve options]'

const OWN = {
  '--fall-limit': 3,
  '--stable-ms': 30_000,
  '--backoff-base-ms': 500,
  '--backoff-max-ms': 5_000,
} as const
type Own = keyof typeof OWN
const STDIN_FLAG = '--stop-on-stdin-close'
const ROOT_FLAG = '--install-root'
const ACCEPTING = /"kind":"startup-result"[^\n]*"accepting":true/

type Plan = Readonly<{
  numbers: Record<Own, number>
  stopOnStdinClose: boolean
  serveArgs: readonly string[]
  installRoot?: string
}>

export function supervisePlan(argv: readonly string[]): Plan {
  const numbers: Record<Own, number> = { ...OWN }
  const serveArgs: string[] = []
  let stopOnStdinClose = false
  let installRoot: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string
    if (arg === STDIN_FLAG) stopOnStdinClose = true
    else if (arg === ROOT_FLAG) {
      installRoot = argv[(index += 1)]
      if (installRoot === undefined || !isAbsolute(installRoot))
        throw new UsageError(`${ROOT_FLAG} must be an absolute path`)
    } else if (arg in OWN) {
      const value = Number(argv[(index += 1)])
      if (!Number.isInteger(value) || value <= 0)
        throw new UsageError(`${arg} must be a positive integer`)
      numbers[arg as Own] = value
    } else serveArgs.push(arg)
  }
  return {
    numbers,
    stopOnStdinClose,
    serveArgs,
    ...(installRoot === undefined ? {} : { installRoot }),
  }
}

type Io = Readonly<{
  start: (serveArgs: readonly string[], version: string | undefined) => ChildProcess
  versions?: Readonly<{
    current: () => string
    tell: (started: string, kind: 'settled' | 'fell-to-limit') => Told
  }>
  stdout: (chunk: string) => void
  stderr: (line: string) => void
  onStop: (stop: (reason: string) => void) => () => void
}>

const leftAs = (code: number | null, signal: string | null): string =>
  code === null ? `(killed by ${signal ?? 'a signal'})` : `with ${String(code)}`

type Verdict = Readonly<{ line: string; replaced: boolean }>

/** The supervisor's side of the pointer: the version it started last, and what the pointer says once that one left. */
function pointerTalk(io: Io, say: (line: string) => void) {
  let version: string | undefined
  const tell = (kind: 'settled' | 'fell-to-limit'): Told | undefined => {
    if (version === undefined) return undefined
    try {
      return io.versions?.tell(version, kind)
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error)
      say(`the pointer was not read or written: ${why}`)
      return undefined
    }
  }
  return {
    next: (): string | undefined => (version = io.versions?.current()),
    settled(): void {
      if (tell('settled')?.outcome === 'moved')
        say(`version ${String(version)} settled; it is the one to go back to`)
    },
    /** A version the pointer no longer names is not the one whose configuration matters. */
    misconfigured(left: string): Verdict {
      const fell = `serve left ${left}: a configuration error`
      let named = version
      try {
        named = io.versions?.current()
      } catch {
        named = version
      }
      if (named === version) return { line: `${fell}; it is not started again`, replaced: false }
      return { line: `${fell}; the pointer names version ${String(named)} by now`, replaced: true }
    },
    atLimit(left: string, limit: number): Verdict {
      const times = `${String(limit)} times in a row before it settled`
      if (version === undefined)
        return { line: `serve left ${left}, ${times}; it is not started again`, replaced: false }
      const told = tell('fell-to-limit')
      const fell = `version ${version} left ${left}, ${times}`
      const to = told?.pointer?.current
      if (to === undefined || told?.outcome === 'no-fallback') {
        const line = `${fell}; there is no earlier version to go back to; it is not started again`
        return { line, replaced: false }
      }
      if (told?.outcome !== 'rolled-back')
        return { line: `${fell}; the pointer names version ${to} by now`, replaced: true }
      io.stdout(`${JSON.stringify({ kind: 'version-fallback', from: version, to })}\n`)
      return { line: `${fell}; going back to version ${to}`, replaced: true }
    },
  }
}

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
    let replaced = false
    const say = (line: string) => io.stderr(`supervise: ${line}`)
    const pointer = pointerTalk(io, say)

    const dispatch = (event: SuperviseEvent): void => {
      const step = supervise(state, event, config)
      state = step.state
      for (const action of step.actions) act(action)
      if (replaced) {
        replaced = false
        return dispatch({ kind: 'replaced' })
      }
      if (state.kind !== 'held' && state.kind !== 'stopped') return
      offStop()
      resolve(state.code ?? (state.kind === 'held' ? 1 : 0))
    }
    const startChild = (): void => {
      let started: ChildProcess
      let version: string | undefined
      try {
        version = pointer.next()
        started = io.start(plan.serveArgs, version)
      } catch (error) {
        say(`${error instanceof Error ? error.message : String(error)}; serve is not started`)
        offStop()
        return resolve(2)
      }
      child = started
      say(
        `started serve, process ${String(started.pid)}${version === undefined ? '' : `, version ${version}`}`,
      )
      let seen = ''
      started.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
        io.stdout(chunk)
        if (settle !== undefined || child !== started) return
        seen = (seen + chunk).slice(-4096)
        if (!ACCEPTING.test(seen)) return
        const timer = monotonicClock.after(plan.numbers['--stable-ms'])
        settle = timer
        void timer.promise.then(() => {
          if (settle !== timer) return
          pointer.settled()
          dispatch({ kind: 'settled' })
        })
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
        case 'give-up': {
          const verdict =
            action.reason === 'configuration'
              ? pointer.misconfigured(left)
              : pointer.atLimit(left, config.fallLimit)
          replaced = verdict.replaced
          return say(verdict.line)
        }
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
  const root = plan.installRoot
  const current = (): string => {
    const named = readVersions(root as string).pointer?.current
    if (named === undefined) throw new Error(`no version is switched to under ${String(root)}`)
    return named
  }
  if (root !== undefined)
    try {
      current()
    } catch (error) {
      throw new UsageError((error as Error).message)
    }
  const keepAlive = setInterval(() => {}, 1 << 30)
  try {
    return await runSupervisor(plan, {
      start: (serveArgs, version) => {
        const versioned = root !== undefined && version !== undefined
        const entry = versioned ? entryOfVersion(root, version) : bin
        const own = versioned ? [ROOT_FLAG, root, STDIN_FLAG] : [STDIN_FLAG]
        return spawn(process.execPath, [entry, 'serve', ...serveArgs, ...own], {
          stdio: ['pipe', 'pipe', 'inherit'],
        })
      },
      ...(root === undefined
        ? {}
        : { versions: { current, tell: (started, kind) => tellVersions(root, started, kind) } }),
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
