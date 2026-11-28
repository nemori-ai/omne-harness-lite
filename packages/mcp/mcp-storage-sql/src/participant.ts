import type { JsonValue } from '@omne-harness/sql-contract'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { insertTask, loadCatalog, markOnce, saveCatalog, stepTask, type SqlPort } from './rows.ts'
import {
  dropGrant,
  loadGrant,
  putPending,
  saveClient,
  saveGrant,
  takePending,
  voidPending,
  type GrantCells,
} from './rows-grants.ts'
import { forgetHolding } from './rows-holdings.ts'
import {
  acknowledgeThrough,
  dropSubscription,
  endSubscription,
  loadSubscription,
  receiveBatch,
  saveSubscription,
  type Batch,
  type SubscriptionCells,
} from './rows-subscriptions.ts'
import {
  PARTICIPANT,
  PROTOCOL,
  SCRIPTS,
  type CatalogRowKey,
  type ScriptName,
  type TaskRowCells,
} from './schema.ts'

type WriteCatalog = Readonly<{
  key: CatalogRowKey
  revision: number
  record: JsonValue
  expected: number | 'absent'
}>

type Step = Readonly<{ state: string; round: number }>

type WriteGrant = Readonly<{
  cells: GrantCells
  revision: number
  row: JsonValue
  expected: number | 'absent'
}>

/** The commands come from this member's own store, so their shape is not parsed again here. */
const RUN: Record<ScriptName, (port: SqlPort, command: never) => unknown> = {
  // Written whole, only at the expected revision.
  writeCatalog(port, input: WriteCatalog) {
    const current = loadCatalog(port, input.key)?.revision ?? 'absent'
    if (current !== input.expected) return { failure: 'revision-conflict' }
    saveCatalog(port, input.key, input.revision, input.record)
    return { ok: 'written' }
  },
  markContinuation(port, input: Readonly<{ tenant: string; checkpoint: string }>) {
    return { ok: markOnce(port, input.tenant, input.checkpoint) }
  },
  recordTask(port, input: Readonly<{ key: TaskRowCells; account: string; row: Step }>) {
    insertTask(port, input.key, input.account, input.row)
    return { ok: 'recorded' }
  },
  moveTask(port, input: Readonly<{ key: TaskRowCells; from: Step; to: Step }>) {
    return { ok: stepTask(port, input.key, input.from, input.to) }
  },
  beginPending(port, input: Readonly<{ cells: GrantCells; state: string; row: JsonValue }>) {
    putPending(port, input.cells, input.state, input.row)
    return { ok: 'begun' }
  },
  takePending(port, input: Readonly<{ tenant: string; state: string }>) {
    return { ok: takePending(port, input.tenant, input.state) }
  },
  voidPending(port, input: Readonly<{ cells: GrantCells }>) {
    voidPending(port, input.cells)
    return { ok: 'void' }
  },
  // Written whole, only at the expected revision.
  writeGrant(port, input: WriteGrant) {
    const current = loadGrant(port, input.cells)?.revision ?? 'absent'
    if (current !== input.expected) return { failure: 'conflict' }
    saveGrant(port, input.cells, input.revision, input.row)
    return { ok: 'written' }
  },
  removeGrant(port, input: Readonly<{ cells: GrantCells }>) {
    dropGrant(port, input.cells)
    return { ok: 'removed' }
  },
  register(port, input: Readonly<{ tenant: string; issuer: string; row: JsonValue }>) {
    saveClient(port, input.tenant, input.issuer, input.row)
    return { ok: 'registered' }
  },
  forgetHolding(port, input: Readonly<{ tenant: string; holding: string }>) {
    forgetHolding(port, input.tenant, input.holding)
    return { ok: 'forgotten' }
  },
  // Written whole, only at the expected revision; the position is not part of the write.
  writeSubscription(
    port,
    input: Readonly<{
      cells: SubscriptionCells
      revision: number
      cursor: string | null
      row: JsonValue
      expected: number | 'absent'
    }>,
  ) {
    const current = loadSubscription(port, input.cells)?.revision ?? 'absent'
    if (current !== input.expected) return { failure: 'conflict' }
    saveSubscription(port, input.cells, input.revision, input.cursor, input.row)
    return { ok: 'written' }
  },
  removeSubscription(port, input: Readonly<{ cells: SubscriptionCells }>) {
    dropSubscription(port, input.cells)
    return { ok: 'removed' }
  },
  receiveEvents(port, input: Readonly<{ cells: SubscriptionCells; batch: Batch }>) {
    return { ok: receiveBatch(port, input.cells, input.batch) }
  },
  endSubscription(port, input: Readonly<{ cells: SubscriptionCells; reason: string; at: string }>) {
    return { ok: endSubscription(port, input.cells, input.reason, input.at) }
  },
  acknowledgeEvents(port, input: Readonly<{ cells: SubscriptionCells; seq: number }>) {
    acknowledgeThrough(port, input.cells, input.seq)
    return { ok: 'acknowledged' }
  },
}

export default {
  participant: PARTICIPANT,
  protocol: PROTOCOL,
  execute(facts, port) {
    const script = facts['script'] as ScriptName
    if (!SCRIPTS.includes(script)) return { kind: 'failed', diagnostic: 'unknown_mcp_script' }
    return {
      kind: 'participated',
      response: RUN[script](port, facts['command'] as never) as JsonValue,
    }
  },
} satisfies ParticipantModule
