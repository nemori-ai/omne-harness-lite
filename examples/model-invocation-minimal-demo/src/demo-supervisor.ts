import { fork, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { lstat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'
import { decodeBody, encodeBody, packet, record, type DemoPacket } from './demo-ipc.ts'
import type { DemoConversation, DemoSendResult, DemoTotals } from './demo.ts'
import type { InteractiveConversation } from './interactive.ts'

export interface DemoSupervisorOptions {
  readonly dataDirectory: string
  readonly keyFile?: string
  readonly multiplier: string
  readonly reserveTokens: string
  readonly maxOutputTokens: number
  readonly retirementWaitMilliseconds: number
  readonly maxPacketBytes: number
  readonly maxCommands: number
  /** The deployment owner reserves this directory for this supervisor's worker chain. */
  readonly dedicatedRoot: true
  /** Trusted controlled HTTPS test route; never read from model or tenant input. */
  readonly developmentTransport?: { readonly baseUrl: string; readonly ca: Uint8Array }
}

type Request = {
  readonly kind: 'start' | 'command' | 'close'
  readonly commandName?: string
  readonly resolve: (value: unknown) => void
  readonly delivery?: (serialized: string, signal: AbortSignal) => Promise<void>
}
type Managed = {
  readonly child: ChildProcess
  readonly identity: string
  readonly generation: string
  state: 'starting' | 'alive' | 'exited'
  exitObserved: boolean
  closeObserved: boolean
  nativeIpcBackpressureObserved: boolean
  readonly pending: Map<string, Request>
  readonly exit: Promise<void>
  readonly closed: Promise<void>
}

function positive(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

const minimumFailurePacketBytes = Buffer.byteLength(
  JSON.stringify({
    generation: '00000000-0000-0000-0000-000000000000',
    id: '00000000-0000-0000-0000-000000000000',
    kind: 'failure',
    body: encodeBody({ reason: 'unavailable' }),
  }),
  'utf8',
)

function summary(value: unknown): {
  readonly knownSum: ExactDecimal
  readonly unknownCount: number
} {
  if (
    !record(value) ||
    typeof value.knownSum !== 'string' ||
    typeof value.unknownCount !== 'number' ||
    !Number.isSafeInteger(value.unknownCount) ||
    value.unknownCount < 0
  )
    throw new Error('invalid remote summary')
  return {
    knownSum: ExactDecimal.from(new LosslessNumber(value.knownSum)),
    unknownCount: value.unknownCount,
  }
}

function totals(value: unknown): DemoTotals {
  if (
    !record(value) ||
    typeof value.responses !== 'number' ||
    !Number.isSafeInteger(value.responses) ||
    !record(value.usage)
  )
    throw new Error('invalid remote totals')
  return {
    responses: value.responses,
    usage: {
      input_tokens: summary(value.usage.input_tokens),
      output_tokens: summary(value.usage.output_tokens),
      cache_read_tokens: summary(value.usage.cache_read_tokens),
      cache_write_tokens: summary(value.usage.cache_write_tokens),
    },
    cost: summary(value.cost),
  }
}

function sendResult(value: unknown): DemoSendResult {
  if (!record(value) || typeof value.released !== 'boolean')
    return { kind: 'unconfirmed', released: false }
  if (value.kind === 'refused' && typeof value.reason === 'string')
    return { kind: 'refused', reason: value.reason, released: value.released }
  if (value.kind === 'unconfirmed') return { kind: 'unconfirmed', released: value.released }
  if (value.kind === 'saved' || value.kind === 'failed') {
    const checked = judgeModelResponse(value.response)
    if ('ok' in checked)
      return {
        kind: value.kind,
        response: value.response as ModelResponse,
        released: value.released,
      }
  }
  return { kind: 'unconfirmed', released: false }
}

export interface SupervisedDemoConversation extends InteractiveConversation {
  readonly workerIdentity: string
}

/** One explicit deployment owner; identity facts die with this supervisor instance. */
export function createDemoSupervisor(options: DemoSupervisorOptions): {
  readonly open: () => Promise<SupervisedDemoConversation>
  readonly signalWorker: (signal: NodeJS.Signals) => boolean
  readonly disconnectWorkerIpc: () => boolean
  /** Controlled fault injection: lose one send receipt after the worker's durable work. */
  readonly dropNextSendResult: () => Promise<boolean> | undefined
  /** Controlled ID-collision fault: old worker payload and generation against a new pending send. */
  readonly replayDroppedSendResultAgainstCurrentWorker: () => boolean
  readonly inspect: () => {
    readonly state: 'none' | 'starting' | 'alive' | 'exited'
    readonly pid?: number
    readonly nativeIpcBackpressureObserved: boolean
  }
  readonly waitWorkerExit: (
    waitForClose?: boolean,
  ) => Promise<{ readonly exited: boolean; readonly closed: boolean }>
  readonly close: () => Promise<{ readonly complete: boolean }>
} {
  if (
    !options.dedicatedRoot ||
    !resolve(options.dataDirectory).startsWith('/') ||
    !positive(options.maxOutputTokens) ||
    !positive(options.retirementWaitMilliseconds) ||
    !positive(options.maxPacketBytes) ||
    options.maxPacketBytes < minimumFailurePacketBytes ||
    !positive(options.maxCommands) ||
    !options.multiplier ||
    !options.reserveTokens
  )
    throw new Error('invalid demo supervisor configuration')
  const directory = resolve(options.dataDirectory)
  const known = new Map<string, Managed>()
  let active: Managed | undefined
  let covered: boolean | undefined
  let rootIdentity: { readonly dev: bigint; readonly ino: bigint } | undefined
  let shuttingDown = false
  let opening = false
  let dropNextSendResult: ((dropped: boolean) => void) | undefined
  let droppedSendResult: DemoPacket | undefined

  async function checkRoot(): Promise<void> {
    try {
      const stat = await lstat(directory, { bigint: true })
      if (!stat.isDirectory()) throw new Error('demo root is not a directory')
      if (
        rootIdentity !== undefined &&
        (rootIdentity.dev !== stat.dev || rootIdentity.ino !== stat.ino)
      ) {
        covered = false
        throw new Error('demo root identity changed')
      }
      rootIdentity ??= { dev: stat.dev, ino: stat.ino }
      covered ??= false
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT' &&
        covered === undefined
      ) {
        covered = true
        return
      }
      throw error
    }
  }

  function send(managed: Managed, kind: DemoPacket['kind'], id: string, body: unknown): boolean {
    if (!managed.child.connected || managed.state === 'exited') return false
    let encoded: string
    try {
      encoded = encodeBody(body)
    } catch {
      return false
    }
    const outgoing = { generation: managed.generation, id, kind, body: encoded }
    if (Buffer.byteLength(JSON.stringify(outgoing), 'utf8') > options.maxPacketBytes) return false
    const writable = managed.child.send(outgoing, error => {
      if (error !== null) {
        const pending = managed.pending.get(id)
        if (pending !== undefined) {
          managed.pending.delete(id)
          pending.resolve(undefined)
        }
      }
    })
    if (!writable) managed.nativeIpcBackpressureObserved = true
    return true
  }

  function request(
    managed: Managed,
    kind: Request['kind'],
    body: unknown,
    delivery?: Request['delivery'],
  ): Promise<unknown> {
    if (
      kind === 'command' &&
      [...managed.pending.values()].filter(item => item.kind === 'command').length >=
        options.maxCommands
    )
      return Promise.resolve(undefined)
    const id = randomUUID()
    const commandName =
      kind === 'command' && record(body) && typeof body.name === 'string' ? body.name : undefined
    const answer = new Promise<unknown>(resolve =>
      managed.pending.set(id, {
        kind,
        resolve,
        ...(commandName === undefined ? {} : { commandName }),
        ...(delivery === undefined ? {} : { delivery }),
      }),
    )
    if (!send(managed, kind, id, body)) {
      managed.pending.delete(id)
      if (kind === 'start' && managed.child.connected) managed.child.disconnect()
      return Promise.resolve(undefined)
    }
    return answer
  }

  function onMessage(managed: Managed, value: unknown): void {
    const message = packet(value, options.maxPacketBytes)
    if (message === undefined || message.generation !== managed.generation) return
    const body = decodeBody(message.body)
    if (message.kind === 'observeExit') {
      const owner = record(body) && typeof body.owner === 'string' ? body.owner : ''
      const prior = known.get(owner)
      const fact =
        owner === managed.identity
          ? 'alive'
          : !covered || prior === undefined
            ? 'unknown'
            : prior.exitObserved
              ? 'exited'
              : prior.state === 'alive'
                ? 'alive'
                : 'unknown'
      send(managed, 'exitFact', message.id, fact)
      return
    }
    if (message.kind === 'observer') {
      const commandId = record(body) && typeof body.commandId === 'string' ? body.commandId : ''
      const serialized = record(body) && typeof body.serialized === 'string' ? body.serialized : ''
      const waiting = managed.pending.get(commandId)
      if (waiting?.kind !== 'command' || waiting.delivery === undefined || !serialized) {
        send(managed, 'observerAck', message.id, 'unavailable')
        return
      }
      void waiting.delivery(serialized, new AbortController().signal).then(
        () => send(managed, 'observerAck', message.id, 'delivered'),
        () => send(managed, 'observerAck', message.id, 'unavailable'),
      )
      return
    }
    if (
      message.kind !== 'started' &&
      message.kind !== 'result' &&
      message.kind !== 'closed' &&
      message.kind !== 'failure'
    )
      return
    const waiting = managed.pending.get(message.id)
    if (waiting === undefined) return
    if (message.kind === 'result' && waiting.commandName === 'send' && dropNextSendResult) {
      const notify = dropNextSendResult
      dropNextSendResult = undefined
      droppedSendResult = message
      notify(true)
      return
    }
    managed.pending.delete(message.id)
    waiting.resolve(message.kind === 'failure' ? undefined : body)
  }

  async function open(): Promise<SupervisedDemoConversation> {
    if (shuttingDown || opening || (active !== undefined && active.state !== 'exited'))
      throw new Error('demo worker is already owned')
    if (active !== undefined && (!active.exitObserved || !active.closeObserved))
      throw new Error('previous worker exit or resource close is unconfirmed')
    opening = true
    try {
      return await openOwned()
    } finally {
      opening = false
    }
  }

  async function openOwned(): Promise<SupervisedDemoConversation> {
    await checkRoot()
    const identity = randomUUID()
    const generation = randomUUID()
    const startupBody = {
      dataDirectory: directory,
      identity,
      multiplier: options.multiplier,
      reserveTokens: options.reserveTokens,
      maxOutputTokens: options.maxOutputTokens,
      retirementWaitMilliseconds: options.retirementWaitMilliseconds,
      covered: covered === true,
      ...(options.keyFile === undefined ? {} : { keyFile: options.keyFile }),
      ...(options.developmentTransport === undefined
        ? {}
        : {
            developmentTransport: {
              baseUrl: options.developmentTransport.baseUrl,
              ca: Buffer.from(options.developmentTransport.ca).toString('base64'),
            },
          }),
    }
    if (
      Buffer.byteLength(
        JSON.stringify({
          generation,
          id: '00000000-0000-0000-0000-000000000000',
          kind: 'start',
          body: encodeBody(startupBody),
        }),
        'utf8',
      ) > options.maxPacketBytes
    )
      throw new Error('demo worker start packet exceeds configured IPC bound')
    const workerModule = new URL(
      import.meta.url.endsWith('.ts') ? '../dist/demo-worker.js' : './demo-worker.js',
      import.meta.url,
    )
    const child = fork(workerModule, [], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      execArgv: [],
      env: {
        ...process.env,
        OMNE_DEMO_IPC_MAX_PACKET_BYTES: String(options.maxPacketBytes),
        OMNE_DEMO_IPC_MAX_PENDING_REQUESTS: String(options.maxCommands),
      },
    })
    let exitDone: () => void = () => undefined
    let closeDone: () => void = () => undefined
    const exit = new Promise<void>(resolve => {
      exitDone = resolve
    })
    const closed = new Promise<void>(resolve => {
      closeDone = resolve
    })
    const managed: Managed = {
      child,
      identity,
      generation,
      state: 'starting',
      exitObserved: false,
      closeObserved: false,
      nativeIpcBackpressureObserved: false,
      pending: new Map(),
      exit,
      closed,
    }
    active = managed
    known.set(identity, managed)
    child.on('message', value => onMessage(managed, value))
    child.on('exit', () => {
      managed.state = 'exited'
      managed.exitObserved = true
      if (active === managed && dropNextSendResult !== undefined) {
        dropNextSendResult(false)
        dropNextSendResult = undefined
      }
      exitDone()
      for (const pending of managed.pending.values()) pending.resolve(undefined)
      managed.pending.clear()
    })
    child.on('close', () => {
      managed.closeObserved = true
      closeDone()
    })
    child.on('error', () => {
      for (const pending of managed.pending.values()) pending.resolve(undefined)
      managed.pending.clear()
    })
    const startup = await new Promise<unknown>(resolve => {
      child.once('spawn', () => {
        void request(managed, 'start', startupBody).then(resolve)
      })
      child.once('error', () => resolve(undefined))
    })
    if (
      !record(startup) ||
      typeof startup.session !== 'string' ||
      !record(startup.identity) ||
      typeof startup.identity.account !== 'string' ||
      typeof startup.identity.organization !== 'string'
    ) {
      throw new Error('demo worker start unavailable; exit is not inferred')
    }
    managed.state = 'alive'
    const identityView = {
      account: startup.identity.account,
      organization: startup.identity.organization,
    }
    await checkRoot()
    async function command(
      name: string,
      extras: Readonly<Record<string, unknown>> = {},
      delivery?: Request['delivery'],
    ): Promise<unknown> {
      if (managed.state !== 'alive') return undefined
      return await request(managed, 'command', { name, ...extras }, delivery)
    }
    const facade: SupervisedDemoConversation = {
      session: startup.session,
      identity: identityView,
      workerIdentity: identity,
      async models() {
        const result = await command('models')
        if (!record(result)) return { unavailable: true }
        return result as Awaited<ReturnType<DemoConversation['models']>>
      },
      async currentModel() {
        const result = await command('currentModel')
        if (!record(result)) return { unavailable: true }
        return result as Awaited<ReturnType<DemoConversation['currentModel']>>
      },
      async selectModel(routeName) {
        const result = await command('selectModel', { routeName })
        if (!record(result)) return { unavailable: true }
        return result as Awaited<ReturnType<DemoConversation['selectModel']>>
      },
      async send(text, onDelivery) {
        const result = await command('send', { text }, onDelivery)
        return sendResult(result)
      },
      stopActive() {
        send(managed, 'stop', randomUUID(), null)
      },
      async history() {
        const result = await command('history')
        if (
          !Array.isArray(result) ||
          !result.every(
            item => record(item) && typeof item.role === 'string' && typeof item.text === 'string',
          )
        )
          throw new Error('remote history unavailable')
        return result.map(item => ({ role: item.role, text: item.text }))
      },
      async totals() {
        return totals(await command('totals'))
      },
      async close() {
        if (managed.state === 'exited') return { complete: managed.closeObserved }
        const result = await request(managed, 'close', null)
        if (!record(result) || result.complete !== true) return { complete: false }
        await managed.exit
        await managed.closed
        return { complete: true }
      },
    }
    return facade
  }

  return {
    open,
    signalWorker(signal) {
      return active !== undefined && active.state !== 'exited' ? active.child.kill(signal) : false
    },
    disconnectWorkerIpc() {
      if (active?.state !== 'alive' || !active.child.connected) return false
      active.child.disconnect()
      return true
    },
    dropNextSendResult() {
      if (active?.state !== 'alive' || dropNextSendResult !== undefined) return undefined
      droppedSendResult = undefined
      return new Promise<boolean>(resolve => {
        dropNextSendResult = resolve
      })
    },
    replayDroppedSendResultAgainstCurrentWorker() {
      if (active?.state !== 'alive' || droppedSendResult === undefined) return false
      const current = [...active.pending.entries()].find(
        ([, request]) => request.kind === 'command' && request.commandName === 'send',
      )
      if (current === undefined) return false
      const held = droppedSendResult
      droppedSendResult = undefined
      onMessage(active, { ...held, id: current[0] })
      return true
    },
    inspect() {
      return active === undefined
        ? { state: 'none' as const, nativeIpcBackpressureObserved: false }
        : {
            state: active.state,
            nativeIpcBackpressureObserved: active.nativeIpcBackpressureObserved,
            ...(active.child.pid === undefined ? {} : { pid: active.child.pid }),
          }
    },
    async waitWorkerExit(waitForClose = true) {
      if (active === undefined) return { exited: false, closed: false }
      await active.exit
      if (waitForClose) await active.closed
      return { exited: active.exitObserved, closed: active.closeObserved }
    },
    async close() {
      shuttingDown = true
      if (active === undefined) return { complete: true }
      if (active.state === 'exited') {
        return { complete: active.exitObserved && active.closeObserved }
      }
      const result = await request(active, 'close', null)
      if (!record(result) || result.complete !== true) return { complete: false }
      await active.exit
      await active.closed
      return { complete: true }
    },
  }
}
