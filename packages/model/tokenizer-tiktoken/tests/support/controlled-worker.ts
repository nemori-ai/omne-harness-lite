import { afterEach } from 'vitest'
import { createExecutor } from '../../src/executor.ts'
import type { TiktokenExecutor, TiktokenExecutorLimits } from '../../src/index.ts'
import type { WorkerEvents, WorkerPort } from '../../src/worker-port.ts'
import type { WorkerCommand, WorkerReply } from '../../src/worker-protocol.ts'
import { limits } from './executor.ts'
import { syntheticResources } from './resources.ts'

const fixtures: Array<{ executor: TiktokenExecutor; workers: ControlledWorker[] }> = []
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    for (const worker of fixture.workers) worker.exitOnTerminate = true
    const closing = fixture.executor.close()
    for (const worker of fixture.workers) worker.exit()
    await closing
  }
})

export class ControlledWorker implements WorkerPort {
  readonly commands: WorkerCommand[] = []
  terminated = false
  exitOnTerminate = false
  private exited = false
  private readonly events: WorkerEvents
  constructor(events: WorkerEvents) {
    this.events = events
  }
  send(command: WorkerCommand): void {
    this.commands.push(command)
    if (command.kind === 'initialize')
      queueMicrotask(() => this.reply({ kind: 'ready', generation: command.generation }))
  }
  terminate(): void {
    this.terminated = true
    if (this.exitOnTerminate) this.exit()
  }
  exit(): void {
    if (!this.exited) {
      this.exited = true
      this.events.exit()
    }
  }
  crash(): void {
    this.events.error(new Error('controlled worker crash'))
  }
  reply(reply: WorkerReply): void {
    this.events.message(reply)
  }
  countCommand(): Extract<WorkerCommand, { kind: 'count' }> {
    const command = this.commands.findLast(item => item.kind === 'count')
    if (command?.kind !== 'count') throw new Error('no running count')
    return command
  }
  complete(): void {
    const command = this.countCommand()
    this.reply({
      kind: 'counted',
      generation: command.generation,
      job: command.job,
      lease: command.lease,
      result: { ok: { tokens: '1' } },
      stats: { cacheBytes: 130, cacheEntries: 1, pieceHits: 0, pieceMisses: 1 },
    })
  }
  cleared(): void {
    const command = this.commands.findLast(item => item.kind === 'clear')
    if (command?.kind !== 'clear') throw new Error('no pending cache clear')
    this.reply({
      kind: 'cleared',
      generation: command.generation,
      lease: command.lease,
      stats: { cacheBytes: 0, cacheEntries: 0, pieceHits: 0, pieceMisses: 1 },
    })
  }
}

export async function controlled(overrides: Partial<TiktokenExecutorLimits> = {}) {
  const workers: ControlledWorker[] = []
  const resources = syntheticResources()
  const created = await createExecutor(
    { resources: [resources], limits: { ...limits, ...overrides } },
    events => {
      const worker = new ControlledWorker(events)
      workers.push(worker)
      return worker
    },
  )
  if ('failure' in created) throw new Error(JSON.stringify(created.failure))
  const fixture = { executor: created.ok, workers }
  fixtures.push(fixture)
  const lease = () => {
    const acquired = fixture.executor.acquire(resources.definition, new AbortController().signal)
    if ('failure' in acquired) throw new Error(JSON.stringify(acquired.failure))
    return acquired.ok
  }
  const worker = () => {
    const current = workers.at(-1)
    if (current === undefined) throw new Error('no worker')
    return current
  }
  return { ...fixture, lease, worker }
}
