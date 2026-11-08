// @module-tag slow
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import type { LedgerRecord } from '@omne-harness/tool'
import type { ToolRenderedResult } from '@omne-harness/tool-contract'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'
import * as cordis from '../../../src/cordis.ts'
import { runServe, type S0Record } from '../../../src/run.ts'
import type { ShutdownReport } from '../../../src/shutdown.ts'
import { startModelGateway } from '../../fixtures/model-gateway.ts'
import { bodyOf, freePort, newScratch, operatorLayer, runOmne } from '../../r9/support.ts'
import { connectable, until } from '../server-entry/support.ts'
import { createLargeBodyModule, largeBodyModule } from './large-body-author.ts'
import { largeBodyRelease, adoptLargeBody } from './large-body-release.ts'
import { largeBodyModel } from './large-body-model.ts'
import { writerRecoveryStorage } from './writer-recovery-storage.ts'

const PAYLOAD = 'W3 durable fragment 正文🙂'

function inventory(storageRoot: string) {
  const rows: LedgerRecord[] = []
  const bytes: string[] = []
  for (const name of readdirSync(join(storageRoot, 'domains')).filter(name =>
    name.endsWith('.sqlite'),
  )) {
    const db = new DatabaseSync(join(storageRoot, 'domains', name), { readOnly: true })
    try {
      if (!db.prepare("SELECT name FROM sqlite_schema WHERE name='tl_record'").get()) continue
      for (const row of db.prepare('SELECT record FROM tl_record').all())
        rows.push(JSON.parse(String(row['record'])) as LedgerRecord)
      for (const row of db
        .prepare('SELECT material,data FROM tl_material_chunk ORDER BY idx')
        .all())
        if (String(row['material']).includes('body-fragment:'))
          bytes.push(Buffer.from(row['data'] as Uint8Array).toString('utf8'))
    } finally {
      db.close()
    }
  }
  return { rows, bytes }
}

it.skipIf(process.platform !== 'linux')(
  'W3-B automatically resumes a staged writer after the complete release host is rebuilt',
  { timeout: 180_000 },
  async () => {
    const dir = newScratch('writer-recovery-')
    const port = await freePort()
    const home = join(dir.base, 'home')
    const returned = Promise.withResolvers<ToolRenderedResult<ToolMessageContentBlock>>()
    let executions = 0
    let staged = false
    const module = createLargeBodyModule({
      execute: async (_arguments, _environment, context) => {
        executions += 1
        const begin = await context.body.begin('answer', {
          kind: 'text',
          codec: largeBodyModule.executor,
        })
        if ('failure' in begin) throw new Error(JSON.stringify(begin.failure))
        const append = await context.body.append('answer', '1', {
          kind: 'text',
          block: 'answer',
          text: PAYLOAD,
          end: true,
        })
        expect(append).toHaveProperty('failure.kind', 'unknown')
        staged = true
        return returned.promise
      },
    })
    const extension = largeBodyRelease(module)
    const fault = writerRecoveryStorage()
    const model = largeBodyModel('fixture observation ended')
    const gateway = await startModelGateway(model.script)
    gateway.trustInProcess()
    const distribution: unknown = JSON.parse(
      readFileSync(new URL('../../../config/serve.distribution.json', import.meta.url), 'utf8'),
    )
    const layer = operatorLayer({
      storageRoot: dir.storageRoot,
      port,
      modelRoute: gateway.url,
    }) as {
      ops: { id: string; config?: Record<string, unknown> }[]
    }
    const operator = {
      ops: layer.ops.map(op =>
        op.id === 'tool-material-maintenance'
          ? { ...op, config: { ...op.config, intervalMs: 20 } }
          : op,
      ),
    }
    let stop = new AbortController()
    const records: S0Record[] = []
    const errors: string[] = []
    const start = () =>
      runServe({
        distribution: adoptLargeBody(distribution),
        operator,
        plugins: { ...cordis, toolHostRow: extension.toolHostRow, storageRow: fault.row },
        entryObjects: extension.entryObjects,
        stateRoot: dir.stateRoot,
        stop: stop.signal,
        readinessTimeoutMs: 15_000,
        shutdownDeadlineMs: 5000,
        write: record => records.push(record),
        stderr: text => errors.push(text),
      })
    let running = start()
    try {
      await until(() => connectable('127.0.0.1', port), 'writer recovery server to listen', 20_000)
      const cli = (args: readonly string[], credential?: string) =>
        runOmne({
          args: [...args],
          home,
          server: `http://127.0.0.1:${port}`,
          cwd: dir.base,
          ...(credential === undefined ? {} : { credential }),
        })
      expect(
        (await cli(['register', '--login-identifier', 'writer'], 'writer-test-credential')).status,
      ).toBe(0)
      expect(
        (await cli(['login', '--login-identifier', 'writer'], 'writer-test-credential')).status,
      ).toBe(0)
      const created = await cli(['create-session', '--definition', 'coding'])
      expect(created.status, JSON.stringify(created)).toBe(0)
      const session = String(bodyOf(created)['session'])
      expect(
        (await cli(['send-input', '--session', session, '--text', 'save the answer'])).status,
      ).toBe(0)
      await until(() => staged, 'writer durable admission', 30_000)
      const original = inventory(dir.storageRoot).rows.find(
        row => row.kind === 'body-writer-append',
      )
      expect(original).toMatchObject({
        append: { state: { kind: 'staged', payload: { text: PAYLOAD } } },
      })
      const attemptsBefore = fault.attempts.length
      expect(attemptsBefore).toBeGreaterThan(0)
      stop.abort('test: retire original host')
      const first = await running
      const shutdown = records.findLast(record => record.kind === 'shutdown-result')
      expect(first.exitCode, JSON.stringify({ shutdown, errors })).toBe(5)
      if (shutdown?.kind !== 'shutdown-result') throw new Error('missing shutdown report')
      const outcomes = shutdown['outcomes'] as ShutdownReport['outcomes']
      expect(outcomes.filter(outcome => outcome.result.kind !== 'settled')).toEqual([
        expect.objectContaining({
          row: 'agent-host',
          result: {
            kind: 'incomplete',
            detail: expect.stringContaining('quiesce left 1 execution(s) unresolved'),
          },
        }),
      ])
      fault.fault.available = true
      stop = new AbortController()
      running = start()
      await until(() => connectable('127.0.0.1', port), 'replacement host to listen', 20_000)
      await until(
        () =>
          inventory(dir.storageRoot).rows.some(
            row => row.kind === 'body-writer-append' && row.append.state.kind === 'retained',
          ),
        'production maintenance to recover the original writer',
        30_000,
      )
      const restored = inventory(dir.storageRoot)
      expect(restored.bytes.join('')).toBe(PAYLOAD)
      expect(executions).toBe(1)
      expect(fault.attempts.length).toBeGreaterThan(attemptsBefore)
      for (const attempt of fault.attempts) expect(attempt).toEqual(fault.attempts[0])
      const append = restored.rows.find(row => row.kind === 'body-writer-append')
      if (original?.kind !== 'body-writer-append' || append?.kind !== 'body-writer-append')
        throw new Error('writer responsibility missing')
      expect(append.append.operation).toBe(original.append.operation)
      expect(append.append.state).not.toHaveProperty('payload')
      stop.abort('test: stop replacement host')
      expect((await running).exitCode).toBe(0)
    } finally {
      stop.abort('test: cleanup')
      await running.catch(() => undefined)
      returned.resolve({
        content: [],
        original: { kind: 'none' },
        data: { kind: 'none' },
        attachments: [],
      })
      await gateway.close()
      dir.remove()
    }
  },
)
