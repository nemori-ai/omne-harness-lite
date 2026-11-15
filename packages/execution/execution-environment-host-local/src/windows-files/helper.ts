import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { Failure } from '../host-paths.ts'
import { frameworkAssembly, windowsNativeExecutable } from '../windows-native/compile.ts'
import { nativeHost } from './native-host.ts'
import { nativeSource } from './native-source.ts'
import { nativeTree } from './native-tree.ts'
import { nativeWrite } from './native-write.ts'
import { parseReplyFrame, requestFrame, type NativeInput, type NativeReply } from './protocol.ts'

/** Each step here is one action of `verification/models/FilesHelper.tla` in one synchronous section;
 *  the map is in `verification/formal-mapping.md`. Sealing is the facade's admission, not the helper's. */

export type HelperAnswer = NativeReply | Failure

export type FilesHelper = Readonly<{
  request(input: NativeInput, boundMs?: number): Promise<HelperAnswer>
}>

export type FilesHelperOptions = Readonly<{
  launch(): Promise<Readonly<{ command: string; args: readonly string[] }>>
  requestBoundMs?: number
  startBoundMs?: number
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

type Incarnation = {
  readonly number: number
  phase: 'starting' | 'ready' | 'killing'
  child: ChildProcessWithoutNullStreams | undefined
  startTimer: ReturnType<typeof setTimeout> | undefined
}

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

export function getWindowsFilesHelper(): FilesHelper {
  shared ??= createFilesHelper({
    launch: async () => ({ command: await filesExecutable(), args: [] }),
  })
  return shared
}
