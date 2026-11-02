// M4-6, an early guard only: `modelStorageMaterials()` and `sessionStorageMaterials()` form a valid
// combination for one tenant domain, and a construction that checks materials verifies the code
// digests of both. The combination guarantee itself belongs to the session storage combination row
// of the application (L-APP).
import { copyFileSync, mkdtempSync, rmSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CALL_HANDLER,
  COMMAND_RESERVE_BYTES,
  MODEL_PARTICIPANT,
  createSqlModelCommands,
  modelStorageMaterials,
  type ModelStorageMaterials,
} from '@omne-harness/model-storage-sql'
import { sessionStorageMaterials } from '@omne-harness/session-storage-sql'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import { createMemorySqlStorage } from '@omne-harness/sql-contract/testing'
import { coreOptions, lookup, sqliteStorage, tenantOf, textOf } from './fixture.ts'

function catalogOf(model: ModelStorageMaterials): SqlMaterialCatalog {
  const session = sessionStorageMaterials()
  return {
    catalogProtocol: 'sql-catalog/1',
    participants: [...session.participants, ...model.participants],
    migrations: [...session.migrations, ...model.migrations],
    readHandlers: [...session.readHandlers, ...model.readHandlers],
    declaredCombinations: {
      tenant: {
        combinationVersion: 'session-model-1',
        participants: [...session.participants.map(item => item.participant), MODEL_PARTICIPANT],
      },
      system: null,
    },
  }
}

/** The materials with the module of `model.call` moved to `url`; its digest is kept as it was. */
function withCallModuleAt(model: ModelStorageMaterials, url: string): ModelStorageMaterials {
  return {
    ...model,
    readHandlers: model.readHandlers.map(item =>
      item.handler === CALL_HANDLER ? { ...item, moduleUrl: url } : item,
    ),
  }
}

describe('the combination with the session log', () => {
  it('forms a valid manifest, and the SQL commands take its digest', () => {
    const catalog = catalogOf(modelStorageMaterials())
    const participants = catalog.declaredCombinations.tenant?.participants ?? []
    const manifest = combinationManifest({ catalog, participants })
    if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
    expect(manifest.manifest.participants.map(item => item.participant)).toContain(
      MODEL_PARTICIPANT,
    )
    const A = tenantOf('a')
    expect(() =>
      createSqlModelCommands({
        ...coreOptions([A]).options,
        storage: sqliteStorage().storage,
        domains: lookup([textOf(A)], 'shared'),
        combination: {
          combinationVersion: 'session-model-1',
          manifestDigest: manifestDigest(manifest.manifest),
        },
        maxCallBytes: 1 << 20,
        maxCommandBytes: (1 << 20) + COMMAND_RESERVE_BYTES,
      }),
    ).not.toThrow()
  })

  it('passes the construction that checks the code digests of both members', async () => {
    const built = await createMemorySqlStorage({ materials: catalogOf(modelStorageMaterials()) })
    expect(await built.control.close({ initiator: 'disposal' })).toEqual({ kind: 'closed' })
  })

  it('fails the construction when the code digest of the model participant does not match', async () => {
    const model = modelStorageMaterials()
    const [participant] = model.participants
    if (participant === undefined) throw new Error('no participant')
    const tampered = { ...model, participants: [{ ...participant, codeDigest: 'f'.repeat(64) }] }
    await expect(createMemorySqlStorage({ materials: catalogOf(tampered) })).rejects.toThrow(
      'material_digest_mismatch: participant model',
    )
  })

  it('fails the construction when a handler file changes and its digest is not updated', async () => {
    const model = modelStorageMaterials()
    const call = model.readHandlers.find(item => item.handler === CALL_HANDLER)
    if (call === undefined) throw new Error('no model.call handler')
    const dir = mkdtempSync(join(tmpdir(), 'model-materials-'))
    try {
      const copy = join(dir, 'handler-call.js')
      copyFileSync(fileURLToPath(call.moduleUrl), copy)
      const moved = withCallModuleAt(model, pathToFileURL(copy).href)
      const same = await createMemorySqlStorage({ materials: catalogOf(moved) })
      await same.control.close({ initiator: 'disposal' })
      appendFileSync(copy, '\n// changed\n')
      await expect(createMemorySqlStorage({ materials: catalogOf(moved) })).rejects.toThrow(
        `material_digest_mismatch: handler ${CALL_HANDLER}`,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
