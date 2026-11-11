import { actingScopeCodec, systemScope, type ActingScope } from '@omne-harness/legal-identity'
import type { Carrier, OwnedRef } from '@omne-harness/telemetry-contract'

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'
export type SegmentOutcome = 'ok' | 'failure' | 'unknown'

/** The scope of a record: the JSON object of `actingScopeCodec.encode`. */
export type RecordScope =
  | Readonly<{ kind: 'system' }>
  | Readonly<{ kind: 'tenant'; tenant: Readonly<{ organization: string; account: string }> }>

export type RecordValues = Readonly<Record<string, string | number | boolean>>

/** The correlation members that a record copies from its binding. */
type Correlation = Readonly<{
  scope: RecordScope
  component: string
  work?: OwnedRef
  attempt?: OwnedRef
  call?: OwnedRef
  adopted?: readonly OwnedRef[]
  links?: readonly Carrier[]
}>

type Head = Readonly<{
  kind: 'telemetry'
  time: string
  owner: string
  name: string
  version: number
}>

/** Every record that the runtime forms from a binding carries the generation and the instance. */
type Bound = Head & Correlation & Readonly<{ generation: string; instance: OwnedRef }>

/**
 * One record as the runtime hands it to an outlet. The outlet serializes it. `log` records come
 * only from the Cordis log bridge: the bridge writes them itself before the runtime is attached and
 * after it is detached, and then they have no generation and no instance.
 */
export type TelemetryRecord =
  | (Bound & Readonly<{ signal: 'event'; level: LogLevel; fields: RecordValues }>)
  | (Bound & Readonly<{ signal: 'metric'; value: number; fields: RecordValues }>)
  | (Bound & Readonly<{ signal: 'segment-start'; trace: string; span: string }>)
  | (Bound &
      Readonly<{
        signal: 'segment-event'
        level: LogLevel
        trace: string
        span: string
        fields: RecordValues
      }>)
  | (Bound &
      Readonly<{
        signal: 'segment-end'
        trace: string
        span: string
        outcome: SegmentOutcome
        durationMs: number
      }>)
  | (Head &
      Correlation &
      Readonly<{
        signal: 'log'
        generation?: string
        instance?: OwnedRef
        level: LogLevel
        fields: Readonly<{ text: string }>
        bootstrap?: true
      }>)

/** One Cordis log message, before it becomes a `log` record. */
export type LogRecordInput = Readonly<{
  /** ISO time of the message. */
  time: string
  level: LogLevel
  /** The logger name. */
  component: string
  text: string
  /** The message waited in the bootstrap buffer before the runtime was attached. */
  bootstrap?: boolean
}>

export const LOG_LEVELS: readonly LogLevel[] = ['error', 'warn', 'info', 'debug']
export const LOG_OWNER = 'cordis'
export const LOG_NAME = 'omne.cordis.log'

/**
 * The JSON object of a minted scope, or undefined for a value that legal-identity did not mint. The
 * codec writes exactly the two shapes of `RecordScope`.
 */
export function recordScope(scope: ActingScope): RecordScope | undefined {
  const encoded = actingScopeCodec.encode(scope)
  return encoded.ok ? (JSON.parse(encoded.value) as RecordScope) : undefined
}

const SYSTEM = recordScope(systemScope())

/** A `log` record. The caller has cut the text to its limit. */
export function logRecord(
  input: LogRecordInput,
  run?: Readonly<{ generation: string; instance: OwnedRef }>,
): TelemetryRecord {
  if (SYSTEM === undefined) throw new TypeError('legal-identity did not encode the system scope')
  return {
    kind: 'telemetry',
    signal: 'log',
    time: input.time,
    ...(run !== undefined && { generation: run.generation }),
    owner: LOG_OWNER,
    name: LOG_NAME,
    version: 1,
    level: input.level,
    scope: SYSTEM,
    component: input.component,
    ...(run !== undefined && { instance: run.instance }),
    fields: { text: input.text },
    ...(input.bootstrap === true && { bootstrap: true }),
  }
}
