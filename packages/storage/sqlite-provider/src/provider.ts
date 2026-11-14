import type {
  CloseLeasePort,
  SqlMaterialCatalog,
  SqlStorage,
  StorageControl,
} from '@omne-harness/sql-contract'
import { ReportLatch, createControl } from './close.ts'
import { createCommit } from './commit.ts'
import { validateConfig } from './config.ts'
import { createCore, type Core } from './core.ts'
import { Domains } from './domains.ts'
import { checkMaterials } from './materials.ts'
import { createQuery } from './query.ts'
import { createRead } from './read.ts'
import { createRegister } from './register.ts'

export type SqliteStorageInput = Readonly<{
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

function oversizedHandlers(catalog: SqlMaterialCatalog, maxReadResultBytes: number): string[] {
  return catalog.readHandlers
    .filter(handler => handler.maxOutputBytes > maxReadResultBytes)
    .map(
      handler =>
        `readHandlers ${handler.handler}: maxOutputBytes ${String(handler.maxOutputBytes)} exceeds maxReadResultBytes ${String(maxReadResultBytes)}`,
    )
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
  const oversized = oversizedHandlers(input.materials, judged.config.maxReadResultBytes)
  if (oversized.length > 0)
    return { kind: 'rejected', reason: 'material_invalid', problems: oversized }
  if (checked.declaredProblems.length > 0)
    return {
      kind: 'rejected',
      reason: 'declared_combination_invalid',
      problems: checked.declaredProblems,
    }
  const latch = new ReportLatch()
  const core: Core = createCore(
    judged.config,
    input.materials,
    lifecycle =>
      new Domains(judged.config, input.materials, input.closeLeases, lifecycle, {
        latch,
        readGate: {
          pause: domain => core.readers.pauseDispatch(domain),
          resume: domain => core.readers.resumeDispatch(domain),
        },
        readers: {
          count: () => core.readers.count(),
          retireIdle: () => core.readers.retireIdle(),
          slotFreed: () => core.readers.slotFreed(),
        },
      }),
  )
  const storage: SqlStorage = {
    database: Object.freeze({}),
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
      admission: core.admission,
      domains: core.domains,
      inFlight: core.inFlight,
      readers: core.readers,
      latch,
    }),
  }
}
