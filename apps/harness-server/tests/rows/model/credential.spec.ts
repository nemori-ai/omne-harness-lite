// `model-credential` row: model-host-local `LocalCredentialPlugin` as a row. It injects nothing, so
// it is ACTIVE with nothing else in the tree. The vault is a real file in a temporary directory.
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createLocalCustodian } from '@omne-harness/model-host-local'
import {
  MODEL_SEND,
  decodeCredentialId,
  type CredentialReference,
} from '@omne-harness/model-contract/provider'
import { ModelCredentialService } from '@omne-harness/model-cordis-contract/cordis'
import { rowDeclarationOf } from '../../../src/row.ts'
import { modelCredentialRow } from '../../../src/rows/model-credential/index.ts'
import { serveOnce } from '../../fixtures/serve/harness.ts'
import { TENANT, withLiveRows } from './support.ts'

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
function vaultPath(): string {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'model-credential-row-')))
  directories.push(directory)
  return join(directory, 'vault.json')
}

const FACTORY = 'synth-factory-secret'
const TENANT_SECRET = 'synth-tenant-secret'
const plugins = { modelCredentialRow }

function referenceOf(): CredentialReference {
  const id = decodeCredentialId('cred-a')
  if (!('ok' in id)) throw new Error('fixture credential id')
  return { id: id.ok, tenant: TENANT, purpose: MODEL_SEND }
}

describe('the model-credential row', () => {
  it('declares the formal key, no inject and no shutdown phase', () => {
    expect(rowDeclarationOf(modelCredentialRow)).toEqual({
      row: 'model-credential',
      implementation: 'real',
      manifest: {
        provides: ['modelCredential'],
        injects: [],
        phase: null,
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'none' },
    })
  })

  it('is ACTIVE, creates the vault file and provides the credential service', async () => {
    const path = vaultPath()
    const { value, run } = await withLiveRows(
      {
        rows: [
          {
            id: 'model-credential',
            plugin: 'modelCredentialRow',
            config: { path, factorySecret: FACTORY },
          },
        ],
        plugins,
        probe: ['modelCredential'],
      },
      ctx => ctx.get('modelCredential') as ModelCredentialService,
    )
    expect(value).toBeInstanceOf(ModelCredentialService)
    expect(existsSync(path)).toBe(true)
    expect(run.state('model-credential')).toMatchObject({ state: 'ACTIVE', missing: [] })
    expect(run.tree('model-credential')).toMatchObject({ implementation: 'real' })
    expect(run.result.exitCode).toBe(0)
  })

  it('resolves a tenant credential that was put into the vault file before the row loaded', async () => {
    const path = vaultPath()
    const reference = referenceOf()
    const seeded = createLocalCustodian({ path, factorySecret: FACTORY })
    seeded.put(reference, TENANT_SECRET)
    seeded.close()
    const { value } = await withLiveRows(
      {
        rows: [
          {
            id: 'model-credential',
            plugin: 'modelCredentialRow',
            config: { path, factorySecret: FACTORY },
          },
        ],
        plugins,
        probe: ['modelCredential'],
      },
      ctx => {
        const service = ctx.get('modelCredential') as ModelCredentialService
        return {
          present: service.present(reference),
          resolved: service.resolve(reference, { authorized: true, official: false }),
        }
      },
    )
    expect(value.present).toMatchObject({ kind: 'known', present: true })
    expect(value.resolved).toEqual({ kind: 'value', scope: 'tenant', value: TENANT_SECRET })
  })

  it('does not start without a vault path: the plugin refuses the configuration', async () => {
    const run = await serveOnce({
      distribution: {
        rows: [
          {
            id: 'model-credential',
            plugin: 'modelCredentialRow',
            config: { factorySecret: FACTORY },
          },
        ],
      },
      plugins,
    })
    expect(run.result.exitCode).not.toBe(0)
    expect(run.startup).toMatchObject({ accepting: false })
    expect(run.state('model-credential')?.['state']).not.toBe('ACTIVE')
  })
})
