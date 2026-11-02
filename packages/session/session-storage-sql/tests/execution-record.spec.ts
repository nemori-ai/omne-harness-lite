// The `execution-record` participant and the joint commit of the Session log combination, over the
// node:sqlite test provider: one storage commit with an `execution-record` and a `session` command
// is all or nothing; the publication count and the head revision guard the write; the original
// answer is unique per operation; a read-only check writes no row and its conflict stops the batch;
// the common root moves on a publication of either side and is read in one snapshot.
import { describe, expect, it } from 'vitest'
import {
  combinationManifest,
  type JsonValue,
  type SqlIdentity,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  creation,
  evidence,
  guard,
  inputId,
  operationId,
  ordinaryInput,
  sessionId,
} from '@omne-harness/session-contract/testing'
import {
  deriveDriveOperation,
  type DurableEvidence,
  type SessionCommand,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  decodeExecutionRecordReply,
  decodeSessionHistoryRoot,
  decodeSessionReply,
  executionRecordFacts,
  sessionCheckFacts,
  sessionCommandFacts,
  type ExecutionRecordWrite,
  type SessionCheck,
} from '../src/participants.ts'
import { canonicalText, decodeValue, sha256 } from '../src/codec.ts'
import { sessionStorageMaterials } from '../src/materials.ts'
import { app, TENANT_A, TENANT_B, textOf, type App } from './fixtures/app.ts'

const SESSION = sessionId('session-1')
const ok = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}

const identity = (operation: string, tenant: TenantId = TENANT_A): SqlIdentity => ({
  scope: { kind: 'tenant', tenant: textOf(tenant) },
  transactionDomain: tenant === TENANT_A ? 'dom_0' : 'dom_1',
  operation,
  protocolVersion: '2',
  operationKey: `${operation}#1`,
})

function write(over: Partial<ExecutionRecordWrite> = {}): ExecutionRecordWrite {
  const execution = over.execution ?? 'exe_1'
  return {
    tenant: TENANT_A,
    session: SESSION,
    execution,
    expected: null,
    revision: '1',
    published: '0',
    operation: 'aop_open',
    digest: 'sha256:open',
    answer: { kind: 'answer', value: 'open' },
    state: { opaque: ['state', 1] },
    boundaries: [
      {
        execution,
        revision: over.revision ?? '1',
        receipt: evidence(`agent/${execution}/1`),
        emittedThrough: '1',
        ended: null,
      },
    ],
    facts: [{ execution, sequence: '1', source: evidence('agent/event/1'), kinds: ['producer'] }],
    batches: [],
    admissions: [],
    ...over,
  }
}

async function joint(
  a: App,
  name: string,
  commands: Parameters<App['provider']['storage']['commit']>[0]['commands'],
  tenant: TenantId = TENANT_A,
) {
  return a.provider.storage.commit({
    identity: identity(name, tenant),
    combinationVersion: 'c1',
    manifestDigest: 'a'.repeat(64),
    commands,
  })
}

async function read(a: App, handler: string, input: JsonValue, tenant: TenantId = TENANT_A) {
  const result = await a.provider.storage.read({
    domain: {
      scope: { kind: 'tenant', tenant: textOf(tenant) },
      transactionDomain: tenant === TENANT_A ? 'dom_0' : 'dom_1',
    },
    handler,
    protocol: '1',
    requestKey: 'r',
    input,
  })
  if (result.kind !== 'read') throw new Error(`read ${handler}: ${JSON.stringify(result)}`)
  return result.output
}

const root = async (a: App) =>
  decodeSessionHistoryRoot(
    await read(a, 'session.history-root', { tenant: textOf(TENANT_A), session: SESSION }),
  )
const state = async (a: App, tenant: TenantId = TENANT_A) =>
  read(a, 'execution-record.state', { tenant: textOf(tenant), session: SESSION }, tenant)
const count = (a: App, table: string): number =>
  Number(a.provider.select('dom_0', `SELECT COUNT(*) AS n FROM ${table}`).rows[0]?.[0] ?? 0)

const acceptCommand = (name: string): SessionCommand => ({
  kind: 'accept',
  input: {
    tenant: TENANT_A,
    session: SESSION,
    operation: operationId(`accept-${name}`),
    value: ordinaryInput(name),
  },
})
const login = [guard('login', 'login-entry', 'present')]

