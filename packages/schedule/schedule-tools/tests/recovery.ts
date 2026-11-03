import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  createScheduleToolEnvironment,
  type ScheduleToolContextRecovery,
} from '@omne-harness/schedule-tools'
import {
  type ToolRecovery,
  type ToolMessageContentBlock,
  type ToolEnvironment,
  type PreparationRecord,
} from '@omne-harness/tool-contract/provider'
import {
  access,
  context,
  adoption,
  evidence,
  operationId,
  request,
  ledger,
  value,
} from './world.ts'

export async function original(input: unknown) {
  const fixed = await request(input)
  const tool = ledger()
  value(
    await tool.commands.admit({ ...access(), operation: operationId('admission'), request: fixed }),
  )
  const recovery = value(await tool.commands.loadRecovery(access()))
  const preparation: PreparationRecord = {
    tenant: access().tenant,
    call: access().call,
    operation: operationId('prepare'),
    adoption,
    inputDigest: 'original',
    purpose: 'initial',
    request: fixed,
  }
  return { recovery, preparation }
}
export function baseEnvironment(): ToolEnvironment<string, { lease: string }> {
  return {
    adoption,
    prepare: async ({ preparation }) =>
      succeed({
        kind: 'prepared',
        environment: {
          value: { lease: 'original-lease' },
          preparation,
          evidence: evidence('lease'),
        },
      }),
    inspectPreparation: async ({ preparation }) =>
      succeed({
        kind: 'prepared',
        environment: {
          value: { lease: 'original-lease' },
          preparation,
          evidence: evidence('lease'),
        },
      }),
    release: async () => succeed({ kind: 'released', evidence: evidence('release') }),
    inspectRelease: async () => succeed({ kind: 'released', evidence: evidence('release') }),
  }
}
export function sqlHost(file: string) {
  const db = new DatabaseSync(file)
  db.exec(
    'PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS original_call (call TEXT PRIMARY KEY, recovery TEXT NOT NULL, context TEXT NOT NULL, digest TEXT NOT NULL)',
  )
  const read = () =>
    db
      .prepare('SELECT recovery, context, digest FROM original_call WHERE call = ?')
      .get(access().call)
  const contexts: ScheduleToolContextRecovery<string> = {
    async restore({ access: current, recovery }) {
      const row = read()
      if (
        row === undefined ||
        typeof row.context !== 'string' ||
        typeof row.digest !== 'string' ||
        current.principal !== 'alice'
      )
        return fail({ kind: 'denied', action: 'restore-context' })
      if (
        createHash('sha256').update(row.context).digest('hex') !== row.digest ||
        row.recovery !== JSON.stringify(recovery)
      )
        return fail({ kind: 'invalid', field: 'context', reason: 'durable-binding-mismatch' })
      const restored = JSON.parse(row.context) as typeof context
      return succeed({
        tenant: current.tenant,
        call: current.call,
        admission: recovery.admission,
        context: restored,
        adapter: adoption,
        source: { ...evidence('original_call/' + current.call), digest: row.digest },
      })
    },
  }
  const commands = {
    async loadRecovery() {
      const row = read()
      if (row === undefined || typeof row.recovery !== 'string')
        return fail({
          kind: 'unavailable' as const,
          dependency: 'original_call',
          diagnostic: 'missing',
        })
      return succeed(JSON.parse(row.recovery) as ToolRecovery<ToolMessageContentBlock>)
    },
  }
  return {
    db,
    commands,
    contexts,
    environment: createScheduleToolEnvironment(baseEnvironment(), { commands, contexts }),
    save(recovery: ToolRecovery<ToolMessageContentBlock>) {
      const contextJson = JSON.stringify(context)
      db.prepare('INSERT INTO original_call VALUES (?, ?, ?, ?)').run(
        access().call,
        JSON.stringify(recovery),
        contextJson,
        createHash('sha256').update(contextJson).digest('hex'),
      )
    },
    close: () => db.close(),
  }
}
