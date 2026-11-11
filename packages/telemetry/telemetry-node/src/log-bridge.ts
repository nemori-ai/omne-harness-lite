import { Logger, type Exporter, type Message } from '@deepseek-ai/cordis'
import { logRecord, type LogRecordInput, type TelemetryRecord } from './record.ts'
import type { TelemetryRuntime } from './runtime.ts'

/** Cordis numbers the levels ERROR 0, INFO 1, WARN 2, DEBUG 3. The bridge exports up to WARN. */
const EXPORTED_LEVEL = 2

/** The text of a message that does not format; the original arguments are not echoed. */
export const UNFORMATTABLE = '<the log message did not format>'

export type CordisLogBridgeCounts = Readonly<{
  /** Bootstrap messages that did not fit in the bootstrap buffer. They were still written. */
  bootstrapOverflow: number
  /** Messages written directly after `detach`. */
  afterClose: number
  /** Messages that did not format and were written with the fixed text. */
  formatFailures: number
  /** Direct writes that threw. Those messages are lost. */
  writeFailures: number
}>

export type CordisLogBridge = Readonly<{
  /** Register it on the root logger before any row loads. */
  exporter: Exporter
  /**
   * Hands later messages to the runtime. With `replayBootstrap`, the buffered bootstrap messages go
   * to the runtime first, marked `bootstrap: true`. Use it when the runtime writes to another
   * outlet than the bridge's `write`; otherwise the messages are already there.
   */
  attach(runtime: TelemetryRuntime, options: Readonly<{ replayBootstrap: boolean }>): void
  /**
   * Writes later messages directly, without the bootstrap buffer and without a count. The buffer
   * is cleared, so a later `attach` replays nothing. Use it when the telemetry row is the disabled
   * implementation. When the row is FAILED or absent, leave the bridge in bootstrap. After `detach`
   * the bridge stays after close.
   */
  direct(): void
  /** Writes later messages directly again, and counts them as `afterClose`. */
  detach(): void
  counts(): CordisLogBridgeCounts
}>

type BridgeState =
  | Readonly<{ kind: 'bootstrap' }>
  | Readonly<{ kind: 'ready'; runtime: TelemetryRuntime }>
  | Readonly<{ kind: 'direct' }>
  | Readonly<{ kind: 'after-close' }>

/**
 * The Cordis log bridge. It has four states: bootstrap (before the telemetry row is ready), ready
 * (attached to a runtime), direct (the row is the disabled implementation; a FAILED or absent row
 * leaves the bridge in bootstrap), and after close (detached). In every state a message up to WARN reaches an outlet; DEBUG is not
 * exported. Neither formatting nor writing throws into the caller that logged.
 */
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
        // A message that cannot be read at all is lost; the caller that logged goes on.
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
