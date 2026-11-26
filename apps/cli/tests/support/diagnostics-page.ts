// The shapes of a page of session diagnostics, as the server answers them, for the tests that read one.
const adapter = {
  owner: '@omne-harness/model',
  name: 'openai-compatible',
  revision: '1',
  digest: 'd',
}
const unknownTiming = {
  materialize: { kind: 'unknown' },
  sendToFirstContent: { kind: 'unknown' },
  execution: { kind: 'unknown' },
}
export const dispatch = (fields: Record<string, unknown>) => ({
  dispatch: 'd-1',
  revision: '1',
  adapter,
  send: 'not-sent',
  firstContent: 'none-proven',
  outcome: { kind: 'pending' },
  timing: unknownTiming,
  account: { kind: 'unknown', reason: 'not-recorded' },
  ...fields,
})
export const modelCall = (fields: Record<string, unknown>) => ({
  reference: 'ref-1',
  purpose: 'main',
  call: { kind: 'found', call: 'call-1', phase: 'settled' },
  dispatches: [dispatch({})],
  coverage: 'complete-through-snapshot',
  reads: [],
  facts: [],
  ...fields,
})
export const run = (fields: Record<string, unknown>) => ({
  run: 'run-1',
  entry: 'interactive',
  execution: 'exec-1',
  started: { position: '2', at: { kind: 'unknown' } },
  attempts: {
    started: '1',
    released: { ended: '0', bounded: '0', cancelled: '0', released: '0', superseded: '0' },
    exited: '0',
  },
  controls: [],
  terminal: null,
  calls: { registered: '1', projected: '1' },
  modelCalls: [],
  toolCalls: [],
  messages: [{ kind: 'message.user', count: '1' }],
  facts: [],
  ...fields,
})

export interface PageBody {
  readonly runs: readonly unknown[]
  readonly next: string | null
  readonly exhausted: boolean
  readonly scannedThrough: string
  readonly basis: { readonly upper: string }
  readonly gaps: readonly unknown[]
}
export const page = (
  runs: readonly unknown[],
  next: string | null,
  pageGaps: unknown[] = [],
): PageBody => ({
  runs,
  next,
  exhausted: next === null,
  scannedThrough: '0',
  basis: { upper: '9' },
  gaps: pageGaps,
})