/**
 * A session with input `input-1` accepted and an active Run that started execution E. `grant` is
 * the receipt of the startRun batch: Session hands it to `invoke` as the SE15 grant and as the SE13
 * source basis (PA-01 item 1).
 */
async function running(
  a: App,
  tenant: TenantId = TENANT_A,
  session = 'session-1',
  first = 'input-1',
) {
  ok(await a.create(tenant, session))
  ok(await a.accept(tenant, session, first))
  const started = ok<{ receipt: { source: DurableEvidence } }>(
    await a.port.commit({
      access: a.access(tenant, session),
      command: {
        kind: 'startRun',
        input: {
          tenant,
          session: sessionId(session),
          operation: operationId(`start-run-${session}`),
          entry: 'interactive',
          candidate: creation().definition.candidate,
          instance: { owner: 'agent', id: 'instance-1' },
        },
      },
      guards: [guard('evidence-bridge', 'login-entry', { session, operation: 'start-run' })],
    }),
  )
  const work = ok<WorkSnapshot>(await a.port.readWork(a.access(tenant, session)))
  if (work.run.kind !== 'active') throw new Error('no active Run')
  return { execution: work.run.execution.execution, grant: started.receipt.source, work }
}

/** Accepts the ordinary input `name`: the source of the receipt is its SE11 receipt (PA-01 item 2). */
async function admitted(a: App, name: string): Promise<DurableEvidence> {
  return ok<{ source: DurableEvidence }>(await a.accept(TENANT_A, 'session-1', name)).source
}

/** The input as the Agent accepted it: its identity, its message and the source basis Session gave. */
const acceptedAs = (name: string, source: DurableEvidence) => ({
  input: inputId(name),
  origin: source,
  message: ordinaryInput(name).message,
})

/** Cancels the active Run of `work` by a forced cancel-run control. */
async function cancel(a: App, work: WorkSnapshot) {
  if (work.run.kind !== 'active') throw new Error('no active Run')
  ok(
    await a.port.commit({
      access: a.access(TENANT_A),
      command: {
        kind: 'control',
        input: {
          tenant: TENANT_A,
          session: SESSION,
          operation: operationId('cancel'),
          intent: { kind: 'cancel-run', run: work.run.run, urgency: 'force' },
        },
      },
      guards: [],
    }),
  )
}

describe('the materials of the Session log combination', () => {
  const materials = sessionStorageMaterials()
  const catalog: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    participants: materials.participants,
    migrations: materials.migrations,
    readHandlers: materials.readHandlers,
    declaredCombinations: { tenant: null, system: null },
  }

  it('a combination of the session participant alone is invalid: it reads the execution-record tables', () => {
    expect(combinationManifest({ catalog, participants: ['session'] }).kind).toBe(
      'combination_invalid',
    )
  })

  it('both participants form a combination, execution-record before session', () => {
    const manifest = combinationManifest({ catalog, participants: ['execution-record', 'session'] })
    expect(manifest.kind).toBe('manifest')
    if (manifest.kind !== 'manifest') return
    expect(JSON.stringify(manifest.manifest).indexOf('"execution-record"')).toBeLessThan(
      JSON.stringify(manifest.manifest).indexOf('"session"'),
    )
  })
})

