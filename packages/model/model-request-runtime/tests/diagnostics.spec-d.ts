import { expectTypeOf } from 'vitest'
import type {
  DiagnosticAssociation,
  DiagnosticEvent,
  DiagnosticFact,
  DiagnosticQueryResult,
  DiagnosticRecord,
} from '../src/diagnostics-types.ts'
import { createDiagnosticCollector } from '../src/diagnostics.ts'

expectTypeOf(createDiagnosticCollector).toBeFunction()
expectTypeOf<DiagnosticRecord['format']>().toEqualTypeOf<'model-diagnostics/1'>()
expectTypeOf<Extract<DiagnosticFact, { kind: 'transport' }>['httpStatus']>().toEqualTypeOf<
  number | undefined
>()
expectTypeOf<DiagnosticAssociation['causedBy']>().toEqualTypeOf<
  { readonly collectorId: string; readonly sequence: string } | undefined
>()
expectTypeOf<DiagnosticQueryResult>().toMatchTypeOf<
  { readonly page: unknown } | { readonly rejected: string }
>()

const accepted: DiagnosticEvent = {
  source: 'transport',
  stage: 'send',
  outcome: 'failed',
  facts: { kind: 'transport', httpStatus: 503 },
}
expectTypeOf(accepted).toMatchTypeOf<DiagnosticEvent>()

const raw: DiagnosticEvent = {
  source: 'transport',
  stage: 'send',
  outcome: 'failed',
  // @ts-expect-error Arbitrary raw error text has no diagnostics record field.
  facts: { kind: 'transport', raw: 'secret' },
}
const trusted: DiagnosticEvent = {
  source: 'transport',
  stage: 'send',
  outcome: 'failed',
  // @ts-expect-error A trusted flag cannot bypass the source rule.
  facts: { kind: 'transport', trusted: true },
}
// @ts-expect-error Tenant identity is not an optional inferred field.
const invalidScope: DiagnosticRecord['scope'] = { kind: 'tenant' }
// @ts-expect-error A send stage must carry transport facts.
const wrongStage: DiagnosticEvent = {
  source: 'transport',
  stage: 'send',
  outcome: 'failed',
  facts: { kind: 'decision' },
}
void raw
void trusted
void invalidScope
void wrongStage
