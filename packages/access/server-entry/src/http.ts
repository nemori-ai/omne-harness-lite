import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { InProcessAnswer, InProcessCall } from '@omne-harness/access-cordis-contract'
import {
  LOOPBACK_ADDRESS,
  OUTPUT_LIMITS,
  ServerEntryConfigError,
  checkConfig,
  readLimits,
  type ServerEntryConfig,
} from './config.ts'
import { accessContribution } from './availability/availability.ts'
import type { RegistryForEntry } from './registry/registry.ts'
import { writeBare } from './pipeline/answer.ts'
import { createInProcessCalls } from './pipeline/in-process.ts'
import {
  createPipeline,
  type PipelineAccess,
  type Pipeline,
  type RequestSlots,
} from './pipeline/pipeline.ts'

export type Listening = Readonly<{ address: string; port: number }>

export type ServerEntryAccess = Omit<PipelineAccess, 'registry'> & {
  readonly registry: RegistryForEntry
}

export interface ServerEntry {
  start(): Promise<Listening>
  stop(): Promise<void>
  call(input: InProcessCall): Promise<InProcessAnswer>
}

export function createServerEntry(input: {
  readonly config: ServerEntryConfig
  readonly access?: ServerEntryAccess
}): ServerEntry {
  const config = checkConfig(input.config)

  let server: Server | undefined
  let listening: Listening | undefined
  let stopping = false
  let inFlight = 0
  let activeRequests = 0
  const drained: (() => void)[] = []

  const slots: RequestSlots = {
    take: res => {
      if (activeRequests >= config.maxInFlightRequests) return undefined
      activeRequests += 1
      let held = true
      const release = (): void => {
        if (!held) return
        held = false
        activeRequests -= 1
        res.off('close', release)
      }
      res.once('close', release)
      return release
    },
  }
  const pipeline: Pipeline | undefined =
    input.access === undefined
      ? undefined
      : createPipeline(input.access, {
          loopback: LOOPBACK_ADDRESS,
          bodyLimits: config.maxBodyBytes,
          readLimits: maxBytes => readLimits(config, maxBytes),
          writeLimits: OUTPUT_LIMITS,
          slots,
          observations: config.observation,
          heartbeatMs: config.heartbeatIntervalMs,
        })

  const inProcess =
    input.access === undefined
      ? undefined
      : createInProcessCalls(input.access, {
          bodyLimits: config.maxBodyBytes,
          readLimits: maxBytes => readLimits(config, maxBytes),
          writeLimits: OUTPUT_LIMITS,
        })

  const settle = (): void => {
    inFlight -= 1
    if (inFlight === 0) for (const resolve of drained.splice(0)) resolve()
  }

  const notFound = async (_req: IncomingMessage, res: ServerResponse): Promise<void> => {
    writeBare(res, 404)
  }

  const onRequest = (req: IncomingMessage, res: ServerResponse): void => {
    if (stopping) {
      res.destroy()
      return
    }
    inFlight += 1
    const finished = new Promise<void>(resolve => {
      res.once('close', resolve)
    })
    const route = pipeline === undefined ? notFound : pipeline.handle
    route(req, res)
      .catch(() => {
        if (!res.headersSent) writeBare(res, 500)
        else res.destroy()
      })
      .finally(() => {
        void finished.then(settle)
      })
  }

  let takeDownAccess: (() => Promise<void>) | undefined
  return {
    call: async call =>
      inProcess === undefined ? { kind: 'not-executed', reason: 'unavailable' } : inProcess(call),
    start() {
      if (listening !== undefined) return Promise.resolve(listening)
      if (config.listenAddress !== LOOPBACK_ADDRESS)
        return Promise.reject(
          new ServerEntryConfigError(
            `server-entry: listenAddress must be ${LOOPBACK_ADDRESS}; the entry does not rewrite another address`,
          ),
        )
      stopping = false
      const access = input.access
      try {
        takeDownAccess = access?.registry.own(
          accessContribution(access.registry, access.availabilityBacklog, access.tenantScope),
        )
      } catch (error) {
        return Promise.reject(error)
      }
      const created = createServer(
        { requireHostHeader: false, requestTimeout: 0, headersTimeout: 60_000 },
        onRequest,
      )
      server = created
      return new Promise<Listening>((resolve, reject) => {
        const failed = (error: Error): void => {
          void takeDownAccess?.()
          takeDownAccess = undefined
          reject(error)
        }
        created.once('error', failed)
        created.listen(config.listenPort, LOOPBACK_ADDRESS, () => {
          created.off('error', failed)
          const address = created.address()
          if (address === null || typeof address === 'string') {
            failed(new ServerEntryConfigError('server-entry: the listener has no address'))
            return
          }
          listening = { address: address.address, port: address.port }
          resolve(listening)
        })
      })
    },
    async stop() {
      const current = server
      if (current === undefined) return
      stopping = true
      server = undefined
      listening = undefined
      const closed = new Promise<void>(resolve => {
        current.close(() => resolve())
      })
      await pipeline?.endObservations()
      if (inFlight > 0) await new Promise<void>(resolve => drained.push(resolve))
      const takeDown = takeDownAccess
      takeDownAccess = undefined
      await takeDown?.()
      current.closeAllConnections()
      await closed
    },
  }
}