describe('the first publication: one commit with an execution-record and a session command', () => {
  it('commits both, adds one to the publication count and moves the common root by both sides', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    const before = await root(a)
    const result = await joint(a, 'aop_joint', [
      executionRecordFacts(write()),
      sessionCommandFacts(acceptCommand('joint'), login),
    ])
    expect(result.kind).toBe('committed')
    if (result.kind !== 'committed') return
    expect(result.responses.map(item => item.participant)).toEqual(['execution-record', 'session'])
    expect(decodeExecutionRecordReply(result.responses[0]!.reply)).toEqual({
      kind: 'published',
      published: '1',
      digest: expect.any(String),
    })
    expect(decodeSessionReply(result.responses[1]!.reply).kind).toBe('participated')
    const after = await root(a)
    expect(after?.published).toBe('1')
    expect(BigInt(after!.sessionPosition)).toBeGreaterThan(BigInt(before!.sessionPosition))
    expect(after?.position).toBe(String(BigInt(after!.sessionPosition) + 1n))
    expect(await state(a)).toEqual({ published: '1', state: { opaque: ['state', 1] } })
  })

  for (const [where, pattern] of [
    ['after the execution-record writes', /INSERT OR REPLACE INTO er_root/],
    ['after the session writes', /INSERT INTO sl_operation/],
  ] as const)
    it(`a failure ${where} leaves neither side: no row, no count, no Session entry`, async () => {
      const a = await app()
      ok(await a.create(TENANT_A))
      const entries = count(a, 'sl_entry')
      a.provider.failWrite(pattern)
      const result = await joint(a, 'aop_fail', [
        executionRecordFacts(write()),
        sessionCommandFacts(acceptCommand('fail'), login),
      ])
      expect(result.kind).toBe('rolled_back')
      expect(count(a, 'er_operation')).toBe(0)
      expect(count(a, 'er_execution')).toBe(0)
      expect(count(a, 'er_fact_idx')).toBe(0)
      expect(count(a, 'sl_entry')).toBe(entries)
      expect((await root(a))?.published).toBe('0')
      expect(await state(a)).toEqual({ published: '0', state: null })
    })
})

describe('the guards of an execution-record write', () => {
  it('a head revision other than expected, or a stale publication count, is a conflict with the current values and writes nothing', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    expect((await joint(a, 'aop_1', [executionRecordFacts(write())])).kind).toBe('committed')
    const stale = await joint(a, 'aop_2', [
      executionRecordFacts(
        write({ operation: 'aop_2', expected: '2', revision: '3', published: '1' }),
      ),
    ])
    expect(stale.kind).toBe('rolled_back')
    if (stale.kind !== 'rolled_back') return
    expect(decodeExecutionRecordReply(stale.responses[0]!.reply)).toEqual({
      kind: 'revision-conflict',
      revision: '1',
      published: '1',
    })
    const behind = await joint(a, 'aop_3', [
      executionRecordFacts(
        write({ operation: 'aop_3', expected: '1', revision: '2', published: '0' }),
      ),
    ])
    expect(
      behind.kind === 'rolled_back' && decodeExecutionRecordReply(behind.responses[0]!.reply),
    ).toEqual({ kind: 'revision-conflict', revision: '1', published: '1' })
    expect(count(a, 'er_operation')).toBe(1)
    const next = await joint(a, 'aop_4', [
      executionRecordFacts(
        write({ operation: 'aop_4', expected: '1', revision: '2', published: '1', facts: [] }),
      ),
    ])
    expect(next.kind).toBe('committed')
  })

  it('an operation that has an original answer is a conflict that carries the original digest and answer', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    expect((await joint(a, 'aop_x', [executionRecordFacts(write())])).kind).toBe('committed')
    const again = await joint(a, 'aop_y', [
      executionRecordFacts(write({ published: '1', expected: '1', digest: 'sha256:other' })),
    ])
    expect(
      again.kind === 'rolled_back' && decodeExecutionRecordReply(again.responses[0]!.reply),
    ).toEqual({
      kind: 'operation-conflict',
      digest: 'sha256:open',
      answer: { kind: 'answer', value: 'open' },
    })
    expect((await state(a)) as { published: string }).toMatchObject({ published: '1' })
  })

  it('an execution of the same identity in another session is a conflict: nothing is written and the first session keeps it', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    expect((await joint(a, 'aop_first', [executionRecordFacts(write())])).kind).toBe('committed')
    const elsewhere = sessionId('session-2')
    // The head revision and the publication count of the other session both look right: the
    // execution belongs to session-1.
    const stolen = await joint(a, 'aop_stolen', [
      executionRecordFacts(
        write({
          session: elsewhere,
          operation: 'aop_stolen',
          expected: '1',
          revision: '2',
          published: '0',
          state: { opaque: ['other'] },
        }),
      ),
    ])
    expect(stolen.kind).toBe('rolled_back')
    expect(
      stolen.kind === 'rolled_back' && decodeExecutionRecordReply(stolen.responses[0]!.reply),
    ).toEqual({ kind: 'revision-conflict', revision: '1', published: '0' })
    expect(a.provider.select('dom_0', 'SELECT session FROM er_execution').rows).toEqual([
      ['session-1'],
    ])
    expect(count(a, 'er_operation')).toBe(1)
    expect(await state(a)).toEqual({ published: '1', state: { opaque: ['state', 1] } })
  })

  it('reads and writes of another tenant see nothing of this tenant', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    expect((await joint(a, 'aop_t', [executionRecordFacts(write())])).kind).toBe('committed')
    expect(await state(a, TENANT_B)).toEqual({ published: '0', state: null })
    expect(
      await read(
        a,
        'execution-record.operation',
        { tenant: textOf(TENANT_B), operation: 'aop_open' },
        TENANT_B,
      ),
    ).toBeNull()
    expect(
      await read(a, 'execution-record.operation', {
        tenant: textOf(TENANT_A),
        operation: 'aop_open',
      }),
    ).toEqual({ digest: 'sha256:open', answer: { kind: 'answer', value: 'open' } })
  })
})

