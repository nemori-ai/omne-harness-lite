import { MessageChannelMain, utilityProcess } from 'electron'
import {
  createPortFetch,
  type ElectronPortLike,
  fromElectronPort,
  PortClosedError,
  type PortFetch,
  type PortStats,
} from '../port-fetch/index.ts'
import type { Logger } from './log.ts'

export interface ServerProcessOptions {
  utilityPath: string
  log: Logger
  onRestart?: () => void
  env?: Record<string, string>
  onLifecycle?: (event: {
    generation: number
    state: 'starting' | 'ready' | 'failed'
    restarted: boolean
  }) => void
}

export interface ServerProcess {
  fetch: PortFetch
  ready(): Promise<void>
  shutdown(): Promise<void>
  readonly state: ServerState
  stats(): PortStats | undefined
}

export type ServerState = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped'

export interface ChildLike {
  on(event: 'spawn', listener: () => void): unknown
  on(event: 'exit', listener: (code: number) => void): unknown
  on(event: 'message', listener: (message: unknown) => void): unknown
  postMessage(message: unknown, transfer?: unknown[]): void
  kill(): boolean
}

export type PortMainLike = ElectronPortLike

export interface ServerProcessDeps {
  fork(): ChildLike
  channel(): { port1: PortMainLike; port2: PortMainLike }
  createFetch(port2: PortMainLike): PortFetch
}

export const STARTUP_TIMEOUT_MS = 20_000
export const SHUTDOWN_GRACE_MS = 3_000
const RESTART_BASE_MS = 250
export const RESTART_MAX_MS = 5_000

function electronDeps(options: ServerProcessOptions): ServerProcessDeps {
  return {
    fork() {
      const child = utilityProcess.fork(options.utilityPath, [], {
        stdio: 'pipe',
        serviceName: 'omne-forwarding',
        env: { ...stringEnv(process.env), ...options.env },
      })
      child.stdout?.on('data', (chunk: Buffer) => process.stdout.write(chunk))
      child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk))
      return child
    },
    channel: () => new MessageChannelMain(),
    createFetch: port2 => createPortFetch(fromElectronPort(port2)),
  }
}

interface Instance {
  generation: number
  child: ChildLike
  spawned: boolean
  fetch?: PortFetch
  port2?: PortMainLike
  ready: Promise<void>
  settleReady: { resolve: () => void; reject: (err: Error) => void }
  readySettled: boolean
  exited: boolean
  startupTimer?: ReturnType<typeof setTimeout>
}

const asError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)))

/** One state machine owns the instance, the start in flight, the restart timer and the stop. */
class Lifecycle {
  state: ServerState = 'idle'
  instance: Instance | undefined
  readonly #options: ServerProcessOptions
  readonly #deps: ServerProcessDeps
  #restartTimer: ReturnType<typeof setTimeout> | undefined
  #restarts = 0
  #generations = 0
  #stopping: Promise<void> | undefined

  constructor(options: ServerProcessOptions, deps: ServerProcessDeps) {
    this.#options = options
    this.#deps = deps
  }

