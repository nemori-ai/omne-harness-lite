import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { parseTenantId } from '@omne-harness-lite/identity-values'
import { writeJsonLossless, type JsonNumber } from '@omne-harness-lite/content-blocks'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
import { type SessionLog, type AppendResult } from '@omne-harness-lite/session-log'
import { createSettlementCoordinator } from '../src/settlement-coordinator.ts'
import {
  type SettlementOwner,
  type SettlementTask,
  type SettlementTaskKind,
  type SettlementRegistration,
  type SettlementContention,
  type SettlementScheduler,
  type SettlementLogBinding,
  type SettlementRequest,
} from '../src/settlement-types.ts'
import { anchors, session, tenant } from './log-codec-fixture.ts'
import { responseV5 } from './log-codec-v2-fixture.ts'

export function deferred<T>() {
  let accept: ((value: T) => void) | undefined
  const promise = new Promise<T>(resolve => {
    accept = resolve
  })
  return {
    promise,
    resolve(value: T) {
      if (!accept) throw new Error('deferred resolver')
      accept(value)
    },
  }
}
export class ControlledSettlementOwner implements SettlementOwner {
  readonly name = 'controlled-originally-empty-all-writers'
  active = 0
  releases = 0
  starts: SettlementTaskKind[] = []
  state: 'open' | 'closed' = 'open'
  openedState: ReturnType<SettlementOwner['opened']> = { confirmed: true }
  oldWrites: SettlementTask<AppendResult>[] = []
  stopBarrier: Promise<void> | undefined
  readonly admission = () => this.state
  readonly opened = () => this.openedState
  readonly unresolvedWrites = () => this.oldWrites
  readonly acquire = (limit: JsonNumber) => {
    if (
      this.state !== 'open' ||
      ExactDecimal.from(this.active).compare(ExactDecimal.from(limit)) >= 0
    )
      return { unavailable: true as const }
    this.active++
    let running = 0,
      released = false
    const registration: SettlementRegistration = {
      start: <T>(
        kind: SettlementTaskKind,
        operation: (signal: AbortSignal) => Promise<T>,
      ): SettlementTask<T> => {
        this.starts.push(kind)
        running++
        const controller = new AbortController()
        // Registration above precedes the first call into the real provider.
        const completion = Promise.resolve().then(() => operation(controller.signal))
        const stopped = completion
          .then(
            () => undefined,
            () => undefined,
          )
          .then(async () => {
            if (this.stopBarrier) await this.stopBarrier
            running--
          })
        return { completion, requestStop: () => controller.abort(), stopped }
      },
      release: () => {
        if (running !== 0 || released) throw new Error('released a live/double registration')
        released = true
        this.active--
        this.releases++
      },
    }
    return { registration }
  }
}
export function policy(submissions: JsonNumber = 1): SettlementContention {
  return {
    name: 'controlled-one-submission-zero-wait',
    limits: { submissions, elapsedMs: 100000, retainedBytes: 1000000, concurrent: 2 },
    decide: () => ({ proceed: { waitMs: 0 } }),
  }
}
export const noWaitScheduler: SettlementScheduler = {
  nowMonotonicMs: () => 0,
  wait() {
    throw new Error('zero-wait policy cannot call timer')
  },
}
export const request: SettlementRequest = {
  target: { call: 'call', dispatch: 1, response: 'response' },
  current: { messageId: 'winner-message', disposition: 'persisted' },
  response: responseV5,
}
export async function controlled(
  name: string,
  work: (input: {
    binding: SettlementLogBinding
    owner: ControlledSettlementOwner
    dir: string
    reopen: () => Promise<SettlementLogBinding>
    wrap: (log: SessionLog) => SettlementLogBinding
    coordinator: ReturnType<typeof createSettlementCoordinator>
    submissions: { fence: unknown; condition: unknown; count: number }[]
  }) => Promise<void>,
) {
  const evidenceRoot = fileURLToPath(
    new URL('../../../../tmp/model-request-runtime/m1-settlement/jsonl/', import.meta.url),
  )
  await mkdir(evidenceRoot, { recursive: true })
  const dir = await mkdtemp(join(evidenceRoot, `${name}-`))
  const sql = new DatabaseSync(join(dir, 'owner.sqlite'))
  sql.exec(
    'CREATE TABLE controlled_session_tenant(session TEXT PRIMARY KEY, organization TEXT NOT NULL, account TEXT NOT NULL)',
  )
  sql
    .prepare('INSERT INTO controlled_session_tenant VALUES(?,?,?)')
    .run(session, tenant.organization, tenant.account)
  const row = sql
    .prepare('SELECT organization, account FROM controlled_session_tenant WHERE session=?')
    .get(session)
  const parsed = parseTenantId(row)
  if (!('ok' in parsed)) throw new Error('actual SQL tenant mapping')
  let log = await openJsonlSessionLog({
    dir: join(dir, 'log'),
    processOwnership: {
      current: `settlement-controlled:${process.pid}`,
      async observeExit() {
        return 'unknown'
      },
    },
  })
  const submissions: { fence: unknown; condition: unknown; count: number }[] = []
  const port: SessionLog = {
    readSince: async (...args) => await log.readSince(...args),
    readByKey: async (...args) => await log.readByKey(...args),
    async append(s, entries, fence, condition) {
      submissions.push({ fence, condition, count: entries.length })
      return await log.append(s, entries, fence, condition)
    },
  }
  let generation = Object.freeze({})
  const wrap = (source: SessionLog): SettlementLogBinding => ({
    session,
    tenant: parsed.ok,
    log: source,
    generation,
    currentGeneration: () => generation,
  })
  const reopen = async () => {
    await log.close()
    generation = Object.freeze({})
    log = await openJsonlSessionLog({
      dir: join(dir, 'log'),
      processOwnership: {
        current: `settlement-reopened:${process.pid}`,
        async observeExit() {
          return 'unknown'
        },
      },
    })
    return wrap(port)
  }
  const binding = wrap(port),
    owner = new ControlledSettlementOwner()
  const coordinator = createSettlementCoordinator({
    binding,
    owner,
    settlementContention: policy(),
    settlementScheduler: noWaitScheduler,
    diagnostic() {},
  })
  try {
    const initial = anchors().entries.map(
      ({ session: _session, position: _position, ...entry }) => entry,
    )
    const added = await port.append(
      session,
      initial,
      { kind: 'unfenced' },
      { kind: 'unconditional' },
    )
    if ('failure' in added) throw new Error('initial anchors')
    await work({ binding, owner, dir, reopen, wrap, coordinator, submissions })
    const prefix = await log.readSince(session, 0)
    await writeFile(join(dir, 'readback.json'), writeJsonLossless(prefix))
  } finally {
    await coordinator.close()
    await log.close()
    sql.close()
    await writeFile(
      join(dir, 'append-matrix.json'),
      JSON.stringify(
        {
          scope:
            'Only this controlled originally empty log; SQL actual session mapping. All writers are enumerated port append and injected wrappers, no production authorization/physical-batch provenance certification.',
          writers: ['initial anchors', 'runtime single response', 'external persisted whole batch'],
          calls: submissions,
        },
        null,
        2,
      ),
    )
  }
}
