import { actingScopeCodec, systemScope, type ActingScope } from '@omne-harness/legal-identity'
import type { Carrier, OwnedRef } from '@omne-harness/telemetry-contract'

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'
export type SegmentOutcome = 'ok' | 'failure' | 'unknown'

export type RecordScope =
  | Readonly<{ kind: 'system' }>
  | Readonly<{ kind: 'tenant'; tenant: Readonly<{ organization: string; account: string }> }>

export type RecordValues = Readonly<Record<string, string | number | boolean>>

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

type Bound = Head & Correlation & Readonly<{ generation: string; instance: OwnedRef }>

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

export type LogRecordInput = Readonly<{
  time: string
  level: LogLevel
  component: string
  text: string
  bootstrap?: boolean
}>

export const LOG_LEVELS: readonly LogLevel[] = ['error', 'warn', 'info', 'debug']
export const LOG_OWNER = 'cordis'
export const LOG_NAME = 'omne.cordis.log'

export function recordScope(scope: ActingScope): RecordScope | undefined {
  const encoded = actingScopeCodec.encode(scope)
  return encoded.ok ? (JSON.parse(encoded.value) as RecordScope) : undefined
}

const SYSTEM = recordScope(systemScope())

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
