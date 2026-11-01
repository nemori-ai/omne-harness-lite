// The pure factory (SPEC 2.1, 5.3). Construction checks configuration, material digests and the
// declared combinations. It opens no database and starts no Worker. The operations and the close
// control are built from one Core, so the Worker, the queues and the result owner live in this
// object and never on a caller Context (IC-13).
import type {
  CloseLeasePort,
  SqlMaterialCatalog,
  SqlStorage,
  StorageCloseResult,
  StorageControl,
  StorageResidual,
} from '@omne-harness/sql-contract'
import { createCommit } from './commit.ts'
import { validateConfig } from './config.ts'
import { createCore, type Core } from './core.ts'
import { Domains } from './domains.ts'
import { checkMaterials } from './materials.ts'
import { createQuery } from './query.ts'
import { createRead } from './read.ts'
import { createRegister } from './register.ts'

export type SqliteStorageInput = Readonly<{
  /** The serializable configuration of the `storage` row (IC-16). Judged here, not trusted. */
  config: unknown
  materials: SqlMaterialCatalog
  closeLeases: CloseLeasePort
}>

export type CreateSqliteStorageResult =
  | Readonly<{ kind: 'created'; storage: SqlStorage; control: StorageControl }>
  | Readonly<{
      kind: 'rejected'
      reason: 'config_invalid' | 'material_invalid' | 'declared_combination_invalid'
      problems: readonly string[]
    }>

const sleep = (ms: number, signal: AbortSignal): Promise<'deadline'> =>
  new Promise(resolve => {
    const timer = setTimeout(() => resolve('deadline'), ms)
    signal.addEventListener('abort', () => clearTimeout(timer), { once: true })
  })

/**
 * The minimal close of this closure: stop admission, let the Worker queues drain, close every
 * connection and wait for the Workers to exit, up to `closeDeadlineMs`. The reporting latch of
 * SPEC 13.4 and the withdrawal of queued work (13.3) belong to a later closure.
 */
function createControl(core: Core): StorageControl {
  let closing: Promise<StorageCloseResult> | null = null
  const close = (): Promise<StorageCloseResult> => {
    closing ??= (async () => {
      core.lifecycle.closing = true
      const stop = new AbortController()
      const finished = core.domains.closeAll().then(() => 'closed' as const)
      const winner = await Promise.race([finished, sleep(core.config.closeDeadlineMs, stop.signal)])
      stop.abort()
      if (winner === 'closed') return { kind: 'closed' }
      const residuals: StorageResidual[] = core.domains.liveWorkers().map(entry => ({
        domain: { scope: entry.scope, transactionDomain: entry.domain },
        workerRole: 'writer',
        workerGeneration: entry.leaseName.split('/').pop() ?? '',
        leaseName: entry.leaseName,
        inFlight: [],
      }))
      return { kind: 'incomplete', residuals }
    })()
    return closing
  }
  return {
    close: () => close(),
    assemblyReportSettled() {
      // The reporting latch of SPEC 13.4 is not part of this closure.
    },
  }
}

export async function createSqliteStorage(
  input: SqliteStorageInput,
): Promise<CreateSqliteStorageResult> {
  const judged = validateConfig(input.config)
  if (judged.kind === 'invalid')
    return {
      kind: 'rejected',
      reason: 'config_invalid',
      problems: judged.problems.map(problem => `${problem.field}: ${problem.rule}`),
    }
  const checked = await checkMaterials(input.materials)
  if (checked.materialProblems.length > 0)
    return { kind: 'rejected', reason: 'material_invalid', problems: checked.materialProblems }
  if (checked.declaredProblems.length > 0)
    return {
      kind: 'rejected',
      reason: 'declared_combination_invalid',
      problems: checked.declaredProblems,
    }
  const core = createCore(
    judged.config,
    input.materials,
    lifecycle => new Domains(judged.config, input.materials, input.closeLeases, lifecycle),
  )
  const storage: SqlStorage = {
    registerCombination: createRegister(core),
    commit: createCommit(core),
    query: createQuery(core),
    read: createRead(core),
  }
  return { kind: 'created', storage, control: createControl(core) }
}