  get #isStopping(): boolean {
    return this.state === 'stopping' || this.state === 'stopped'
  }

  #report(generation: number, state: 'starting' | 'ready' | 'failed'): void {
    this.#options.onLifecycle?.({ generation, state, restarted: generation > 1 })
  }

  #retire(inst: Instance, reason: Error): void {
    clearTimeout(inst.startupTimer)
    inst.port2?.close()
    if (!inst.readySettled) {
      inst.readySettled = true
      inst.settleReady.reject(reason)
    }
    if (this.instance === inst) {
      this.instance = undefined
      if (this.state === 'starting' || this.state === 'running') this.state = 'idle'
    }
  }

  #scheduleRestart(why: string): void {
    const { log } = this.#options
    if (this.#isStopping || this.#restartTimer !== undefined || this.instance !== undefined) return
    this.#restarts++
    this.#options.onLifecycle?.({
      generation: this.#generations + 1,
      state: 'starting',
      restarted: true,
    })
    const delay = Math.min(RESTART_MAX_MS, RESTART_BASE_MS * 2 ** Math.min(this.#restarts, 5))
    log.error({ restarts: this.#restarts, delayMs: delay }, `server process ${why}, restarting`)
    this.#restartTimer = setTimeout(() => {
      this.#restartTimer = undefined
      void this.start().then(
        () => this.#options.onRestart?.(),
        (err: unknown) => log.error({ err }, 'server process restart failed'),
      )
    }, delay)
  }

  /** A failed generation: retired, reported, killed, and replaced after the backoff. */
  #abandon(inst: Instance, reason: Error, why: string): void {
    this.#retire(inst, reason)
    this.#report(inst.generation, 'failed')
    inst.child.kill()
    this.#scheduleRestart(why)
  }

  #onSpawn(inst: Instance): void {
    if (this.instance !== inst || inst.exited || this.#isStopping) return
    inst.spawned = true
    try {
      const { port1, port2 } = this.#deps.channel()
      inst.port2 = port2
      inst.fetch = this.#deps.createFetch(port2)
      inst.child.postMessage({ type: 'port' }, [port1])
    } catch (err) {
      this.#options.log.error(
        { err, generation: inst.generation },
        'server process setup failed after spawn',
      )
      this.#abandon(inst, asError(err), 'failed after spawn')
    }
  }

  #onReady(inst: Instance, message: unknown): void {
    if (this.instance !== inst || inst.readySettled || this.#isStopping) return
    if (!isMessage(message, 'ready')) return
    clearTimeout(inst.startupTimer)
    inst.readySettled = true
    this.state = 'running'
    this.#report(inst.generation, 'ready')
    inst.settleReady.resolve()
  }

  #onExit(inst: Instance, code: number): void {
    inst.exited = true
    const wasCurrent = this.instance === inst
    const failedStartup = !inst.readySettled
    this.#retire(inst, new Error(`The server exited (code ${code})`))
    if (!wasCurrent || this.#isStopping) return
    if (failedStartup) this.#report(inst.generation, 'failed')
    this.#options.log.error(
      { code, generation: inst.generation },
      'server process exited unexpectedly',
    )
    this.#scheduleRestart('exited unexpectedly')
  }

  #spawn(): Instance {
    const settle = { resolve: () => {}, reject: (_err: Error) => {} }
    const ready = new Promise<void>((resolve, reject) => {
      settle.resolve = resolve
      settle.reject = reject
    })
    ready.catch(() => {})
    const generation = ++this.#generations
    this.#report(generation, 'starting')
    const inst: Instance = {
      generation,
      child: this.#deps.fork(),
      spawned: false,
      ready,
      settleReady: settle,
      readySettled: false,
      exited: false,
    }
    inst.startupTimer = setTimeout(() => {
      if (this.instance !== inst || inst.readySettled) return
      this.#options.log.error(
        { generation: inst.generation },
        'server process did not become ready in time, killing it',
      )
      this.#abandon(
        inst,
        new Error('The server did not become ready in time'),
        'timed out at startup',
      )
    }, STARTUP_TIMEOUT_MS)
    inst.child.on('spawn', () => this.#onSpawn(inst))
    inst.child.on('message', message => this.#onReady(inst, message))
    inst.child.on('exit', code => this.#onExit(inst, code))
    return inst
  }

  start(): Promise<void> {
    if (this.#isStopping) return Promise.reject(new Error('The server is shutting down'))
    if (this.instance) return this.instance.ready
    if (this.#restartTimer !== undefined)
      return Promise.reject(new PortClosedError('The server is restarting'))
    this.state = 'starting'
    try {
      this.instance = this.#spawn()
    } catch (err) {
      this.state = 'idle'
      this.#options.log.error({ err }, 'server process failed to fork')
      this.#report(this.#generations, 'failed')
      this.#scheduleRestart('failed to fork')
      return Promise.reject(asError(err))
    }
    return this.instance.ready
  }

  /** The running instance, started if need be; a `PortClosedError` when there is none to use. */
  async current(): Promise<Instance> {
    try {
      await this.start()
    } catch (error) {
      throw new PortClosedError(
        error instanceof Error ? error.message : 'The server is not available',
      )
    }
    const inst = this.instance
    if (!inst?.fetch || !inst.readySettled) throw new PortClosedError('The server is not available')
    return inst
  }

  shutdown(): Promise<void> {
    return (this.#stopping ??= this.#stop())
  }

  /** Asks the child to close, and kills it when it has not exited after the grace period. */
  #exited(inst: Instance): Promise<void> {
    return new Promise<void>(resolve => {
      const finish = (): void => {
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(() => {
        this.#options.log.warn({}, 'server process did not exit in time, killing it')
        inst.child.kill()
        finish()
      }, SHUTDOWN_GRACE_MS)
      inst.child.on('exit', finish)
      if (inst.spawned) inst.child.postMessage({ type: 'shutdown' })
      else inst.child.kill()
    })
  }

  async #stop(): Promise<void> {
    this.state = 'stopping'
    clearTimeout(this.#restartTimer)
    this.#restartTimer = undefined
    const inst = this.instance
    const shuttingDown = new Error('The server is shutting down')
    if (!inst || inst.exited) {
      if (inst) this.#retire(inst, shuttingDown)
      this.state = 'stopped'
      return
    }
    if (!inst.readySettled) {
      inst.readySettled = true
      inst.settleReady.reject(shuttingDown)
    }
    clearTimeout(inst.startupTimer)
    await this.#exited(inst)
    this.#retire(inst, shuttingDown)
    this.state = 'stopped'
  }
}

export function startServerProcess(
  options: ServerProcessOptions,
  deps: ServerProcessDeps = electronDeps(options),
): ServerProcess {
  const lifecycle = new Lifecycle(options, deps)
  void lifecycle
    .start()
    .catch((err: unknown) => options.log.error({ err }, 'server process failed to start'))
  return {
    get state() {
      return lifecycle.state
    },
    fetch: async request => (await lifecycle.current()).fetch!(request),
    stats: () => {
      const fetch: unknown = lifecycle.instance?.fetch
      return hasStats(fetch) ? fetch.stats() : undefined
    },
    ready: async () => {
      await lifecycle.start()
    },
    shutdown: () => lifecycle.shutdown(),
  }
}

function stringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) if (value !== undefined) out[key] = value
  return out
}

function hasStats(value: unknown): value is { stats(): PortStats } {
  return typeof value === 'function' && 'stats' in value && typeof value.stats === 'function'
}

function isMessage(value: unknown, type: string): boolean {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === type
}
