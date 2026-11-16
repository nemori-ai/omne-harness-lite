// @module-tag slow
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/sql-contract'
import { blobDigest, decodeExecutionRecordBlob, executionRecordFacts } from '../src/participants.ts'
import {
  identityOf,
  jointWrite,
  openRealApp,
  TENANT_A,
  textOf,
  type RealApp,
} from './fixtures/real-provider.ts'

const LIMIT = 20 * 1024 * 1024
const WRITE = {
  maxCommandBytes: LIMIT + 1024 * 1024,
  maxRequestBytes: LIMIT + 2 * 1024 * 1024,
  groupMaxInputBytes: LIMIT + 2 * 1024 * 1024,
}

const apps: RealApp[] = []
const roots: string[] = []
afterEach(async () => {
  for (const app of apps.splice(0)) await app.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function opened(): Promise<RealApp> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'session-read-output-')))
  roots.push(root)
  const app = await openRealApp({ root, config: WRITE, readOutputLimitBytes: LIMIT })
  apps.push(app)
  expect('ok' in (await app.create(TENANT_A))).toBe(true)
  return app
}

async function stateOfSize(pad: number) {
  const app = await opened()
  const operation = 'aop_big'
  const payload = 'x'.repeat(pad)
  const digest = blobDigest(payload)
  const committed = await app.storage.commit({
    identity: identityOf(TENANT_A, 'dom_0', operation),
    ...app.combination,
    commands: [
      executionRecordFacts(
        jointWrite({ operation, blobs: [{ digest, media: 'text/plain', payload }] }),
      ),
    ],
  })
  expect(committed.kind).toBe('committed')
  return app.storage.read({
    domain: { scope: { kind: 'tenant', tenant: textOf(TENANT_A) }, transactionDomain: 'dom_0' },
    handler: 'execution-record.blob',
    protocol: '1',
    requestKey: `blob-${String(pad)}`,
    input: { tenant: textOf(TENANT_A), digest },
  })
}

function padLength(output: JsonValue): number {
  const found = decodeExecutionRecordBlob(output)
  if (found?.kind !== 'blob') throw new Error('the read output is not a block')
  return found.payload.length
}

describe('the output limit of the read handlers on the content blocks', () => {
  it('a block of 2 MiB, past the old bound of 1 MiB, is read whole', async () => {
    const size = 2 * 1024 * 1024
    const result = await stateOfSize(size)
    expect(result.kind).toBe('read')
    if (result.kind !== 'read') return
    expect(decodeExecutionRecordBlob(result.output)).toMatchObject({ size: String(size) })
    expect(padLength(result.output)).toBe(size)
  })

  it('a block that fills the limit but for a few hundred bytes is read whole', async () => {
    const size = LIMIT - 1024
    const result = await stateOfSize(size)
    expect(result.kind).toBe('read')
    if (result.kind !== 'read') return
    expect(padLength(result.output)).toBe(size)
  })

  it('a block whose output is past 20 MiB answers read_limit, and nothing of it', async () => {
    const result = await stateOfSize(LIMIT)
    expect(result).toMatchObject({ kind: 'unavailable', reason: 'read_limit' })
    expect(result).not.toHaveProperty('output')
  })
})
