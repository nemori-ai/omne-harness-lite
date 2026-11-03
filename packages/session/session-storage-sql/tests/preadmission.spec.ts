// The preadmission records of the `execution-record` participant (M-GENERATION SaveIntent, Commit
// and Lookup): the intent of one handoff H is saved with its entry Ki before the answer comes back;
// one Ki names one H; the outcome is fixed once; another tenant reads nothing. The first part runs
// over the node:sqlite test provider; the last case kills a child process on the real provider and
// reads the record back with a new one.
import { spawn } from 'node:child_process'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import { sessionId } from '@omne-harness/session-contract/testing'
import type { JsonValue, SqlStorage } from '@omne-harness/sql-contract'
import {
  decodePreadmissionRecord,
  decodePreadmissionReply,
  EXECUTION_RECORD_HANDLERS,
  preadmissionFacts,
  type PreadmissionIntentWrite,
  type PreadmissionOutcomeWrite,
  type PreadmissionRead,
} from '../src/participants.ts'
import { app, textOf, TENANT_A, TENANT_B } from './fixtures/app.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'
import {
  identityOf,
  openRealApp,
  preadmissionIntent,
  type RealApp,
} from './fixtures/real-provider.ts'

const domainOf = (tenant: TenantId): string =>
  textOf(tenant) === textOf(TENANT_A) ? 'dom_0' : 'dom_1'

let writes = 0
async function write(
  storage: SqlStorage,
  combination: Readonly<{ combinationVersion: string; manifestDigest: string }>,
  value: PreadmissionIntentWrite | PreadmissionOutcomeWrite,
  domain: (tenant: TenantId) => string = domainOf,
) {
  writes += 1
  const result = await storage.commit({
    identity: identityOf(value.tenant, domain(value.tenant), `preadmission-${String(writes)}`),
    ...combination,
    commands: [preadmissionFacts(value)],
  })
  if (result.kind !== 'committed' && result.kind !== 'rolled_back')
    throw new Error(`the preadmission write did not settle: ${JSON.stringify(result)}`)
  const reply = result.responses[result.responses.length - 1]?.reply
  if (reply === undefined) throw new Error('a receipt without a reply')
  return { settled: result.kind, answer: decodePreadmissionReply(reply) }
}

async function lookup(
  storage: SqlStorage,
  tenant: TenantId,
  key: Readonly<{ handoff: string }> | Readonly<{ entry: string }>,
  domain: (tenant: TenantId) => string = domainOf,
) {
  const input: PreadmissionRead = { tenant: textOf(tenant), ...key }
  const read = await storage.read({
    domain: {
      scope: { kind: 'tenant', tenant: textOf(tenant) },
      transactionDomain: domain(tenant),
    },
    handler: EXECUTION_RECORD_HANDLERS.preadmission,
    protocol: '1',
    requestKey: `lookup-${String(writes)}`,
    input: input as JsonValue,
  })
  if (read.kind !== 'read') throw new Error(`the preadmission read failed: ${read.kind}`)
  const record = decodePreadmissionRecord(read.output)
  if (record === 'malformed') throw new Error('the preadmission record does not decode')
  return record
}

const COMBINATION = { combinationVersion: 'c1', manifestDigest: 'a'.repeat(64) }

async function fixture() {
  const a = await app()
  const storage = a.provider.storage
  return {
    a,
    save: (value: PreadmissionIntentWrite | PreadmissionOutcomeWrite) =>
      write(storage, COMBINATION, value),
    find: (tenant: TenantId, key: Readonly<{ handoff: string }> | Readonly<{ entry: string }>) =>
      lookup(storage, tenant, key),
    rows: () =>
      Number(a.provider.select('dom_0', 'SELECT COUNT(*) FROM er_preadmission').rows[0]?.[0]),
  }
}

const outcome = (kind: 'prepared' | 'rejected', detail = 'one'): PreadmissionOutcomeWrite => ({
  phase: 'outcome',
  tenant: TENANT_A,
  handoff: 'handoff-1',
  outcome: { kind, detail },
})

