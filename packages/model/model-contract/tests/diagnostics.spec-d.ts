import { expectTypeOf, it } from 'vitest'
import type {
  ModelAttemptDiagnostic,
  ModelDiagnosticCursor,
  ModelDiagnosticId,
  ModelDiagnostics,
  ModelDiagnosticsPage,
  ModelDuration,
} from '@omne-harness/model-contract'
import {
  adoption,
  call,
  diagnosticCursor,
  diagnosticId,
  dispatch,
  evidence,
  revision,
  tenant,
} from './values.ts'

const known: ModelDuration = { kind: 'known', milliseconds: '5' }
const entry: ModelAttemptDiagnostic = {
  id: diagnosticId,
  call,
  dispatch,
  revision,
  adapter: adoption,
  send: 'sent',
  firstContent: 'observed',
  outcome: { kind: 'completed', reason: 'stop' },
  timing: { materialize: known, sendToFirstContent: { kind: 'unknown' }, execution: known },
}

it('diagnostic identity and cursor are brands, not plain strings', () => {
  expectTypeOf<ModelDiagnosticId>().not.toEqualTypeOf<ModelDiagnosticCursor>()
  // @ts-expect-error a plain string is not a diagnostic cursor
  const cursor: ModelDiagnosticCursor = 'cursor'
  // @ts-expect-error a diagnostic id is not a cursor
  const swapped: ModelDiagnosticCursor = diagnosticId
  void [cursor, swapped]
})

it('an attempt diagnostic is an allow-listed record without request or response bodies', () => {
  const failed: ModelAttemptDiagnostic = {
    ...entry,
    outcome: { kind: 'failed', cause: 'upstream-unavailable', upstreamStatus: '503' },
  }
  const numericStatus: ModelAttemptDiagnostic = {
    ...entry,
    // @ts-expect-error the upstream status is text, as in the fault it summarises
    outcome: { kind: 'failed', cause: 'upstream-unavailable', upstreamStatus: 503 },
  }
  const overLimit: ModelAttemptDiagnostic = {
    ...entry,
    outcome: { kind: 'failed', cause: 'input-over-limit', upstreamStatus: null },
  }
  const withBody: ModelAttemptDiagnostic = {
    ...entry,
    // @ts-expect-error the original request body is not an allowed field
    body: 'prompt',
  }
  // @ts-expect-error a duration is known with milliseconds or unknown
  const duration: ModelDuration = { kind: 'known' }
  void [failed, numericStatus, overLimit, withBody, duration]
})

it('a diagnostics page names its snapshot, retention and coverage', () => {
  const page: ModelDiagnosticsPage = {
    entries: [entry],
    next: diagnosticCursor,
    snapshot: evidence,
    retention: adoption,
    coverage: 'complete-through-snapshot',
  }
  // @ts-expect-error the page needs its retention adoption
  const noRetention: ModelDiagnosticsPage = { ...page, retention: undefined }
  void noRetention
  const diagnostics: ModelDiagnostics<string> = { list: async () => ({ ok: page }) }
  void diagnostics
})

declare const diagnostics: ModelDiagnostics<string>

it('listing needs the tenant, the call and a branded cursor', () => {
  // @ts-expect-error the tenant is missing
  void diagnostics.list({ principal: 'p', call, after: null, limit: 10 })
  // @ts-expect-error the call is missing
  void diagnostics.list({ principal: 'p', tenant, after: null, limit: 10 })
  // @ts-expect-error a plain string is not a cursor
  void diagnostics.list({ principal: 'p', tenant, call, after: 'next', limit: 10 })
  void diagnostics.list({ principal: 'p', tenant, call, after: diagnosticCursor, limit: 10 })
})
