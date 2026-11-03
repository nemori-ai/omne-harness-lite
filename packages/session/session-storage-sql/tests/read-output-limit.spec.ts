// The output limit of the read handlers of the member (`materials.ts`, `READ_OUTPUT_LIMIT_BYTES`: 20
// MiB, session-storage-sql SPEC K-1) on the Agent records: the whole state of a session comes back
// through `execution-record.parts` as one output, so a state past the old bound of 1 MiB is read whole
// and a state whose output passes 20 MiB answers `read_limit`, never a part of it. The state is written
// through the real commit path, so the write bounds of the provider are raised for this file: the
// command of the largest state has to fit `maxCommandBytes`. The limit is a literal here, not the
// constant of the source, so that a changed constant turns the cases red.
// @module-tag slow
// Why slow: real Workers and real files; a state of 20 MiB is written and read.
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { executionRecordFacts, decodeExecutionRecordParts } from '../src/participants.ts'
import {
  identityOf,
  jointWrite,
  openRealApp,
  TENANT_A,
  textOf,
  type RealApp,
} from './fixtures/real-provider.ts'

const LIMIT = 20 * 1024 * 1024
/** The write bounds that let a command of a little more than the limit in. */
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
  const app = await openRealApp({ root, config: WRITE })
  apps.push(app)
  expect('ok' in (await app.create(TENANT_A))).toBe(true)
  return app
}

/** The first page of the parts read after a state whose text is `pad` bytes long was written. */
async function stateOfSize(pad: number) {
  const app = await opened()
  const operation = 'aop_big'
  const committed = await app.storage.commit({
    identity: identityOf(TENANT_A, 'dom_0', operation),
    ...app.combination,
    commands: [
      executionRecordFacts(jointWrite({ operation, state: { pad: 'x'.repeat(pad) } })),
    ],
  })
  expect(committed.kind).toBe('committed')
  return app.storage.read({
    domain: { scope: { kind: 'tenant', tenant: textOf(TENANT_A) }, transactionDomain: 'dom_0' },
    handler: 'execution-record.parts',
    protocol: '1',
    requestKey: `parts-${String(pad)}`,
    input: { tenant: textOf(TENANT_A), session: 'session-1' },
  })
}

describe('the output limit of the read handlers on the Agent records', () => {
  it('a state of 2 MiB, past the old bound of 1 MiB, is read whole', async () => {
    const size = 2 * 1024 * 1024
    const result = await stateOfSize(size)
    expect(result.kind).toBe('read')
    if (result.kind !== 'read') return
    const page = decodeExecutionRecordParts(result.output)
    expect(page?.published).toBe('1')
    expect((page?.state as { pad: string }).pad.length).toBe(size)
  })

  it('a state that fills the limit but for a few hundred bytes is read whole', async () => {
    const size = LIMIT - 1024
    const result = await stateOfSize(size)
    expect(result.kind).toBe('read')
    if (result.kind !== 'read') return
    expect((decodeExecutionRecordParts(result.output)?.state as { pad: string }).pad.length).toBe(
      size,
    )
  })

  it('a state whose output is past 20 MiB answers read_limit, and nothing of it', async () => {
    const result = await stateOfSize(LIMIT)
    expect(result).toMatchObject({ kind: 'unavailable', reason: 'read_limit' })
    expect(result).not.toHaveProperty('output')
  })
})
