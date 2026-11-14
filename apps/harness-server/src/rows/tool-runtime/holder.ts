import type { Context } from '@deepseek-ai/cordis'
import {
  canonicalDigest,
  type LedgerCommit,
  type LedgerCommitInput,
  type LedgerRecord,
  type ToolLedgerStore,
} from '@omne-harness/tool'
import type { ToolClock } from '@omne-harness/tool-contract/provider'
import {
  createLocalToolClock,
  type LocalToolForwarding,
  type LocalInvocationQualifier,
} from '@omne-harness/tool-host-local'
import type { createLocalToolRuntimePlugins } from '@omne-harness/tool-host-local/cordis'

import { randomBytes } from 'node:crypto'

type StartConditionalCommit = LocalToolRuntimeInput['conditionalCommit']
import type { PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import {
  decodeToolInstant,
  type ToolBodyPermitKey,
  type ToolBodyStore,
  type ToolInstantClock,
} from '@omne-harness/tool-contract/provider'
import type { SessionWorkPrincipals } from '@omne-harness/session-contract'
import type { SchemaProvider } from '@omne-harness/schema-provider'
import type { LocalToolRuntimeInput } from '@omne-harness/tool-host-local/cordis'
import { createDueTenants, type DueTenants } from './body-sweep.ts'

export type ToolRuntimeBundle = ReturnType<typeof createLocalToolRuntimePlugins> &
  Readonly<{
    qualification: LocalInvocationQualifier<unknown>
  }>

export type ToolSqlPorts = Readonly<{
  store: ToolLedgerStore
  bodies: NonNullable<LocalToolRuntimeInput['bodies']>
  conditional: StartConditionalCommit
}>

type Witnessed = { execution: string; sources: Set<string> }

export type ToolRuntimeHolder = {
  /** Late forwarding work is drained by the business shutdown before the runtime closes. */
  toolsForwarding: LocalToolForwarding<unknown> | null
  readonly clock: ToolClock
  readonly bodyPermitKey: ToolBodyPermitKey
  readonly bodyClock: ToolInstantClock
  sql: ToolSqlPorts | null
  schemaProvider: SchemaProvider | null
  bodySchemas: NonNullable<LocalToolRuntimeInput['bodySchemas']> | null
  workPrincipals: () => SessionWorkPrincipals<unknown> | undefined
  verifier: () => PrincipalVerifier | undefined
  standing: () => TenantStandingSource | undefined
  bundle: Readonly<{ value: ToolRuntimeBundle; configDigest: string }> | null
  readonly ready: Promise<ToolRuntimeBundle>
  readonly resolve: (bundle: ToolRuntimeBundle) => void
  readonly witnessed: Map<string, Witnessed>
  readonly settled: Set<(call: string) => void>
  readonly residents: Map<string, () => number>
  readonly bodyDue: DueTenants
}

export function callKeyOf(tenant: unknown, call: unknown): string {
  return canonicalDigest([tenant, call])
}

function settleCall(holder: ToolRuntimeHolder, call: string): void {
  holder.witnessed.delete(call)
  for (const forget of holder.settled)
    try {
      forget(call)
    } catch {}
}

const holders = new WeakMap<Context, ToolRuntimeHolder>()

export function toolRuntimeHolder(ctx: Context): ToolRuntimeHolder {
  const root = ctx.root
  const found = holders.get(root)
  if (found !== undefined) return found
  let resolve: (bundle: ToolRuntimeBundle) => void = () => {}
  const ready = new Promise<ToolRuntimeBundle>(done => {
    resolve = done
  })
  const created: ToolRuntimeHolder = {
    toolsForwarding: null,
    clock: createLocalToolClock(),
    bodyPermitKey: { secret: randomBytes(32) },
    bodyClock: {
      now: () => {
        const decoded = decodeToolInstant(
          new Date(
            /* wall-clock: clock-source -- Tool body permits, expiry and sweep */ Date.now(),
          ).toISOString(),
        )
        if ('failure' in decoded)
          throw new Error('tool-runtime: the host clock gave a non-canonical instant')
        return decoded.ok
      },
    },
    sql: null,
    schemaProvider: null,
    bodySchemas: null,
    workPrincipals: () => undefined,
    verifier: () => undefined,
    standing: () => undefined,
    bundle: null,
    ready,
    resolve,
    witnessed: new Map(),
    settled: new Set(),
    residents: new Map(),
    bodyDue: createDueTenants(),
  }
  created.residents.set('witnessed', () => created.witnessed.size)
  holders.set(root, created)
  return created
}

const unavailableRead = (diagnostic: string) => ({ kind: 'unavailable' as const, diagnostic })

function noteDue(holder: ToolRuntimeHolder, input: LedgerCommitInput, answer: LedgerCommit): void {
  if (answer.kind !== 'committed' && answer.kind !== 'unknown') return
  for (const write of input.writes)
    if (write.kind === 'schedule') holder.bodyDue.note(input.domain.tenant, write.dueAt)
}

export function lateStore(holder: ToolRuntimeHolder): ToolLedgerStore {
  const observe = (row: LedgerRecord) => {
    if (row.kind !== 'call') return
    const key = callKeyOf(row.call.tenant, row.call.call)
    if (row.call.state.phase === 'settled') {
      settleCall(holder, key)
      return
    }
    if (row.call.execution === null) return
    const execution = canonicalDigest(row.call.execution)
    const old = holder.witnessed.get(key)
    const current = old?.execution === execution ? old : { execution, sources: new Set<string>() }
    current.sources.add(canonicalDigest(row.call.state.source))
    holder.witnessed.set(key, current)
  }
  return Object.freeze({
    durability: 'durable' as const,
    async read(domain) {
      const sql = holder.sql
      if (sql === null) return unavailableRead('tool-records: no SQL ledger store is installed')
      const answer = await sql.store.read(domain)
      if (answer.kind === 'complete') for (const row of answer.records) observe(row)
      return answer
    },
    async due(tenant, now, limit) {
      const sql = holder.sql
      if (sql === null) return unavailableRead('tool-records: no SQL ledger store is installed')
      return sql.store.due(tenant, now, limit)
    },
    async readRecord(domain, key) {
      const sql = holder.sql
      if (sql === null) return unavailableRead('tool-records: no SQL ledger store is installed')
      const answer = await sql.store.readRecord(domain, key)
      if (answer.kind === 'complete' && answer.record !== null) observe(answer.record)
      return answer
    },
    scanPending(input) {
      const sql = holder.sql
      if (sql === null)
        return Promise.resolve(unavailableRead('tool-records: no SQL ledger store is installed'))
      return sql.store.scanPending(input)
    },
    async commit(input) {
      const sql = holder.sql
      if (sql === null) return unavailableRead('tool-records: no SQL ledger store is installed')
      const answer = await sql.store.commit(input)
      noteDue(holder, input, answer)
      if (answer.kind === 'committed')
        for (const write of input.writes)
          if (
            write.kind === 'put' &&
            write.record.kind === 'call' &&
            write.record.call.state.phase === 'settled'
          )
            settleCall(holder, callKeyOf(write.record.call.tenant, write.record.call.call))
      return answer
    },
  } satisfies ToolLedgerStore)
}

export function lateConditional(holder: ToolRuntimeHolder): StartConditionalCommit {
  const conditional: StartConditionalCommit = {
    async commit(input) {
      const sql = holder.sql
      if (sql === null)
        return unavailableRead('tool-records: no SQL conditional commit is installed')
      const answer = await sql.conditional.commit(input)
      if (answer.kind !== 'condition-failed') noteDue(holder, input.ledger, answer)
      return answer
    },
  }
  return Object.freeze(conditional)
}

export function witnessed(
  holder: ToolRuntimeHolder,
  execution: unknown,
  source: unknown,
  key: readonly [unknown, unknown],
): boolean {
  const known = holder.witnessed.get(canonicalDigest(key))
  return (
    known?.execution === canonicalDigest(execution) && known.sources.has(canonicalDigest(source))
  )
}

export function awaitBundle(ctx: Context): Promise<ToolRuntimeBundle> {
  const holder = toolRuntimeHolder(ctx)
  return holder.bundle === null ? holder.ready : Promise.resolve(holder.bundle.value)
}

export function lateBodyStore(holder: ToolRuntimeHolder): ToolBodyStore {
  const unavailable = {
    kind: 'unavailable',
    diagnostic: 'tool-records SQL ports are not mounted',
  } as const
  return Object.freeze({
    durability: 'durable',
    put: (permit, seq, bytes) =>
      holder.sql?.bodies.store.put(permit, seq, bytes) ?? Promise.resolve(unavailable),
    seal: (permit, manifest) =>
      holder.sql?.bodies.store.seal(permit, manifest) ?? Promise.resolve(unavailable),
    read: (body, range) =>
      holder.sql?.bodies.store.read(body, range) ?? Promise.resolve(unavailable),
    delete: body => holder.sql?.bodies.store.delete(body) ?? Promise.resolve(unavailable),
  } satisfies ToolBodyStore)
}
