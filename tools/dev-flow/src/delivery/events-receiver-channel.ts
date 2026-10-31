import { appendFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { normalizeGithubEvent, type ChannelReceiverIdentity, type EventRecord } from './events.ts'
import type { GhText } from './events-gh.ts'
import { channelDelivery, ReceiverError, reconnectDelay, SseDecoder } from './events-channel.ts'
import {
  readChannelConfig,
  receiverPaths,
  writePrivateJson,
  type ChannelConfig,
} from './events-channel-config.ts'
import { prepareChannelHook, removeChannelHook } from './events-channel-hooks.ts'
import { channelSubject } from './events-channel-subject.ts'
import {
  claimChannelReceiver,
  inspectEventLog,
  readReceiverHealth,
  type ReceiverState,
} from './events-receiver-state.ts'

export type ChannelServeArgs = {
  configPath: string
  repository: string
  file: string
  gh: GhText
  stopped: Promise<void>
  log: (message: string) => void
  fetcher?: typeof fetch
  random?: () => number
  /** Test seam only. Production retries use the bounded exponential delay. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
  policy?: ChannelReceiverPolicy
}

export type ChannelReceiverPolicy = {
  healthIntervalMs: number
  connectionTimeoutMs: number
  maxFrameBytes: number
  retryDelayMs: (attempt: number, random?: () => number) => number
}

export const defaultChannelReceiverPolicy: ChannelReceiverPolicy = {
  healthIntervalMs: 5000,
  connectionTimeoutMs: 15_000,
  maxFrameBytes: 26 * 1024 * 1024,
  retryDelayMs: reconnectDelay,
}

function reason(error: unknown): string {
  return error instanceof ReceiverError ? error.reasonCode : 'receiver-operation-failed'
}

function append(file: string, value: EventRecord): void {
  try {
    appendFileSync(file, `${JSON.stringify(value)}\n`, { mode: 0o600 })
  } catch {
    throw new ReceiverError('event-log-write-failed')
  }
}

export async function serveChannelReceiver(args: ChannelServeArgs): Promise<number> {
  const policy = args.policy ?? defaultChannelReceiverPolicy
  if (
    [policy.healthIntervalMs, policy.connectionTimeoutMs, policy.maxFrameBytes].some(
      value => !Number.isSafeInteger(value) || value < 1,
    ) ||
    policy.healthIntervalMs > 5000
  )
    throw new ReceiverError('invalid-receiver-policy')
  let config = readChannelConfig(args.configPath)
  if (config.repository !== args.repository || config.eventFile !== args.file)
    throw new ReceiverError('receiver-identity-mismatch')
  const owner = claimChannelReceiver(config),
    state = owner.state
  const abort = new AbortController()
  let requestedStop = false,
    exitCode = 0
  void args.stopped.then(() => {
    requestedStop = true
    abort.abort()
  })
  const identity = {
    instanceId: config.instanceId,
    repository: config.repository,
    mode: 'channel',
    requiresReconcile: true,
  } satisfies ChannelReceiverIdentity
  const persist = () => {
    state.updatedAt = new Date().toISOString()
    writePrivateJson(receiverPaths(config.eventFile).state, state)
  }
  const diagnostic = (action: string, reasonCode: string) => {
    state.reasonCode = reasonCode
    persist()
    append(config.eventFile, {
      ...normalizeGithubEvent({ 'x-github-event': 'receiver' }, {}),
      action,
      receiver: identity,
      diagnostic: { reasonCode, connectionEpoch: state.connectionEpoch, coverage: 'coverage-gap' },
    })
    args.log(
      JSON.stringify({
        kind: 'receiver-diagnostic',
        instanceId: config.instanceId,
        action,
        reasonCode,
      }),
    )
  }
  let healthError: unknown
  const timer = setInterval(() => {
    try {
      const health = readReceiverHealth({ file: config.eventFile, repository: config.repository })
      if (!health.processAlive || health.reasonCode !== state.reasonCode)
        throw new ReceiverError(health.reasonCode)
      persist()
    } catch (error) {
      healthError = error
      abort.abort()
    }
  }, policy.healthIntervalMs)
  try {
    const deliveries = inspectEventLog(config.eventFile)
    config = prepareChannelHook(config, args.configPath, args.gh)
    state.hookId = 'hookId' in config.ownership ? config.ownership.hookId : null
    persist()
    await receiveLoop({
      args,
      config,
      state,
      signal: abort.signal,
      diagnostic,
      persist,
      deliveries,
      identity,
      policy,
    })
    if (healthError !== undefined) throw healthError
  } catch (error) {
    exitCode = 2
    state.state = 'recovery-needed'
    state.reasonCode = reason(error)
    try {
      diagnostic('error', state.reasonCode)
    } catch {}
    args.log(
      JSON.stringify({
        kind: 'receiver-error',
        reasonCode: state.reasonCode,
        instanceId: config.instanceId,
      }),
    )
  } finally {
    clearInterval(timer)
    abort.abort()
    if (requestedStop && exitCode === 0) {
      try {
        config = removeChannelHook(config, args.configPath, args.gh)
        state.state = 'stopped'
        state.reasonCode = 'stopped'
      } catch (error) {
        exitCode = 2
        state.state = 'recovery-needed'
        state.reasonCode = reason(error)
        args.log(
          JSON.stringify({
            kind: 'receiver-error',
            reasonCode: state.reasonCode,
            instanceId: config.instanceId,
          }),
        )
      }
    }
    try {
      persist()
    } catch {
      exitCode = 2
      args.log(JSON.stringify({ kind: 'receiver-error', reasonCode: 'state-write-failed' }))
    }
    try {
      owner.release()
    } catch {
      exitCode = 2
      args.log(JSON.stringify({ kind: 'receiver-error', reasonCode: 'receiver-release-failed' }))
    }
  }
  return exitCode
}

type ReceiveContext = {
  args: ChannelServeArgs
  config: ChannelConfig
  state: ReceiverState
  signal: AbortSignal
  diagnostic: (action: string, reasonCode: string) => void
  persist: () => void
  deliveries: Set<string>
  identity: ChannelReceiverIdentity
  policy: ChannelReceiverPolicy
}

async function receiveLoop(context: ReceiveContext): Promise<void> {
  const { args, state, signal, diagnostic } = context
  let attempt = 0
  while (!signal.aborted) {
    try {
      await receiveConnection(context)
      attempt = 0
    } catch (error) {
      if (signal.aborted) return
      if (error instanceof ReceiverError) throw error
    }
    if (signal.aborted) return
    state.state = 'reconnecting'
    diagnostic('disconnected', 'channel-disconnected')
    const requestedDelay = context.policy.retryDelayMs(attempt++, args.random)
    if (!Number.isFinite(requestedDelay) || requestedDelay < 0)
      throw new ReceiverError('invalid-retry-delay')
    const ms = Math.min(30_000, requestedDelay)
    try {
      if (args.sleep !== undefined) await args.sleep(ms, signal)
      else await delay(ms, undefined, { signal })
    } catch (error) {
      if (!signal.aborted) throw error
    }
  }
}

async function receiveConnection(context: ReceiveContext): Promise<void> {
  const { args, config, state, signal, diagnostic, persist, deliveries, identity } = context
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(), context.policy.connectionTimeoutMs)
  let response: Response | undefined
  try {
    response = await (args.fetcher ?? fetch)(config.channel, {
      headers: { accept: 'text/event-stream', 'cache-control': 'no-cache' },
      signal: controller.signal,
      redirect: 'error',
    })
    clearTimeout(timer)
    if ([401, 403, 404, 410].includes(response.status))
      throw new ReceiverError('channel-permission-or-expiry')
    if (response.status !== 200) {
      if (response.status >= 500 || response.status === 429) throw new Error('retry')
      throw new ReceiverError('channel-http-error')
    }
    if (
      !response.headers.get('content-type')?.toLowerCase().startsWith('text/event-stream') ||
      response.body === null
    )
      throw new ReceiverError('invalid-stream-format')
    state.state = 'connected'
    const action = state.connectionEpoch++ === 0 ? 'connected' : 'reconnected'
    diagnostic(action, 'coverage-gap')
    const decoder = new SseDecoder(message => {
      if (message.event !== 'message') return
      let delivery: ReturnType<typeof channelDelivery>
      try {
        delivery = channelDelivery(message.data)
      } catch {
        args.log(
          JSON.stringify({ kind: 'receiver-diagnostic', reasonCode: 'invalid-channel-message' }),
        )
        return
      }
      const repository = delivery.body.repository
      if (
        typeof repository !== 'object' ||
        repository === null ||
        !('full_name' in repository) ||
        repository.full_name !== config.repository
      ) {
        args.log(
          JSON.stringify({ kind: 'receiver-diagnostic', reasonCode: 'event-repository-mismatch' }),
        )
        return
      }
      const event = normalizeGithubEvent(delivery.headers, delivery.body)
      if (event.delivery !== null && deliveries.has(event.delivery)) return
      if (!config.events.includes(event.event) && event.event !== 'ping') return
      append(config.eventFile, {
        ...event,
        receiver: identity,
        subject: channelSubject(delivery.body),
      })
      if (event.delivery !== null) deliveries.add(event.delivery)
      state.lastDeliveryAt = event.receivedAt
      persist()
    }, context.policy.maxFrameBytes)
    for await (const chunk of response.body) decoder.push(chunk)
  } finally {
    clearTimeout(timer)
    controller.abort()
    signal.removeEventListener('abort', onAbort)
    if (response?.body !== null && response?.body !== undefined && !response.body.locked)
      await response.body.cancel().catch(() => undefined)
  }
}
