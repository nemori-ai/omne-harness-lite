import { STAGES } from './metrics.mjs'

export const workload = {
  kind: 'synthetic',
  modelDelayMs: 20,
  toolDelayMs: 0,
  definition: 'e9-synthetic-v1',
}

export function syntheticEvents(round, kind = 'steady') {
  const clock = { processId: 'synthetic', clockId: 'monotonic', generation: '1' }
  const startMs = round * 100000
  const base = { schemaVersion: 1, runId: 'synthetic-e9', round }
  const timing = { ...base, clock, startMs, endMs: startMs + 20 }
  return [
    {
      ...timing,
      eventKind: 'round-complete',
      endMs: startMs + (kind === 'growth' ? round + 20 : 10000),
      logCount: round * 2,
    },
    ...STAGES.map((stage, index) => ({
      ...timing,
      clock: { ...clock },
      eventKind: 'stage',
      stage,
      endMs: startMs + (kind === 'singleGrowth' && index === 0 ? round : 10),
    })),
    {
      ...timing,
      clock: { ...clock },
      eventKind: 'external-wait',
      provider: 'model',
      invocationId: `model-${round}`,
      definedDelayMs: 20,
    },
    {
      ...base,
      eventKind: 'fsync-count',
      count: 2,
      source: 'synthetic',
      traceRef: 'synthetic:no-system-calls',
      roundAssociation: `synthetic round ${round}`,
    },
  ]
}

export async function open() {
  return { nextRound: async round => syntheticEvents(round), close: async () => {} }
}
