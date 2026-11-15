import type {
  SqlIdentity,
  StorageCloseResult,
  StorageControl,
  StorageResidual,
  StorageScope,
} from '@omne-harness/sql-contract'
import type { SqliteStorageConfig } from './config.ts'
import type { Domains, Lifecycle } from './domains.ts'
import type { ReaderPool } from './reader-pool.ts'

export class ReportLatch {
  private engaged = false
  private settled = false
  private readonly held: (() => void)[] = []

  engage(): void {
    if (!this.settled) this.engaged = true
  }

  release(release: () => void): void {
    if (this.engaged && !this.settled) this.held.push(release)
    else release()
  }

  settle(): void {
    this.settled = true
    for (const release of this.held.splice(0)) release()
  }
}

export type InFlightOp = Readonly<{
  domain: string
  identity: SqlIdentity | null
  expire(): void
}>

export class InFlight {
  private readonly ops = new Set<InFlightOp>()

  add(op: InFlightOp): () => void {
    this.ops.add(op)
    return () => void this.ops.delete(op)
  }

  expireAll(): void {
    for (const op of Array.from(this.ops)) op.expire()
  }

  identitiesOf(domain: string): readonly SqlIdentity[] {
    return [...this.ops].flatMap(op =>
      op.domain === domain && op.identity !== null ? [op.identity] : [],
    )
  }
}

export type CloseDeps = Readonly<{
  config: SqliteStorageConfig
  lifecycle: Lifecycle
  admission: Readonly<{ close(): void }>
  domains: Domains
  inFlight: InFlight
  readers: ReaderPool
  latch: ReportLatch
}>

const sleep = (ms: number, signal: AbortSignal): Promise<'deadline'> =>
  new Promise(resolve => {
    const timer = setTimeout(() => resolve('deadline'), ms)
    signal.addEventListener('abort', () => clearTimeout(timer), { once: true })
  })

export function createControl(deps: CloseDeps): StorageControl {
  let drain: Promise<void> | null = null
  let drained = false
  let deadlineAt = 0

  const start = (): Promise<void> => {
    if (drain === null) {
      deadlineAt =
        /* wall-clock: operation-timing -- The close deadline is a monotonic duration from the first close call (SPEC 13.1). */ performance.now() +
        deps.config.closeDeadlineMs
      deps.lifecycle.closing = true
      deps.admission.close()
      drain = Promise.all([deps.domains.closeAll(), deps.readers.closeAll()]).then(
        () => void (drained = true),
        () => void (drained = true),
      )
    }
    return drain
  }

  const residuals = (): readonly StorageResidual[] => [
    ...deps.domains.residualWorkers().map((worker): StorageResidual => ({
      domain: { scope: worker.scope satisfies StorageScope, transactionDomain: worker.domain },
      workerRole: 'writer',
      workerGeneration: worker.leaseName.split('/').pop() ?? '',
      leaseName: worker.leaseName,
      inFlight: deps.inFlight.identitiesOf(worker.domain),
    })),
    ...deps.readers.liveReaders().map((reader): StorageResidual => ({
      domain: { scope: reader.scope, transactionDomain: reader.domain },
      workerRole: 'reader',
      workerGeneration: String(reader.workerGeneration),
      leaseName: reader.leaseName,
      inFlight: [],
    })),
  ]

  return {
    async close(input): Promise<StorageCloseResult> {
      const draining = start()
      const stop = new AbortController()
      const winner = await Promise.race([
        draining.then(() => 'closed' as const),
        sleep(
          Math.max(
            0,
            deadlineAt -
              /* wall-clock: operation-timing -- The close deadline is a monotonic duration from the first close call (SPEC 13.1). */ performance.now(),
          ),
          stop.signal,
        ),
      ])
      stop.abort()
      if (winner === 'closed' || drained) return { kind: 'closed' }
      deps.inFlight.expireAll()
      const left = residuals()
      if (input.initiator === 'assembly') deps.latch.engage()
      return { kind: 'incomplete', residuals: left }
    },
    assemblyReportSettled(): void {
      deps.latch.settle()
    },
  }
}
