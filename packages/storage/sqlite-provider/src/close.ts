// The close protocol of one provider generation (SPEC 13). `close` is the one entry for both
// initiators. The deadline has one source, `closeDeadlineMs`, counted from the first call. A call
// returns at the earlier of "everything ended" and "the deadline passed". Nothing here stops a
// Worker: a Worker that has not ended at the deadline is reported as a residual and ends by itself.
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

/**
 * The reporting latch (SPEC 13.4). Once an `assembly` close gave `incomplete`, the lease of a
 * residual Worker is released only after its exit was observed and the assembly report is settled.
 */
export class ReportLatch {
  private engaged = false
  private settled = false
  private readonly held: (() => void)[] = []

  engage(): void {
    if (!this.settled) this.engaged = true
  }

  /** Runs `release` now, or holds it until the report is settled. Call it once the exit was observed. */
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
  /** The original identity, or null for a registration. */
  identity: SqlIdentity | null
  /** Gives the caller `unknown` (`close_deadline`). The operation itself stays in flight. */
  expire(): void
}>

/** Operations that hold a reservation and wait for a Worker (SPEC 13.3 step 6, `residuals`). */
export class InFlight {
  private readonly ops = new Set<InFlightOp>()

  add(op: InFlightOp): () => void {
    this.ops.add(op)
    return () => void this.ops.delete(op)
  }

  expireAll(): void {
    for (const op of [...this.ops]) op.expire()
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

  /** Steps 1 to 5. Step 1 is the lifecycle flag. Steps 2 to 4 are the Workers' own confirmations. */
  const start = (): Promise<void> => {
    if (drain === null) {
      deadlineAt = performance.now() + deps.config.closeDeadlineMs
      deps.lifecycle.closing = true
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
        sleep(Math.max(0, deadlineAt - performance.now()), stop.signal),
      ])
      stop.abort()
      if (winner === 'closed' || drained) return { kind: 'closed' }
      // The deadline passed. Callers get `unknown`; the reservations stay with the Workers.
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