describe('the read-only checks of the session participant (JC-26, JC-27)', () => {
  it('a check that holds participates and writes no Session row; the Agent side is saved', async () => {
    const a = await app()
    const { execution, grant } = await running(a)
    const entries = count(a, 'sl_entry')
    const operations = count(a, 'sl_operation')
    const check: SessionCheck = {
      kind: 'open',
      tenant: TENANT_A,
      session: SESSION,
      execution,
      grant,
      initial: acceptedAs('input-1', grant),
    }
    const result = await joint(a, 'aop_open_check', [
      executionRecordFacts(write({ execution })),
      sessionCheckFacts(check),
    ])
    expect(result.kind).toBe('committed')
    if (result.kind !== 'committed') return
    expect(decodeSessionReply(result.responses[1]!.reply)).toMatchObject({
      kind: 'participated',
      result: { kind: 'checked', advance: 'ordinary' },
    })
    expect(count(a, 'sl_entry')).toBe(entries)
    expect(count(a, 'sl_operation')).toBe(operations)
    expect(count(a, 'er_operation')).toBe(1)
  })

  it('a check that fails reaches the committer as a conflict, and the batch writes no row of either side', async () => {
    const a = await app()
    const { execution } = await running(a)
    const entries = count(a, 'sl_entry')
    const submit: SessionCheck = {
      kind: 'submit',
      tenant: TENANT_A,
      session: SESSION,
      execution,
      value: (({ origin, message }) => ({ input: inputId('never-accepted'), origin, message }))(
        ordinaryInput('never-accepted'),
      ),
    }
    const result = await joint(a, 'aop_submit_check', [
      executionRecordFacts(write({ execution })),
      sessionCheckFacts(submit),
    ])
    expect(result.kind).toBe('rolled_back')
    if (result.kind !== 'rolled_back') return
    expect(decodeSessionReply(result.responses[1]!.reply)).toEqual({
      kind: 'stopped',
      failure: { kind: 'denied', action: 'submit' },
    })
    expect(count(a, 'er_operation')).toBe(0)
    expect(count(a, 'sl_entry')).toBe(entries)
  })

  it('an attach whose grant names no SE15 of this execution is denied; the grant of the current attempt participates', async () => {
    const a = await app()
    const { execution, grant } = await running(a)
    const attach = (name: string, value: unknown) =>
      joint(a, name, [
        executionRecordFacts(write({ execution, operation: name })),
        sessionCheckFacts({
          kind: 'attach',
          tenant: TENANT_A,
          session: SESSION,
          execution,
          grant: value as never,
        }),
      ])
    const foreign = await attach('aop_attach_1', evidence('not-a-grant'))
    expect(
      foreign.kind === 'rolled_back' && decodeSessionReply(foreign.responses[1]!.reply),
    ).toEqual({ kind: 'stopped', failure: { kind: 'denied', action: 'attach' } })
    expect((await attach('aop_attach_2', grant)).kind).toBe('committed')
  })

  it('after a cancel the last attempt granted before it attaches for the wind-down, an earlier one is stale (PA-01 item 3)', async () => {
    const a = await app()
    const { execution, grant: first, work } = await running(a)
    if (work.run.kind !== 'active') throw new Error('no active Run')
    const claimed = ok<{ receipt: { source: unknown } }>(
      await a.port.commit({
        access: a.access(TENANT_A),
        command: {
          kind: 'claim',
          input: {
            tenant: TENANT_A,
            session: SESSION,
            operation: operationId('claim'),
            run: work.run.run,
            instance: { owner: 'agent', id: 'instance-2' },
            continuity: evidence('continuity'),
          },
        },
        guards: [],
      }),
    )
    const last = claimed.receipt.source
    await cancel(a, work)
    const attach = (name: string, grant: unknown) =>
      joint(a, name, [
        executionRecordFacts(write({ execution, operation: name })),
        sessionCheckFacts({
          kind: 'attach',
          tenant: TENANT_A,
          session: SESSION,
          execution,
          grant: grant as never,
        }),
      ])
    const earlier = await attach('aop_wind_1', first)
    expect(
      earlier.kind === 'rolled_back' && decodeSessionReply(earlier.responses[1]!.reply),
    ).toMatchObject({ kind: 'stopped', failure: { kind: 'stale-advance', current: null } })
    const winding = await attach('aop_wind_2', last)
    expect(winding.kind).toBe('committed')
    expect(
      winding.kind === 'committed' && decodeSessionReply(winding.responses[1]!.reply),
    ).toMatchObject({
      kind: 'participated',
      result: { kind: 'checked', advance: 'wind-down', attempt: expect.any(String) },
    })
  })

  it('a cancelled finish participates only under the control the SE26 of the Run refers to (PA-02)', async () => {
    const a = await app()
    const { execution, work } = await running(a)
    await cancel(a, work)
    const cancelled = ok<WorkSnapshot>(await a.port.readWork(a.access(TENANT_A)))
    const control = cancelled.controls.find(item => item.intent.kind === 'control')
    if (control === undefined) throw new Error('no cancel control')
    const finish = (name: string, by: string | null) =>
      joint(a, name, [
        executionRecordFacts(write({ execution, operation: name })),
        sessionCheckFacts({
          kind: 'finish',
          tenant: TENANT_A,
          session: SESSION,
          execution,
          conclusion: 'cancelled',
          control: by,
        }),
      ])
    const own = deriveDriveOperation({ kind: 'control', execution, control: control.operation })
    // The refusals first: they write nothing, so the accepted finish below is the first write.
    for (const [name, by] of [
      [
        'aop_fin_other',
        deriveDriveOperation({ kind: 'control', execution, control: 'sop_other' as never }),
      ],
      ['aop_fin_none', null],
    ] as const) {
      const refused = await finish(name, by)
      expect(
        refused.kind === 'rolled_back' && decodeSessionReply(refused.responses[1]!.reply),
      ).toMatchObject({ kind: 'stopped', failure: { kind: 'changed' } })
    }
    expect(count(a, 'er_operation')).toBe(0)
    expect((await finish('aop_fin_own', own)).kind).toBe('committed')
  })

  it('a finish while an input Session accepted for this Run is not handed over is changed (PA-02)', async () => {
    const a = await app()
    const { execution } = await running(a)
    ok(await a.accept(TENANT_A, 'session-1', 'input-2'))
    const result = await joint(a, 'aop_finish', [
      executionRecordFacts(write({ execution })),
      sessionCheckFacts({
        kind: 'finish',
        tenant: TENANT_A,
        session: SESSION,
        execution,
        conclusion: 'complete',
        control: null,
      }),
    ])
    expect(
      result.kind === 'rolled_back' && decodeSessionReply(result.responses[1]!.reply),
    ).toMatchObject({ kind: 'stopped', failure: { kind: 'changed' } })
    expect(count(a, 'er_operation')).toBe(0)
  })
})

