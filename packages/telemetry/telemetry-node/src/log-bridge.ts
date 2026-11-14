import { Logger, type Exporter, type Message } from '@deepseek-ai/cordis'
import { logRecord, type LogRecordInput, type TelemetryRecord } from './record.ts'
import type { TelemetryRuntime } from './runtime.ts'

const EXPORTED_LEVEL = 2

export const UNFORMATTABLE = '<the log message did not format>'

export type CordisLogBridgeCounts = Readonly<{
  bootstrapOverflow: number
  afterClose: number
  formatFailures: number
  writeFailures: number
}>

export type CordisLogBridge = Readonly<{
  /** Register it on the root logger before any row loads. */
  exporter: Exporter
  attach(runtime: TelemetryRuntime, options: Readonly<{ replayBootstrap: boolean }>): void
  direct(): void
  detach(): void
  counts(): CordisLogBridgeCounts
}>

type BridgeState =
  | Readonly<{ kind: 'bootstrap' }>
  | Readonly<{ kind: 'ready'; runtime: TelemetryRuntime }>
  | Readonly<{ kind: 'direct' }>
  | Readonly<{ kind: 'after-close' }>

export function createCordisLogBridge(
  options: Readonly<{
    bootstrapCapacity: number
    write: (record: TelemetryRecord) => void
    clock: Readonly<{ now(): Date }>
    maxTextLength: number
  }>,
): CordisLogBridge {
  const { bootstrapCapacity, write, clock, maxTextLength } = options
  if (!Number.isSafeInteger(bootstrapCapacity) || bootstrapCapacity < 0)
    throw new TypeError('cordis log bridge: bootstrapCapacity must be a non-negative integer')
  if (!Number.isSafeInteger(maxTextLength) || maxTextLength < 1)
    throw new TypeError('cordis log bridge: maxTextLength must be a positive integer')
  let state: BridgeState = { kind: 'bootstrap' }
  let buffer: LogRecordInput[] = []
  const counts = { bootstrapOverflow: 0, afterClose: 0, formatFailures: 0, writeFailures: 0 }

  function writeDirectly(input: LogRecordInput): void {
    try {
      write(logRecord(input))
    } catch {
      counts.writeFailures += 1
    }
  }

  function text(message: Message): string {
    try {
      return Logger.format(exporter, message).slice(0, maxTextLength)
    } catch {
      counts.formatFailures += 1
      return UNFORMATTABLE
    }
  }

  function receive(input: LogRecordInput): void {
    switch (state.kind) {
      case 'ready':
        state.runtime.ingestLog(input)
        return
      case 'bootstrap':
        writeDirectly(input)
        if (buffer.length < bootstrapCapacity) buffer.push(input)
        else counts.bootstrapOverflow += 1
        return
      case 'direct':
        writeDirectly(input)
        return
      case 'after-close':
        counts.afterClose += 1
        writeDirectly(input)
        return
      default: {
        const exhaustive: never = state
        return exhaustive
      }
    }
  }

  const exporter: Exporter = {
    colors: false,
    levels: { default: EXPORTED_LEVEL },
    export(message) {
      try {
        receive({
          time: clock.now().toISOString(),
          level: message.type,
          component: message.name,
          text: text(message),
        })
      } catch {
        counts.writeFailures += 1
      }
    },
  }

  return Object.freeze({
    exporter,
    attach(runtime, { replayBootstrap }) {
      if (replayBootstrap)
        for (const input of buffer) runtime.ingestLog({ ...input, bootstrap: true })
      buffer = []
      state = { kind: 'ready', runtime }
    },
    direct() {
      if (state.kind === 'after-close') return
      buffer = []
      state = { kind: 'direct' }
    },
    detach() {
      buffer = []
      state = { kind: 'after-close' }
    },
    counts: () => Object.freeze({ ...counts }),
  })
}