describe('the intent phase', () => {
  it('saves Ki, H, the complete request, origin, principal, qualification, adoption and materials before it answers', async () => {
    const f = await fixture()
    const intent = preadmissionIntent()
    const { settled, answer } = await f.save(intent)
    expect(settled).toBe('committed')
    expect(answer).toMatchObject({ kind: 'saved', created: true })
    const record = await f.find(TENANT_A, { handoff: 'handoff-1' })
    expect(record).toEqual({
      tenant: textOf(TENANT_A),
      handoff: 'handoff-1',
      entry: 'entry-1',
      session: 'session-1',
      execution: null,
      intent: intent.intent,
      intentDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      outcome: null,
      outcomeDigest: null,
    })
    expect(answer.kind === 'saved' ? answer.record : null).toEqual(record)
    expect(await f.find(TENANT_A, { entry: 'entry-1' })).toEqual(record)
  })

  it('the same Ki under another H answers the original record and its H, and writes nothing', async () => {
    const f = await fixture()
    await f.save(preadmissionIntent())
    const { answer } = await f.save({
      ...preadmissionIntent({ request: 'another' }),
      handoff: 'handoff-2',
    })
    expect(answer).toMatchObject({
      kind: 'saved',
      created: false,
      record: { handoff: 'handoff-1', entry: 'entry-1' },
    })
    expect(f.rows()).toBe(1)
    expect(await f.find(TENANT_A, { handoff: 'handoff-2' })).toBeNull()
  })

  it('the same H recalls the same intent and conflicts with another, writing nothing', async () => {
    const f = await fixture()
    const first = await f.save(preadmissionIntent())
    const again = await f.save(preadmissionIntent())
    expect(again.answer).toEqual({ ...first.answer, created: false })
    const other = await f.save({ ...preadmissionIntent({ request: 'another' }), entry: 'entry-2' })
    expect(other.settled).toBe('rolled_back')
    expect(other.answer).toMatchObject({ kind: 'conflict', record: { handoff: 'handoff-1' } })
    expect(f.rows()).toBe(1)
    expect(await f.find(TENANT_A, { entry: 'entry-2' })).toBeNull()
  })

  it('the table refuses a second record of one Ki in a tenant, and keeps records without Ki apart', () => {
    const { port } = migratedPort()
    const insert = (handoff: string, entry: string | null) =>
      port.execute(
        `INSERT INTO er_preadmission (tenant, handoff, entry, session, execution, intent, intent_digest) VALUES ('t', ?, ?, NULL, NULL, '{}', 'd')`,
        [handoff, entry],
      )
    insert('h-1', 'k-1')
    expect(() => insert('h-2', 'k-1')).toThrow()
    insert('h-3', null)
    insert('h-4', null)
    expect(port.execute('SELECT COUNT(*) AS n FROM er_preadmission LIMIT 1').rows[0]?.[0]).toBe(3n)
  })
})

describe('the outcome phase', () => {
  it('fixes prepared once; the same outcome recalls and another conflicts', async () => {
    const f = await fixture()
    await f.save(preadmissionIntent())
    const fixed = await f.save(outcome('prepared'))
    expect(fixed.answer).toMatchObject({
      kind: 'saved',
      created: true,
      record: { outcome: { kind: 'prepared', detail: 'one' } },
    })
    expect((await f.save(outcome('prepared'))).answer).toEqual({ ...fixed.answer, created: false })
    for (const other of [outcome('rejected'), outcome('prepared', 'two')]) {
      const refused = await f.save(other)
      expect(refused.settled).toBe('rolled_back')
      expect(refused.answer).toMatchObject({
        kind: 'conflict',
        record: { outcome: { kind: 'prepared', detail: 'one' } },
      })
    }
    expect((await f.find(TENANT_A, { handoff: 'handoff-1' }))?.outcome).toEqual({
      kind: 'prepared',
      detail: 'one',
    })
  })

  it('an outcome without a saved intent is invalid and writes nothing', async () => {
    const f = await fixture()
    const { settled, answer } = await f.save(outcome('rejected'))
    expect(settled).toBe('rolled_back')
    expect(answer).toMatchObject({ kind: 'invalid' })
    expect(f.rows()).toBe(0)
  })
})

describe('the tenant of a preadmission record', () => {
  it('another tenant reads nothing by the same H or the same Ki, and may hold its own', async () => {
    const f = await fixture()
    await f.save(preadmissionIntent())
    expect(await f.find(TENANT_B, { handoff: 'handoff-1' })).toBeNull()
    expect(await f.find(TENANT_B, { entry: 'entry-1' })).toBeNull()
    const own = await f.save({ ...preadmissionIntent({ request: 'b' }), tenant: TENANT_B })
    expect(own.answer).toMatchObject({ kind: 'saved', created: true })
    expect((await f.find(TENANT_A, { handoff: 'handoff-1' }))?.intent).toEqual(
      preadmissionIntent().intent,
    )
  })
})

const roots: string[] = []
const apps: RealApp[] = []
afterEach(async () => {
  for (const real of apps.splice(0)) await real.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('the process is killed after the intent was answered', () => {
  // Why slow: a real provider in a child process that is killed, and a second real provider.
  it(
    'a new provider on the same files reads the complete record by its original H',
    { tags: ['slow'] },
    async () => {
      const root = await realpath(await mkdtemp(join(tmpdir(), 'session-preadmission-')))
      roots.push(root)
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(new URL('./fixtures/real-provider-child.ts', import.meta.url)),
          root,
          'preadmission',
        ],
        { stdio: ['ignore', 'pipe', 'inherit'] },
      )
      const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
      const line = await new Promise<string>((resolve, reject) => {
        let text = ''
        child.stdout.on('data', (chunk: Buffer) => {
          text += chunk.toString()
          if (text.includes('\n')) resolve(text.trim())
        })
        child.once('exit', () => reject(new Error(`child ended before the answer: ${text}`)))
      })
      expect(line).toBe('SAVED saved')
      child.kill('SIGKILL')
      await exited
      const real = await openRealApp({ root })
      apps.push(real)
      const record = await lookup(real.storage, TENANT_A, { handoff: 'handoff-1' }, real.domainOf)
      expect(record).toMatchObject({
        handoff: 'handoff-1',
        entry: 'entry-1',
        session: sessionId('session-1'),
        intent: preadmissionIntent().intent,
        outcome: null,
      })
    },
  )
})
