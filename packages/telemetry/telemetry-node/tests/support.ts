import {
  accountCodec,
  organizationCodec,
  systemScope,
  tenant,
  tenantScope,
  type ActingScope,
} from '@omne-harness/legal-identity'
import {
  defineEvent,
  defineMetric,
  defineSegment,
  type Binding,
} from '@omne-harness/telemetry-contract'
import {
  createTelemetryRuntime,
  type TelemetryBudgets,
  type TelemetryRecord,
  type TelemetryRuntime,
  type TelemetryRuntimeOptions,
} from '../src/index.ts'

function parsed<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('test identity text did not parse')
  return result.value
}

const BODY = '0123456789abcdefghjkmnpqrs'

/** A scope minted by legal-identity for one tenant. */
export function aTenantScope(): ActingScope {
  return tenantScope(
    tenant(
      parsed(organizationCodec.parse(`org_${BODY}`)),
      parsed(accountCodec.parse(`acc_${BODY}`)),
    ),
  )
}

export const INSTANCE = Object.freeze({ owner: 'apps/harness-server', ref: 'run-1' })

export function systemBinding(): Binding {
  return {
    scope: systemScope(),
    component: 'server-entry',
    instance: { owner: 'apps/harness-server', ref: 'server-entry' },
  }
}

export const loginFailed = defineEvent({
  owner: 'access',
  name: 'omne.entry.diagnostic',
  version: 1,
  level: 'warn',
  schema: {
    code: { kind: 'enum', values: ['identity.fault', 'identity.denied'] },
    retried: { kind: 'boolean' },
    attempts: { kind: 'number', min: 0, max: 10 },
    request: { kind: 'ref', owner: 'access', maxBytes: 64 },
  },
})

export const requests = defineMetric({
  owner: 'access',
  name: 'omne.entry.requests',
  version: 1,
  unit: '1',
  aggregation: { kind: 'counter' },
  schema: { outcome: { kind: 'enum', values: ['ok', 'failure'] } },
})

export const handling = defineSegment({ owner: 'access', name: 'omne.entry.handle', version: 1 })

export const BUDGETS: TelemetryBudgets = Object.freeze({
  maxRecordBytes: 4096,
  maxQueueItems: 64,
  maxQueueBytes: 1_000_000,
  maxOpenSegments: 4,
  maxLogTextLength: 200,
  summaryIntervalMs: 1000,
})

/** A clock that the test moves. `monotonicMs` starts at 0. */
export type ManualClock = {
  now(): Date
  monotonicMs(): number
  advance(ms: number): void
}

export function manualClock(): ManualClock {
  let ms = 0
  const epoch = Date.parse('2026-11-05T00:00:00.000Z')
  return {
    now: () => new Date(epoch + ms),
    monotonicMs: () => ms,
    advance(step) {
      ms += step
    },
  }
}

/** Deterministic, never all-zero bytes. */
export function countingBytes(): (n: number) => Uint8Array {
  let next = 0
  return n => {
    next += 1
    return Uint8Array.from({ length: n }, (_, index) => (next + index) % 256 || 1)
  }
}

export type Harness = {
  runtime: TelemetryRuntime
  clock: ManualClock
  written: TelemetryRecord[]
  summaries: string[]
}

/**
 * A runtime with a writer outlet that keeps every record. `write` replaces the writer body; it
 * receives the record and the list of records written so far.
 */
export function harness(
  input: Partial<Omit<TelemetryRuntimeOptions, 'budgets'>> & {
    budgets?: Partial<TelemetryBudgets>
    write?: (record: TelemetryRecord, written: TelemetryRecord[]) => void
  } = {},
): Harness {
  const clock = manualClock()
  const written: TelemetryRecord[] = []
  const summaries: string[] = []
  const write =
    input.write ??
    ((record: TelemetryRecord, list: TelemetryRecord[]) => {
      list.push(record)
    })
  const runtime = createTelemetryRuntime({
    generation: 'g1',
    instance: INSTANCE,
    clock,
    randomBytes: countingBytes(),
    outlet: { kind: 'writer', write: record => write(record, written) },
    summary: line => {
      summaries.push(line)
    },
    ...input,
    budgets: { ...BUDGETS, ...input.budgets },
  })
  return { runtime, clock, written, summaries }
}

/** Lets the runtime drain its queue once. */
export function nextTurn(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

/** One field value of a record, for the signals that carry fields. */
export function fieldOf(record: TelemetryRecord | undefined, key: string): unknown {
  if (record === undefined || !('fields' in record)) return undefined
  return Object.entries(record.fields).find(([name]) => name === key)?.[1]
}

/** The trace and span of a segment record. */
export function idsOf(record: TelemetryRecord | undefined): { trace?: string; span?: string } {
  if (record === undefined || !('trace' in record)) return {}
  return { trace: record.trace, span: record.span }
}

/** True for a log record that waited in the bootstrap buffer. */
export function isBootstrap(record: TelemetryRecord | undefined): boolean {
  return record !== undefined && 'bootstrap' in record && record.bootstrap === true
}
