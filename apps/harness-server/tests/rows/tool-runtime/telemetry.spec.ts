import { randomBytes } from 'node:crypto'
import { expect, it } from 'vitest'
import {
  createDisabledTelemetry,
  createTelemetryRuntime,
  type TelemetryRecord,
} from '@omne-harness/telemetry-node'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { testingTenant } from '@omne-harness/tool-contract/testing'
import type { ToolLifecycleObservation } from '@omne-harness/tool'
import { createToolLifecycleTelemetry } from '../../../src/rows/tool-runtime/telemetry.ts'
import { processInstance } from '../../../src/rows/telemetry/instance.ts'
import { TELEMETRY_ROW_CONFIG } from '../server-entry/support.ts'

function observation(): ToolLifecycleObservation {
  const call = decodeToolCallId('PRIVATE-call-path')
  if ('failure' in call) throw new Error('invalid call fixture')
  return {
    tenant: testingTenant(`org_${'0'.repeat(26)}`, `acc_${'1'.repeat(26)}`),
    call: call.ok,
    phase: 'offload',
    failure: 'none',
    items: 1,
    bytes: 3000,
  }
}

it.each(['enabled', 'capacity', 'output-failure'] as const)(
  'projects bounded Tool observations through a real %s telemetry provider',
  async mode => {
    const records: TelemetryRecord[] = []
    const runtime = createTelemetryRuntime({
      generation: 'tool-lifecycle',
      randomBytes,
      instance: processInstance,
      budgets: { ...TELEMETRY_ROW_CONFIG.budgets, maxQueueItems: mode === 'capacity' ? 1 : 1024 },
      clock: { now: () => new Date(0), monotonicMs: () => 0 },
      outlet: {
        kind: 'writer',
        write: record => {
          if (mode === 'output-failure') throw new Error('PRIVATE output failure')
          records.push(record)
        },
      },
      summary: () => {},
    })
    const measure = createToolLifecycleTelemetry(() => runtime.port, processInstance)
    const event = { ...observation(), secret: 'PRIVATE payload', data: { key: 'PRIVATE data' } }
    expect(() => {
      measure(event)
      measure(event)
    }).not.toThrow()
    const report = await runtime.close(100)
    expect(report.pending).toBe(0)
    if (mode === 'capacity') expect(report.droppedBy.capacity).toBeGreaterThan(0)
    if (mode === 'output-failure') expect(report.droppedBy.output).toBeGreaterThan(0)
    if (mode === 'enabled') {
      expect(report.admitted).toBe(2)
      expect(records).toHaveLength(2)
      expect(records[0]).toMatchObject({
        signal: 'event',
        name: 'omne.tool.material.lifecycle',
        fields: { phase: 'offload', failure: 'none', items: 1, bytes: 3000 },
      })
    }
    expect(JSON.stringify(records)).not.toContain('PRIVATE')
    expect(records.every(record => record.signal === 'event')).toBe(true)
    expect(() => measure(event)).not.toThrow()
  },
)

it('uses the disabled provider and releases no persistent segment pair', async () => {
  const runtime = createDisabledTelemetry()
  const measure = createToolLifecycleTelemetry(() => runtime.port, processInstance)
  measure(observation())
  expect(await runtime.close(100)).toMatchObject({
    dropped: 1,
    droppedBy: { disabled: 1 },
    pending: 0,
  })
  expect(() => measure(observation())).not.toThrow()
})

it('does not replace an absent or throwing telemetry dependency with unscoped output', () => {
  expect(() =>
    createToolLifecycleTelemetry(() => undefined, processInstance)(observation()),
  ).not.toThrow()
  expect(() =>
    createToolLifecycleTelemetry(() => {
      throw new Error('PRIVATE missing provider')
    }, processInstance)(observation()),
  ).not.toThrow()
})
