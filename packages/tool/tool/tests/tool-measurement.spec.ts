import { describe, expect, it } from 'vitest'
import { executeTool } from '@omne-harness/tool'
import { scope } from './scope-values.ts'
import {
  createMeasuredFixedDelayTool,
  type MonotonicReading,
  type ToolMeasurementEvent,
} from './support/tool-measurement.ts'

describe('E9 fixed-delay Tool execution observations', () => {
  it('runs the real independent execution path and emits one same-clock interval per call', async () => {
    const events: ToolMeasurementEvent[] = []
    const executor = createMeasuredFixedDelayTool({
      definedDelayMs: 5,
      result: 'observed',
      measurement: { runId: 'e9', round: 2, logCount: 200, emit: event => events.push(event) },
    })
    for (let call = 0; call < 2; call++)
      expect(await executeTool(null, executor, null, scope().scope)).toEqual({ ok: 'observed' })
    expect(events).toHaveLength(2)
    expect(new Set(events.map(event => event.invocationId)).size).toBe(2)
    for (const event of events) {
      expect(event).toMatchObject({
        runId: 'e9',
        round: 2,
        eventKind: 'external-wait-interval',
        stage: 'tool-fixed-delay',
        provider: 'measured-fixed-delay-tool',
        outcome: 'completed',
        definedDelay: { value: 5, unit: 'ms' },
        logCount: { state: 'measured', value: 200 },
      })
      expect(event.start.process).toBe(String(process.pid))
      expect(event.start.clock).toBe('node:perf_hooks/performance.now')
      expect(event.end.generation).toBe(event.start.generation)
      expect(event.actualStart).toEqual(event.start)
      expect(event.actualEnd).toEqual(event.end)
      expect(event.elapsedMs).toEqual({
        state: 'measured',
        value: event.end.atMs - event.start.atMs,
      })
      expect(event.end.atMs).toBeGreaterThanOrEqual(event.start.atMs)
    }
  })

  it('records cancellation without reporting that the defined delay completed', async () => {
    const events: ToolMeasurementEvent[] = []
    const execution = scope()
    const executor = createMeasuredFixedDelayTool({
      definedDelayMs: 1000,
      result: 'must not return',
      measurement: { runId: 'cancel', round: 1, emit: event => events.push(event) },
      wait: async () => {
        execution.controller.abort()
      },
    })
    expect(await executeTool(null, executor, null, execution.scope)).toHaveProperty('failure')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      outcome: 'cancelled',
      logCount: { state: 'unmeasured', reason: 'not-provided' },
    })
  })

  it('does not invent elapsed time when the clock generation changes', async () => {
    const events: ToolMeasurementEvent[] = []
    let reading = 0
    const clock = {
      read: (): MonotonicReading => ({
        process: 'process',
        clock: 'test-clock',
        generation: String(reading++),
        atMs: 12,
      }),
    }
    const executor = createMeasuredFixedDelayTool({
      definedDelayMs: 0,
      result: 'done',
      wait: async () => undefined,
      measurement: {
        runId: 'mixed',
        round: 1,
        logCount: -1,
        clock,
        emit: event => events.push(event),
      },
    })
    await executeTool(null, executor, null, scope().scope)
    expect(events[0]).toMatchObject({
      elapsedMs: { state: 'unmeasured', reason: 'clock-mismatch' },
      logCount: { state: 'unmeasured', reason: 'invalid-count' },
    })
  })
})
