// @module-tag slow
// Why slow: real SQLite files, writer/read Workers, fault triggers and provider restart.
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { operationId, succeeded } from '@omne-harness/session-contract/testing'
import type { SessionCommand, TodoItemId } from '@omne-harness/session-contract'
import { createFixedSessionCursorSigning } from '@omne-harness/session-cordis-contract/testing'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { createSessionStorage } from '../src/index.ts'
import { decodeSessionReply, sessionCommandFacts } from '../src/participants.ts'
import {
  openRealApp,
  identityOf,
  TENANT_A,
  TENANT_B,
  textOf,
  type RealApp,
} from './fixtures/real-provider.ts'
import { unpacked } from './fixtures/packed.ts'

const apps: RealApp[] = []
const roots: string[] = []
afterEach(async () => {
  for (const app of apps.splice(0)) await app.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function open(options: Parameters<typeof openRealApp>[0] = {}) {
  const app = await openRealApp(options)
  apps.push(app)
  return app
}
async function root() {
  const value = await realpath(await mkdtemp(join(tmpdir(), 'session-todos-')))
  roots.push(value)
  return value
}
function add(app: RealApp, name: string, text = name) {
  const access = app.access(TENANT_A)
  const command = {
    kind: 'addTodo',
    input: { tenant: access.tenant, session: access.session, operation: operationId(name), text },
  } as const
  return { access, command, guards: [] }
}
function change(
  app: RealApp,
  kind: 'removeTodo' | 'markTodoComplete',
  name: string,
  item: TodoItemId,
) {
  const access = app.access(TENANT_A)
  const command = {
    kind,
    input: { tenant: access.tenant, session: access.session, operation: operationId(name), item },
  } satisfies SessionCommand
  return { access, command, guards: [] }
}
const file = (app: RealApp) => app.domainFile(app.domainOf(TENANT_A))
function rows(app: RealApp) {
  const db = new DatabaseSync(file(app), { readOnly: true })
  try {
    return Object.fromEntries(
      [
        'sl_journal',
        'sl_entry',
        'sl_state',
        'sl_state_item',
        'sl_operation',
        'sl_operation_evidence',
      ].map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY tenant, session`).all()]),
    )
  } finally {
    db.close()
  }
}

describe('Todo facts through real SQLite Workers', () => {
  it('commits one item for concurrent retries and keeps the same textual operation isolated by tenant', async () => {
    const app = await open()
    succeeded(await app.create(TENANT_A), 'create a')
    succeeded(await app.create(TENANT_B), 'create b')
    const command = add(app, 'same-call')
    const [firstReply, secondReply] = await Promise.all([
      app.port.commit(command),
      app.port.commit(command),
    ])
    for (const reply of [firstReply, secondReply]) {
      if ('failure' in reply)
        expect(reply).toEqual({
          failure: { kind: 'commit-unknown', operation: command.command.input.operation },
        })
    }
    const first = succeeded(
      'failure' in firstReply ? await app.port.commit(command) : firstReply,
      'first recovered',
    )
    const second = succeeded(
      'failure' in secondReply ? await app.port.commit(command) : secondReply,
      'second recovered',
    )
    expect(first.item).toEqual(second.item)
    expect(first.receipt.revision).toBe(second.receipt.revision)
    expect(succeeded(await app.port.readWork(command.access), 'one effect').todos).toHaveLength(1)
    const otherAccess = app.access(TENANT_B)
    const other = succeeded(
      await app.port.commit({
        ...command,
        access: otherAccess,
        command: { ...command.command, input: { ...command.command.input, tenant: TENANT_B } },
      }),
      'other tenant',
    )
    expect(other.item.id).not.toBe(first.item.id)
    expect(succeeded(await app.port.readWork(otherAccess), 'isolated').todos).toEqual([other.item])
  }, 60_000)

  it('recovers the original receipt after SIGKILL of the submitting process', async () => {
    const location = await root()
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL('./fixtures/todos-child.ts', import.meta.url)), location],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const ended = new Promise<void>(resolve => child.once('exit', () => resolve()))
    try {
      await new Promise<void>((resolve, reject) => {
        let output = ''
        let errors = ''
        child.stdout.on('data', (chunk: Buffer) => {
          output += chunk.toString()
          if (output.includes('READY\n')) resolve()
        })
        child.stderr.on('data', (chunk: Buffer) => {
          errors += chunk.toString()
        })
        child.once('error', reject)
        child.once('exit', () =>
          reject(new Error(`child ended before commit: ${output} ${errors}`)),
        )
      })
    } finally {
      child.kill('SIGKILL')
      await ended
    }
    const app = await open({ root: location })
    const snapshot = succeeded(await app.port.readWork(app.access(TENANT_A)), 'restarted')
    const item = snapshot.todos?.[0]
    if (item === undefined) throw new Error('missing durable Todo')
    expect(item.status).toBe('removed')
    const recalled = succeeded(
      await app.port.commit(change(app, 'markTodoComplete', 'crash-complete', item.id)),
      'original complete',
    )
    expect(recalled.item.status).toBe('completed')
    expect(recalled.receipt).toMatchObject({ recovered: true, revision: '3' })
    expect(
      succeeded(await app.port.readWork(app.access(TENANT_A)), 'no resurrection').todos,
    ).toEqual(snapshot.todos)
  }, 60_000)

  it('serializes different items without lost updates and recalls the complete-time receipt after removal and restart', async () => {
    const location = await root()
    const app = await open({ root: location })
    succeeded(await app.create(TENANT_A), 'create')
    const [a, b] = await Promise.all([
      app.port.commit(add(app, 'a')),
      app.port.commit(add(app, 'b')),
    ])
    const first = succeeded(a, 'a')
    const second = succeeded(b, 'b')
    expect(first.item.id).not.toBe(second.item.id)
    const complete = change(app, 'markTodoComplete', 'complete-a', first.item.id)
    const [completed, removed] = await Promise.all([
      app.port.commit(complete),
      app.port.commit(change(app, 'removeTodo', 'remove-b', second.item.id)),
    ])
    const original = succeeded(completed, 'complete')
    succeeded(removed, 'remove b')
    succeeded(
      await app.port.commit(change(app, 'removeTodo', 'remove-a', first.item.id)),
      'remove a',
    )
    const direct = await app.storage.commit({
      identity: identityOf(TENANT_A, app.domainOf(TENANT_A), 'direct-receipt-recall'),
      ...app.combination,
      commands: [sessionCommandFacts(complete.command, [])],
    })
    expect(direct.kind).toBe('committed')
    if (direct.kind !== 'committed' || direct.responses[0] === undefined)
      throw new Error('missing recall response')
    expect(decodeSessionReply(direct.responses[0].reply)).toMatchObject({
      kind: 'participated',
      recovered: true,
      result: original,
    })
    const state = succeeded(await app.port.readWork(app.access(TENANT_A)), 'state')
    expect(state.todos?.map(item => item.status)).toEqual(['removed', 'removed'])
    expect(state.run.kind).toBe('none')
    expect(state.tasks).toEqual([])
    await app.close()
    const resumed = await open({ root: location })
    expect(
      succeeded(await resumed.port.readWork(resumed.access(TENANT_A)), 'restarted').todos,
    ).toEqual(state.todos)
    expect(succeeded(await resumed.port.commit(complete), 'recall')).toEqual({
      ...original,
      receipt: { ...original.receipt, recovered: true },
    })
    expect(
      await resumed.port.commit(change(resumed, 'markTodoComplete', 'fresh', first.item.id)),
    ).toMatchObject({ failure: { kind: 'todo-not-found' } })
    expect(
      succeeded(await resumed.port.commit(add(resumed, 'a')), 'recalled add').item.status,
    ).toBe('pending')
    expect(
      succeeded(await resumed.port.readWork(resumed.access(TENANT_A)), 'unchanged').todos,
    ).toEqual(state.todos)
  }, 60_000)

  it.each([
    'sl_entry',
    'sl_state_item',
    'sl_state',
    'sl_operation',
    'sl_operation_evidence',
    'sl_journal',
  ] as const)(
    'rolls state, log, receipt and access evidence back when %s fails',
    async table => {
      const location = await root()
      const initial = await open({ root: location })
      succeeded(await initial.create(TENANT_A), 'create')
      await initial.close()
      const db = new DatabaseSync(file(initial))
      db.exec(
        `CREATE TRIGGER todo_fault BEFORE ${table === 'sl_journal' ? 'UPDATE' : 'INSERT'} ON ${table} BEGIN SELECT RAISE(ABORT, 'todo injected fault'); END`,
      )
      db.close()
      const app = await open({ root: location })
      const before = rows(app)
      expect(await app.port.commit(add(app, 'fault'))).toHaveProperty('failure')
      expect(rows(app)).toEqual(before)
      expect(succeeded(await app.port.readWork(app.access(TENANT_A)), 'state').todos ?? []).toEqual(
        [],
      )
      await app.close()
      const repair = new DatabaseSync(file(app))
      repair.exec('DROP TRIGGER todo_fault')
      repair.close()
      const resumed = await open({ root: location })
      const result = succeeded(await resumed.port.commit(add(resumed, 'fault')), 'retry')
      expect(result.item.status).toBe('pending')
      expect(
        succeeded(await resumed.port.readWork(resumed.access(TENANT_A)), 'one item').todos,
      ).toHaveLength(1)
      const persisted = rows(resumed)
      expect(persisted.sl_operation?.length).toBe((before.sl_operation?.length ?? 0) + 1)
      expect(persisted.sl_operation_evidence?.length).toBe(
        (before.sl_operation_evidence?.length ?? 0) + 1,
      )
    },
    60_000,
  )

  it('keeps a real commit with a lost ACK recoverable under its original identity', async () => {
    const app = await open()
    succeeded(await app.create(TENANT_A), 'create')
    let lose = true
    const storage: SqlStorage = {
      ...app.storage,
      commit: async request => {
        const actual = await app.storage.commit(request)
        if (lose && actual.kind === 'committed') {
          lose = false
          return {
            kind: 'unknown',
            identity: request.identity,
            diagnostic: 'test drops the committed ACK',
          }
        }
        return actual
      },
    }
    const port = createSessionStorage({
      storage,
      domains: {
        resolve: async () => ({
          kind: 'ready',
          entry: {
            tenant: textOf(TENANT_A),
            domain: {
              scope: { kind: 'tenant', tenant: textOf(TENANT_A) },
              transactionDomain: app.domainOf(TENANT_A),
            },
          },
        }),
        snapshot: async () => ({ kind: 'ready', value: { revision: '1', entries: [] } }),
      },
      accessCheck: app.accessCheck,
      cursorSigning: createFixedSessionCursorSigning(),
      combination: app.combination,
    })
    const command = add(app, 'lost-ack')
    expect(await port.commit(command)).toEqual({
      failure: { kind: 'commit-unknown', operation: command.command.input.operation },
    })
    expect(
      succeeded(
        await port.queryOperation({
          ...command.access,
          operation: command.command.input.operation,
        }),
        'query',
      ).kind,
    ).toBe('committed')
    expect(succeeded(await port.commit(command), 'recall').receipt.recovered).toBe(true)
    expect(succeeded(await port.readWork(command.access), 'one effect').todos).toHaveLength(1)
    expect(
      await port.commit({
        ...command,
        command: {
          ...command.command,
          input: { ...command.command.input, text: 'changed intent' },
        },
      }),
    ).toMatchObject({ failure: { kind: 'conflict' } })
    expect(await app.port.commit({ ...command, access: app.access(TENANT_B) })).toMatchObject({
      failure: { kind: 'denied' },
    })
  }, 60_000)

  it('returns an explicit unavailable when the whole Todo snapshot exceeds the read budget', async () => {
    const app = await open({ readOutputLimitBytes: 16_384 })
    succeeded(await app.create(TENANT_A), 'create')
    for (let n = 0; n < 6; n += 1)
      succeeded(await app.port.commit(add(app, `large-${n}`, 'x'.repeat(4096))), 'add')
    expect(await app.port.readWork(app.access(TENANT_A))).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('read_limit') },
    })
  }, 60_000)

  it.each([20, 200])(
    'records full-read bytes and actual changed chunk bytes for %i items',
    async count => {
      const app = await open()
      succeeded(await app.create(TENANT_A), 'create')
      for (let n = 0; n < count; n += 1)
        succeeded(await app.port.commit(add(app, `sample-${n}`, `${n}:${'x'.repeat(512)}`)), 'add')
      const before = succeeded(await app.port.readWork(app.access(TENANT_A)), 'state')
      const target = before.todos?.[0]
      if (target === undefined) throw new Error('sample item missing')
      const db = new DatabaseSync(file(app))
      try {
        // Instrumentation stays in this test database, using an owned but unaddressed key range.
        db.exec(
          "CREATE TRIGGER todo_measure AFTER INSERT ON sl_state_item BEGIN INSERT OR REPLACE INTO sl_input (tenant, session, input, value) VALUES ('__todo_measure', '__todo_measure', NEW.path || ':' || NEW.seq, hex(NEW.value)); END",
        )
        const samples = []
        for (let n = 0; n < 5; n += 1) {
          db.exec("DELETE FROM sl_input WHERE tenant = '__todo_measure'")
          const writeStart = performance.now()
          succeeded(
            await app.port.commit(
              change(app, 'markTodoComplete', `sample-complete-${n}`, target.id),
            ),
            'complete',
          )
          const writeMs = performance.now() - writeStart
          // The trigger keeps each inserted value as hex; the bytes are those of its packed text.
          const inserted = db
            .prepare("SELECT value FROM sl_input WHERE tenant = '__todo_measure'")
            .all()
            .map(row => unpacked(Buffer.from(String(row['value']), 'hex')))
          const writes = {
            bytes: inserted.reduce((sum, text) => sum + Buffer.byteLength(text), 0),
            chunks: inserted.length,
          }
          const readStart = performance.now()
          const reply = await app.storage.read({
            domain: {
              scope: { kind: 'tenant', tenant: textOf(TENANT_A) },
              transactionDomain: app.domainOf(TENANT_A),
            },
            handler: 'session.work',
            protocol: '1',
            requestKey: `sample-${n}`,
            input: { tenant: textOf(TENANT_A), session: 'session-1' },
          })
          const readMs = performance.now() - readStart
          if (reply.kind !== 'read') throw new Error(`sample read failed: ${reply.kind}`)
          samples.push({
            writeMs,
            readMs,
            readBytes: Buffer.byteLength(JSON.stringify(reply.output)),
            changedChunkBytes: writes?.bytes,
            changedChunks: writes?.chunks,
          })
        }
        console.info(
          JSON.stringify({
            sample: 'todo-sql-io',
            count,
            samples,
            failures: 0,
            excludes: 'head/log/operation/evidence bytes and SQLite page/WAL overhead',
            read: 'full session.work reply',
            write: 'trigger sums exact inserted sl_state_item values',
          }),
        )
        expect(
          succeeded(await app.port.readWork(app.access(TENANT_A)), 'after').todos,
        ).toHaveLength(count)
      } finally {
        db.close()
      }
    },
    60_000,
  )
})
