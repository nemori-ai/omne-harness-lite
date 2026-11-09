import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { Failure } from '../host-paths.ts'
import { frameworkAssembly, windowsNativeExecutable } from '../windows-native/compile.ts'
import { nativeHost } from './native-host.ts'
import { nativeSource } from './native-source.ts'
import { nativeTree } from './native-tree.ts'
import { nativeWrite } from './native-write.ts'
import { parseReplyFrame, requestFrame, type NativeInput, type NativeReply } from './protocol.ts'

/**
 * The resident Windows files helper process and its request transport. Each step below is one
 * action of `verification/models/FilesHelper.tla` and runs in one synchronous section:
 *
 * - `request`: Enqueue.
 * - `pump`: Dispatch, Start and Restart.
 * - `received`: StartOk on the ready frame, ReceiveFrame on a reply. `startFailed`: StartFail.
 * - `expired`: RequestTimeout. `invalidate`: the host side of Terminate (frames read after it are
 *   dropped; the process is killed).
 * - `exited`, on the child's `close` event: HelperExit.
 *
 * The helper knows no engine, acquisition or owner. Sealing is the facade's admission: a sealed
 * facade answers `closed` before a request is made, and a drain waits for the admitted operations
 * to end. The helper does not check a seal at Enqueue or Dispatch.
 */

/** A reply of the native operation, a native failure, or the helper's own answer. */
export type HelperAnswer = NativeReply | Failure

export type FilesHelper = Readonly<{
  /**
   * Runs one native operation. `unavailable` when the helper does not start, `unknown` when the
   * helper exits, is invalidated or exceeds `boundMs` after the request was written to it.
   */
  request(input: NativeInput, boundMs?: number): Promise<HelperAnswer>
}>

export type FilesHelperOptions = Readonly<{
  /** The command of a new helper process. A rejection answers the waiting requests `unavailable`. */
  launch(): Promise<Readonly<{ command: string; args: readonly string[] }>>
  /** The bound of one written request; the initial value is 30000, as on macOS. */
  requestBoundMs?: number
  /** The bound from spawning the process to its ready frame. */
  startBoundMs?: number
  /** At most this many requests are written and not yet answered; the rest wait in order. */
  inFlightLimit?: number
}>

type RequestState =
  | Readonly<{ state: 'queued' }>
  | Readonly<{ state: 'inFlight'; incarnation: number }>
  | Readonly<{ state: 'answered' }>

type Request = {
  readonly id: number
  readonly line: string
  readonly boundMs: number
  status: RequestState
  timer: ReturnType<typeof setTimeout> | undefined
  readonly settle: (answer: HelperAnswer) => void
}

/** One start of the helper process. Frames match a request only while `phase` is `ready`. */
type Incarnation = {
  readonly number: number
  phase: 'starting' | 'ready' | 'killing'
  child: ChildProcessWithoutNullStreams | undefined
  startTimer: ReturnType<typeof setTimeout> | undefined
}

/** Request numbers are unique in the process, across helpers and their restarts. */
let nextRequest = 1
let nextIncarnation = 1