describe('the source basis of open and submit (PA-01 items 1 and 2)', () => {
  const open = (
    a: App,
    name: string,
    check: Omit<Extract<SessionCheck, { kind: 'open' }>, 'kind'>,
  ) =>
    joint(a, name, [
      executionRecordFacts(write({ execution: check.execution, operation: name })),
      sessionCheckFacts({ kind: 'open', ...check }),
    ])
  const submit = (
    a: App,
    name: string,
    execution: string,
    value: Extract<SessionCheck, { kind: 'submit' }>['value'],
  ) =>
    joint(a, name, [
      executionRecordFacts(write({ execution, operation: name })),
      sessionCheckFacts({ kind: 'submit', tenant: TENANT_A, session: SESSION, execution, value }),
    ])
  const stoppedAs = (result: Awaited<ReturnType<typeof joint>>) =>
    result.kind === 'rolled_back' ? decodeSessionReply(result.responses[1]!.reply) : result.kind

  it('open holds on the receipt of the SE13 Session handed to invoke, not on the origin of the input', async () => {
    const a = await app()
    const { execution, grant } = await running(a)
    // The C24 counterexample: the source is the startRun receipt, the stored origin is intake/input-1.
    expect(grant.record).not.toBe(ordinaryInput('input-1').origin.record)
    const result = await open(a, 'aop_open_se13', {
      tenant: TENANT_A,
      session: SESSION,
      execution,
      grant,
      initial: acceptedAs('input-1', grant),
    })
    expect(result.kind).toBe('committed')
    expect(
      result.kind === 'committed' && decodeSessionReply(result.responses[1]!.reply),
    ).toMatchObject({
      kind: 'participated',
      result: { kind: 'checked', advance: 'ordinary' },
    })
  })

  it('open holds on the evidence of the SE13 entry itself', async () => {
    const a = await app()
    const { execution, grant } = await running(a)
    const row = a.provider.select(
      'dom_0',
      "SELECT position, revision, entry FROM sl_entry WHERE kind = 'run.started'",
    ).rows[0]
    if (row === undefined) throw new Error('no SE13 row')
    const entry = decodeValue(JSON.parse(String(row[2])) as JsonValue)
    const se13: DurableEvidence = {
      owner: '@omne-harness/session-storage-sql',
      record: `${textOf(TENANT_A)}/${SESSION}/entry/${String(row[0])}`,
      revision: String(row[1]),
      digest: `sha256:${sha256(canonicalText(entry))}`,
    }
    const result = await open(a, 'aop_open_entry', {
      tenant: TENANT_A,
      session: SESSION,
      execution,
      grant,
      initial: acceptedAs('input-1', se13),
    })
    expect(result.kind).toBe('committed')
  })

  it('open is denied when the source names no SE13 of this execution, or the input is not the first one it records', async () => {
    const a = await app()
    const { execution, grant } = await running(a)
    const other = await running(a, TENANT_A, 'session-2', 'other-1')
    const se11 = await admitted(a, 'input-2')
    const uncommitted = { ...grant, record: `${textOf(TENANT_A)}/${SESSION}/99`, revision: '99' }
    const cases = [
      ['the SE13 of another session', acceptedAs('input-1', other.grant)],
      ['a receipt of no committed batch', acceptedAs('input-1', uncommitted)],
      [
        'a receipt whose revision is not a number',
        acceptedAs('input-1', { ...grant, revision: 'r3' }),
      ],
      ['the origin of the input', acceptedAs('input-1', ordinaryInput('input-1').origin)],
      ['the SE11 receipt of an input', acceptedAs('input-1', se11)],
      ['an input other than the first of SE13', acceptedAs('input-2', grant)],
      [
        'a message other than the one Session admitted',
        { ...acceptedAs('input-1', grant), message: ordinaryInput('input-2').message },
      ],
    ] as const
    for (const [index, [, initial]] of cases.entries()) {
      const result = await open(a, `aop_open_bad_${index}`, {
        tenant: TENANT_A,
        session: SESSION,
        execution,
        grant,
        initial,
      })
      expect(stoppedAs(result)).toEqual({
        kind: 'stopped',
        failure: { kind: 'denied', action: 'open' },
      })
    }
    expect(count(a, 'er_operation')).toBe(0)
  })

  it('open of the next Run is denied on the SE13 of the Run before it, though both record the same first input', async () => {
    const a = await app()
    const { grant: before, work } = await running(a)
    await cancel(a, work)
    const next = ok<{ receipt: { source: DurableEvidence } }>(
      await a.port.commit({
        access: a.access(TENANT_A),
        command: {
          kind: 'startRun',
          input: {
            tenant: TENANT_A,
            session: SESSION,
            operation: operationId('start-run-next'),
            entry: 'interactive',
            candidate: creation().definition.candidate,
            instance: { owner: 'agent', id: 'instance-1' },
          },
        },
        guards: [guard('evidence-bridge', 'login-entry', { session: SESSION, operation: 'next' })],
      }),
    ).receipt.source
    const current = ok<WorkSnapshot>(await a.port.readWork(a.access(TENANT_A)))
    if (current.run.kind !== 'active') throw new Error('no active Run')
    const execution = current.run.execution.execution
    const check = { tenant: TENANT_A, session: SESSION, execution, grant: next }
    // The input the cancel left pending is the first input of the next Run as well.
    expect(String(current.run.first)).toBe('input-1')
    const refused = await open(a, 'aop_open_previous', {
      ...check,
      initial: acceptedAs('input-1', before),
    })
    expect(stoppedAs(refused)).toEqual({
      kind: 'stopped',
      failure: { kind: 'denied', action: 'open' },
    })
    const opened = await open(a, 'aop_open_next', {
      ...check,
      initial: acceptedAs(String(current.run.first), next),
    })
    expect(opened.kind).toBe('committed')
  })

  it('open in another tenant is denied on the receipt of this tenant, though the names are the same', async () => {
    const a = await app()
    const own = await running(a)
    const theirs = await running(a, TENANT_B)
    const result = await joint(
      a,
      'aop_open_tenant',
      [
        executionRecordFacts(write({ tenant: TENANT_B, execution: theirs.execution })),
        sessionCheckFacts({
          kind: 'open',
          tenant: TENANT_B,
          session: SESSION,
          execution: theirs.execution,
          grant: theirs.grant,
          initial: acceptedAs('input-1', own.grant),
        }),
      ],
      TENANT_B,
    )
    expect(stoppedAs(result)).toEqual({
      kind: 'stopped',
      failure: { kind: 'denied', action: 'open' },
    })
  })

  it('submit holds on the SE11 receipt of the input; the receipt of another input or the origin is denied', async () => {
    const a = await app()
    const { execution } = await running(a)
    const second = await admitted(a, 'input-2')
    const third = await admitted(a, 'input-3')
    for (const [index, value] of [
      acceptedAs('input-2', third),
      acceptedAs('input-2', ordinaryInput('input-2').origin),
      { ...acceptedAs('input-2', second), message: ordinaryInput('input-3').message },
    ].entries())
      expect(stoppedAs(await submit(a, `aop_submit_bad_${index}`, execution, value))).toEqual({
        kind: 'stopped',
        failure: { kind: 'denied', action: 'submit' },
      })
    const result = await submit(a, 'aop_submit_se11', execution, acceptedAs('input-2', second))
    expect(result.kind).toBe('committed')
    expect(
      result.kind === 'committed' && decodeSessionReply(result.responses[1]!.reply),
    ).toMatchObject({
      kind: 'participated',
      result: { kind: 'checked' },
    })
  })
  it('a revision with more rows than the read bound fails the check; it does not judge on part of them', async () => {
    const a = await app()
    const { execution } = await running(a)
    const second = await admitted(a, 'input-2')
    a.provider.seed(
      'dom_0',
      `INSERT INTO sl_entry (tenant, session, position, revision, kind, entry, bytes)
         WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 10001)
         SELECT ?, 'session-1', 1000000 + i, 777, 'intake.routed', '{}', 2 FROM n`,
      [textOf(TENANT_A)],
    )
    const result = await submit(a, 'aop_submit_bound', execution, {
      ...acceptedAs('input-2', second),
      origin: { ...second, revision: '777' },
    })
    expect(result.kind).toBe('rolled_back')
    expect(stoppedAs(result)).toMatchObject({
      kind: 'failed',
      diagnostic: expect.stringContaining('read bound'),
    })
  })
})

describe('the common log root', () => {
  it('an Agent publication alone moves the root position, and a Session commit after it sees the new root', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    const first = await root(a)
    expect((await joint(a, 'aop_alone', [executionRecordFacts(write())])).kind).toBe('committed')
    const second = await root(a)
    expect(second?.sessionPosition).toBe(first?.sessionPosition)
    expect(BigInt(second!.position)).toBe(BigInt(first!.position) + 1n)
    expect(second?.source).not.toEqual(first?.source)
    ok(await a.accept(TENANT_A, 'session-1', 'later'))
    const third = await root(a)
    expect(third?.published).toBe('1')
    expect(BigInt(third!.position)).toBeGreaterThan(BigInt(second!.position))
  })
})
