// Compile-time checks of the root contract. Each `@ts-expect-error` marks a call that the types
// must reject; the run-time rules that back them are in the other test files.
import { expectTypeOf, it } from 'vitest'
import {
  defineEvent,
  defineMetric,
  type Admission,
  type CloseDropReason,
  type CloseReport,
  type DropReason,
  type Emitter,
  type Fields,
  type Segment,
} from '../src/index.ts'

const failed = defineEvent({
  owner: 'packages/session/session',
  name: 'omne.session.step.failed',
  version: 1,
  level: 'error',
  schema: {
    code: { kind: 'enum', values: ['timeout', 'refused'] },
    retried: { kind: 'boolean' },
    elapsed: { kind: 'number', min: 0, max: 60 },
    session: { kind: 'ref', owner: 'packages/session/session', maxBytes: 64 },
  },
})

declare const emitter: Emitter

it('derives the field types from the schema', () => {
  expectTypeOf<Fields<typeof failed.schema>>().toEqualTypeOf<{
    readonly code: 'timeout' | 'refused'
    readonly retried: boolean
    readonly elapsed: number
    readonly session: string
  }>()
})

it('accepts declared fields of the declared types', () => {
  expectTypeOf(
    emitter.event(failed, { code: 'timeout', retried: true, elapsed: 1, session: 'ses-1' }),
  ).toEqualTypeOf<Admission>()
})

it('rejects undeclared keys, missing keys and wrong types', () => {
  // @ts-expect-error `message` is not declared in the schema.
  emitter.event(failed, { code: 'timeout', retried: true, elapsed: 1, session: 's', message: 'x' })
  // @ts-expect-error `session` is missing.
  emitter.event(failed, { code: 'timeout', retried: true, elapsed: 1 })
  // @ts-expect-error `crashed` is not one of the enum values.
  emitter.event(failed, { code: 'crashed', retried: true, elapsed: 1, session: 's' })
  // @ts-expect-error `retried` is a boolean, not a string.
  emitter.event(failed, { code: 'timeout', retried: 'yes', elapsed: 1, session: 's' })
  // @ts-expect-error `elapsed` is a number, not a string.
  emitter.event(failed, { code: 'timeout', retried: true, elapsed: '1', session: 's' })
  // @ts-expect-error An Error object is never a field value.
  emitter.event(failed, { code: new Error('x'), retried: true, elapsed: 1, session: 's' })
})

const diagnostic = defineEvent({
  owner: 'server-entry',
  name: 'omne.entry.diagnostic',
  version: 1,
  level: 'warn',
  schema: {
    code: { kind: 'enum', values: ['request.fault'] },
    path: { kind: 'ref', owner: 'server-entry', maxBytes: 256, optional: true },
  },
})

it('lets an optional field be omitted and keeps the other fields required', () => {
  expectTypeOf<Fields<typeof diagnostic.schema>>().toEqualTypeOf<{
    readonly code: 'request.fault'
    readonly path?: string
  }>()
  expectTypeOf(emitter.event(diagnostic, { code: 'request.fault' })).toEqualTypeOf<Admission>()
  emitter.event(diagnostic, { code: 'request.fault', path: '/sessions' })
  // @ts-expect-error `code` is not optional.
  emitter.event(diagnostic, { path: '/sessions' })
  // @ts-expect-error `path` is a reference, not a number.
  emitter.event(diagnostic, { code: 'request.fault', path: 1 })
  defineEvent({
    owner: 'server-entry',
    name: 'omne.entry.diagnostic',
    version: 1,
    level: 'warn',
    // @ts-expect-error The optional marker is `true` or absent, never `false`.
    schema: { path: { kind: 'ref', owner: 'server-entry', maxBytes: 256, optional: false } },
  })
})

it('accepts enum and boolean labels and rejects number and ref labels', () => {
  defineMetric({
    owner: 'packages/model/model',
    name: 'omne.model.calls',
    version: 1,
    unit: '1',
    aggregation: { kind: 'counter' },
    schema: { outcome: { kind: 'enum', values: ['ok'] }, streamed: { kind: 'boolean' } },
  })
  defineMetric({
    owner: 'packages/model/model',
    name: 'omne.model.calls',
    version: 1,
    unit: '1',
    aggregation: { kind: 'counter' },
    // @ts-expect-error A label cannot be a reference: references have unbounded cardinality.
    schema: { call: { kind: 'ref', owner: 'packages/model/model', maxBytes: 64 } },
  })
  defineMetric({
    owner: 'packages/model/model',
    name: 'omne.model.calls',
    version: 1,
    unit: '1',
    aggregation: { kind: 'counter' },
    // @ts-expect-error A label cannot be a number.
    schema: { tokens: { kind: 'number', min: 0, max: 10 } },
  })
})

it('returns a segment or a dropped answer from startSegment', () => {
  expectTypeOf(emitter.startSegment).returns.toEqualTypeOf<
    Segment | Extract<Admission, { kind: 'dropped' }>
  >()
})

declare const report: CloseReport

it('keys droppedBy by every drop reason and by output, and keeps output out of an admission', () => {
  expectTypeOf<CloseDropReason>().toEqualTypeOf<DropReason | 'output'>()
  expectTypeOf(report.droppedBy.output).toEqualTypeOf<number | undefined>()
  expectTypeOf(report.droppedBy.expired).toEqualTypeOf<number | undefined>()
  // @ts-expect-error `output` is a fact of the close report, never the reason of an admission.
  const admission: Admission = { kind: 'dropped', reason: 'output' }
  void admission
  // @ts-expect-error `droppedBy` has no key outside CloseDropReason.
  void report.droppedBy.unknown
})
