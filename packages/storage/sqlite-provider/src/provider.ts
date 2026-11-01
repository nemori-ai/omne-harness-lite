// The pure factory (SPEC 2.1, 5.3). Construction checks configuration, material digests and the
// declared combinations. It opens no database and starts no Worker. The operations and the close
// control are built from one Core, so the Worker, the queues and the result owner live in this
// object and never on a caller Context (IC-13).
import type {
  CloseLeasePort,
  SqlMaterialCatalog,
  SqlStorage,
  StorageControl,
} from '@omne-harness/sql-contract'
import { ReportLatch, createControl, noReadPool, type ReadPoolPort } from './close.ts'
import { createCommit } from './commit.ts'
import { validateConfig } from './config.ts'
import { createCore } from './core.ts'
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

/** Wiring that the application does not give: the read pool that SPEC 9.5 describes. */
export type SqliteStorageInternals = Readonly<{ readPool?: ReadPoolPort }>

export async function createSqliteStorage(
  input: SqliteStorageInput,
  internals: SqliteStorageInternals = {},
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
  const latch = new ReportLatch()
  const readPool = internals.readPool ?? noReadPool
  const core = createCore(
    judged.config,
    input.materials,
    lifecycle =>
      new Domains(judged.config, input.materials, input.closeLeases, lifecycle, {
        latch,
        readPool,
      }),
  )
  const storage: SqlStorage = {
    registerCombination: createRegister(core),
    commit: createCommit(core),
    query: createQuery(core),
    read: createRead(core),
  }
  return {
    kind: 'created',
    storage,
    control: createControl({
      config: core.config,
      lifecycle: core.lifecycle,
      domains: core.domains,
      inFlight: core.inFlight,
      readPool,
      latch,
    }),
  }
}
