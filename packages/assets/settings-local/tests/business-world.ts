import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { z } from 'zod'
import { settingsSourceIdentities } from '@omne-harness/settings'
import { openPreparationWorld, reply } from './preparation-world.ts'
import { definition } from './world.ts'
import { canonical, digest, stateKey } from '../src/encoding.ts'
import { intentCommandDigest } from '../src/intent-records.ts'
import { sourceKey, sourceReservationKey } from '../src/source-retention-records.ts'
import { sourceRequest, sourceSnapshot } from './source-retention-world.ts'
import { stateRecordSchema } from '../src/schema.ts'
import type { IntentAllocation } from '../src/intent-schema.ts'
import type { CommitCurrent } from '../src/commit-current.ts'

function database(root: string, readOnly = false) {
  return new DatabaseSync(
    join(root, 'domains', `${Buffer.from('intent-test').toString('hex')}.sqlite`),
    { readOnly },
  )
}
export function seedState(root: string, input: IntentAllocation, revision: number, locked = false) {
  const sql = database(root)
  const sources = input.plan.sources.map(source => ({
    id: source.sourceId,
    values:
      locked && source.sourceId === 'organization'
        ? [{ itemId: 'enabled', value: { kind: 'absent' }, locked: true }]
        : [],
  }))
  const record = stateRecordSchema.parse({
    scope: input.identity.domain.scope,
    target: input.identity.operation.target,
    definitionRef:
      input.intent.kind === 'change'
        ? input.intent.command.definitionRef
        : input.intent.command.from,
    state: { revision, sources },
    sourceLayout: { kind: 'bound', sources: settingsSourceIdentities(input.plan.sources) },
  })
  try {
    sql
      .prepare('INSERT INTO st_states (target_key, record) VALUES (?, ?)')
      .run(stateKey(record.scope, record.target), canonical(record))
  } finally {
    sql.close()
  }
}
export function seedGate(root: string, input: IntentAllocation, held = false, foreign = false) {
  const sql = database(root)
  const source = { domain: input.identity.domain, target: input.identity.operation.target }
  const identity = foreign
    ? { ...input.identity, operation: { ...input.identity.operation, operationId: 'another-root' } }
    : input.identity
  const update = { source, identity, commandDigest: intentCommandDigest(input.intent) }
  try {
    sql
      .prepare(
        'INSERT INTO st_source_gate (source_key, source_json, pending_key, pending_json) VALUES (?, ?, ?, ?)',
      )
      .run(sourceKey(source), canonical(source), digest(identity), canonical(update))
    if (held) {
      const request = { ...sourceRequest(), source }
      const snapshot = sourceSnapshot()
      snapshot.source = source
      snapshot.projection.target = source.target
      sql
        .prepare(
          "INSERT INTO st_source_reservation (reservation_key, source_key, request_json, snapshot_json, state, outcome) VALUES (?, ?, ?, ?, 'held', NULL)",
        )
        .run(
          sourceReservationKey(request),
          sourceKey(source),
          canonical(request),
          canonical(snapshot),
        )
    }
  } finally {
    sql.close()
  }
}
export function sourceRoot(input: IntentAllocation) {
  input.purpose = {
    kind: 'source-update',
    sourceKey: sourceKey({
      domain: input.identity.domain,
      target: input.identity.operation.target,
    }),
  }
}
export function stored(root: string) {
  const sql = database(root, true)
  try {
    const row = sql.prepare('SELECT record FROM st_states LIMIT 1').get()
    const count = (table: string) =>
      Number(sql.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n)
    return {
      state: row ? stateRecordSchema.parse(JSON.parse(z.string().parse(row.record))) : null,
      operations: count('st_operations'),
      changes: count('st_changes'),
      terminals: count('st_terminals'),
    }
  } finally {
    sql.close()
  }
}
export async function openBusinessWorld(
  options: Parameters<typeof openPreparationWorld>[0] = {},
  prepare = true,
) {
  const w = await openPreparationWorld(options)
  if (prepare) {
    const ready = reply(await w.world.ready(w.current))
    z.object({
      result: z.object({
        attempt: z.object({ status: z.object({ state: z.literal('prepared') }) }),
      }),
    }).parse(ready)
  }
  const current: CommitCurrent = {
    binding: w.current.binding,
    observation: {
      kind: 'available',
      material: {
        basis: w.current.basis,
        standing: w.current.standing,
        sources: w.current.sources,
        definition,
        grants: [{ sourceId: 'tenant', actions: ['set', 'clear', 'lock', 'unlock'] }],
      },
    },
  }
  return { ...w, commitCurrent: current }
}
