import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { evaluate } from '@omne-harness-lite/asset-evaluation'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { toOpaqueJson, LosslessNumber } from '@omne-harness-lite/content-blocks'
import { composeMigrations } from '@omne-harness-lite/storage'
import { openStorage, type SqlStorage } from '@omne-harness-lite/storage-sql'
import { assemblyManifestMigrations } from '../src/index.ts'

export async function database<T>(
  fn: (storage: SqlStorage, file: string) => Promise<T>,
): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), 'omne-mf-'))
  const file = join(root, 'store.sqlite')
  const storage = await openStorage({
    dialect: 'sqlite',
    file,
    migrations: composeMigrations(assemblyManifestMigrations),
    upgrade: false,
  })
  try {
    return await fn(storage, file)
  } finally {
    await storage.close()
    rmSync(root, { recursive: true, force: true })
  }
}
export const root = { category: 'agent_definition', name: 'example:root' } as const
export function evaluated() {
  const result = evaluate({
    tenant: unwrap(parseTenantId({ organization: 'org_example', account: 'acc_example' })),
    standing: { standing: 'effective', role: 'member' },
    root: {
      definition: root,
      references: [],
      attributes: [],
      source: { asset: 'ast_example', version: 1 },
    },
    holdings: [
      {
        holder: { layer: 'factory' },
        capability: root,
        asset: 'ast_example',
        basis: { kind: 'official' },
        versionSelection: { kind: 'current' },
        immutable: false,
        assignments: [],
        since: '2026-09-27T00:00:00Z',
      },
    ],
    definitions: [
      {
        id: 'ast_example',
        capability: root,
        origin: 'official',
        versions: [
          {
            number: 1,
            content: {
              category: 'agent_definition',
              body: toOpaqueJson({ references: [], attributes: [] }),
            },
            publishedAt: '2026-09-27T00:00:00Z',
          },
        ],
      },
    ],
  })
  if (!('ok' in result)) throw new Error('public evaluate rejected legal complete input')
  return result.ok
}
export function input(at = 1, kind = 'mint', ref = 'given_a') {
  return {
    evaluation: kind === 'mint' ? { kind } : { kind, ref },
    tables: {
      tool: {
        filledAt: at,
        composition: { precision: new LosslessNumber('0.10000000000000000001') },
      },
    },
    content: {
      evaluation: evaluated(),
      compositionOrder: [],
      opaque: { large: new LosslessNumber('9007199254740993') },
    },
  }
}
