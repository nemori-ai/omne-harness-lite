import { Worker } from 'node:worker_threads'
import type { TiktokenExecutorLimits } from './executor-types.ts'
import type { WorkerCommand } from './worker-protocol.ts'

export type WorkerEvents = Readonly<{
  message(value: unknown): void
  error(error: Error): void
  exit(): void
}>
export type WorkerPort = Readonly<{ send(command: WorkerCommand): void; terminate(): void }>
export type SpawnWorker = (events: WorkerEvents, limits: TiktokenExecutorLimits) => WorkerPort

export const spawnWorker: SpawnWorker = (events, limits) => {
  const source = import.meta.url.endsWith('.ts')
  const worker = new Worker(new URL(source ? './worker.ts' : './worker.js', import.meta.url), {
    execArgv: source ? ['--conditions=source'] : [],
    resourceLimits: { maxOldGenerationSizeMb: limits.maxWorkerOldSpaceMb },
  })
  worker.on('message', events.message)
  worker.on('messageerror', events.error)
  worker.on('error', events.error)
  worker.once('exit', events.exit)
  return {
    send: command => worker.postMessage(command),
    terminate: () => {
      void worker.terminate().catch(events.error)
    },
  }
}
