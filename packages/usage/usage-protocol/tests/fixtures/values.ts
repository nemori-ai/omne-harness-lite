export const sum = { known: '120', unknown: 1, provisional: 0 }
export const measures = {
  calls: 3,
  units: 4,
  retried: 1,
  interrupted: 0,
  failed: [
    { cause: 'no-reply', count: 1 },
    { cause: null, count: 0 },
  ],
  tokens: { input: sum, output: sum, 'cache-read': sum, 'cache-write': sum, reasoning: sum },
  cost: { sums: [{ unit: 'USD', known: '0.0123' }], unknown: 1 },
  duration: {
    total: sum,
    toFirstContent: { count: 2, p50: 310, p90: 900 },
    whole: { count: 0, p50: null, p90: null },
  },
  rates: {
    cacheHit: { kind: 'known', value: '0.75' },
    reasoningShare: { kind: 'unknown' },
    retry: { kind: 'known', value: '0.25' },
    failure: { kind: 'known', value: '0' },
    outputPerSecond: { kind: 'known', value: '41.2' },
  },
}
export const result = {
  total: measures,
  groups: [{ key: ['m-a', null], measures }],
  buckets: [
    {
      start: '2026-11-19T00:00:00Z',
      end: '2026-11-20T00:00:00Z',
      total: measures,
      groups: [],
    },
  ],
  coverage: {
    sources: ['model', 'tool'],
    undated: 2,
    costUnknown: 1,
    excluded: { cacheHit: 0, reasoningShare: 1, outputPerSecond: 0 },
    earliest: null,
  },
}
export const fact = {
  source: 'model',
  subject: { kind: 'model_call', id: 'call-1' },
  unit: 'dispatch-1',
  at: '2026-11-19T10:00:00.120Z',
  consumer: { owner: '@omne-harness/agent', work: 'exec-1/step-1', position: 'p', purpose: 'main' },
  labels: { model: 'm-a', provider: 'p-a', profile: null, tool: null },
  outcome: 'completed',
  cause: null,
  usage: [
    { name: 'input', state: 'known', lexeme: '1000', unit: 'token' },
    { name: 'output', state: 'provisional', lexeme: '12', unit: 'token' },
    { name: 'reasoning', state: 'unknown', unit: 'token' },
  ],
  cost: { state: 'known', lexeme: '0.01', unit: 'USD' },
  durations: { toResponse: 120, toFirstContent: 310, total: null, generation: 900 },
  connectRetries: 0,
  window: { tokens: '200000', compactAtPercent: '80' },
  accounted: true,
}