export function createFilesHelper(options: FilesHelperOptions): FilesHelper {
  const requestBoundMs = options.requestBoundMs ?? 30_000
  const startBoundMs = options.startBoundMs ?? 10_000
  const inFlightLimit = options.inFlightLimit ?? 16
  let queue: Request[] = []
  const inFlight = new Map<number, Request>()
  /** The one process of this helper. A new one starts only after the old one's `close`. */
  let current: Incarnation | undefined

  const answer = (request: Request, value: HelperAnswer): void => {
    if (request.status.state === 'answered') return
    request.status = { state: 'answered' }
    clearTimeout(request.timer)
    inFlight.delete(request.id)
    request.settle(value)
  }

  /** The process keeps the event loop alive only while a request waits for it. */
  const hold = (): void => {
    const child = current?.child
    if (child === undefined) return
    if (queue.length > 0 || inFlight.size > 0) child.ref()
    else child.unref()
  }

  const dispatch = (
    incarnation: Incarnation,
    child: ChildProcessWithoutNullStreams,
    request: Request,
  ) => {
    request.status = { state: 'inFlight', incarnation: incarnation.number }
    inFlight.set(request.id, request)
    request.timer = setTimeout(() => expired(incarnation, request), request.boundMs)
    child.stdin.write(request.line)
  }

  const pump = (): void => {
    const ready = current?.phase === 'ready' ? current : undefined
    const child = ready?.child
    const waiting: Request[] = []
    for (const request of queue) {
      if (ready !== undefined && child !== undefined && inFlight.size < inFlightLimit)
        dispatch(ready, child, request)
      else waiting.push(request)
    }
    queue = waiting
    if (current === undefined && queue.length > 0) start()
    hold()
  }

  const invalidate = (incarnation: Incarnation): void => {
    if (incarnation.phase === 'killing') return
    incarnation.phase = 'killing'
    clearTimeout(incarnation.startTimer)
    incarnation.child?.kill()
  }

  /** The waiting requests answer `unavailable`; none of them was written to a process. */
  const startFailed = (incarnation: Incarnation): void => {
    if (current !== incarnation || incarnation.phase !== 'starting') return
    for (const request of queue) answer(request, 'unavailable')
    queue = []
    if (incarnation.child === undefined) {
      current = undefined
      return
    }
    invalidate(incarnation)
  }

  const expired = (incarnation: Incarnation, request: Request): void => {
    if (
      current === incarnation &&
      incarnation.phase === 'ready' &&
      request.status.state === 'inFlight' &&
      request.status.incarnation === incarnation.number
    )
      invalidate(incarnation)
  }

  const received = (incarnation: Incarnation, line: string): void => {
    if (current !== incarnation || incarnation.phase === 'killing') return
    const frame = parseReplyFrame(line)
    if (incarnation.phase === 'starting') {
      if (frame?.kind !== 'ready') return startFailed(incarnation)
      incarnation.phase = 'ready'
      clearTimeout(incarnation.startTimer)
      return pump()
    }
    const request = frame?.kind === 'reply' ? inFlight.get(frame.id) : undefined
    if (
      frame?.kind !== 'reply' ||
      request === undefined ||
      request.status.state !== 'inFlight' ||
      request.status.incarnation !== incarnation.number
    )
      return invalidate(incarnation)
    answer(request, frame.outcome)
    pump()
  }

  /** The host saw the process's `close`: every request written to it and unanswered is unknown. */
  const exited = (incarnation: Incarnation): void => {
    if (current !== incarnation) return
    startFailed(incarnation)
    clearTimeout(incarnation.startTimer)
    for (const request of inFlight.values())
      if (request.status.state === 'inFlight' && request.status.incarnation === incarnation.number)
        answer(request, 'unknown')
    current = undefined
    pump()
  }

  const launched = (
    incarnation: Incarnation,
    command: Readonly<{ command: string; args: readonly string[] }>,
  ): void => {
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(command.command, command.args, {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch {
      return startFailed(incarnation)
    }
    incarnation.child = child
    for (const stream of [child.stdin, child.stdout, child.stderr])
      if ('unref' in stream && typeof stream.unref === 'function') stream.unref()
    child.on('error', () => undefined)
    child.stdin.on('error', () => undefined)
    child.stderr.resume()
    child.stdout.setEncoding('utf8')
    let partial: string[] = []
    child.stdout.on('data', (chunk: string) => {
      let start = 0
      for (let end = chunk.indexOf('\n'); end >= 0; end = chunk.indexOf('\n', start)) {
        const line = partial.join('') + chunk.slice(start, end)
        partial = []
        start = end + 1
        received(incarnation, line)
      }
      if (start < chunk.length) partial.push(chunk.slice(start))
    })
    // `close` follows the last `data`; a line still partial then was never a frame.
    child.on('close', () => exited(incarnation))
    incarnation.startTimer = setTimeout(() => startFailed(incarnation), startBoundMs)
    hold()
  }

  const start = (): void => {
    const incarnation: Incarnation = {
      number: nextIncarnation++,
      phase: 'starting',
      child: undefined,
      startTimer: undefined,
    }
    current = incarnation
    options.launch().then(
      command => {
        if (current === incarnation && incarnation.phase === 'starting')
          launched(incarnation, command)
      },
      () => startFailed(incarnation),
    )
  }

  return Object.freeze({
    request(input: NativeInput, boundMs = requestBoundMs) {
      return new Promise<HelperAnswer>(settle => {
        const id = nextRequest++
        queue.push({
          id,
          line: requestFrame(id, input),
          boundMs,
          status: { state: 'queued' },
          timer: undefined,
          settle,
        })
        pump()
      })
    },
  })
}

const filesExecutable = windowsNativeExecutable({
  cacheName: 'omne-windows-files',
  executableName: 'files.exe',
  sources: [
    { fileName: 'files.cs', text: nativeSource + nativeTree + nativeWrite },
    { fileName: 'host.cs', text: nativeHost },
  ],
  references: [frameworkAssembly('System.Web.Extensions.dll')],
})

let shared: FilesHelper | undefined

/** The one files helper of this process, shared by every engine. It starts with its first request. */
export function getWindowsFilesHelper(): FilesHelper {
  shared ??= createFilesHelper({
    launch: async () => ({ command: await filesExecutable(), args: [] }),
  })
  return shared
}
