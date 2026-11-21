import { expectTypeOf, test } from 'vitest'
import type { Codec, TenantId } from '@omne-harness/public-contract'
import {
  type SessionDiagnosticsProtocol,
  sessionDiagnosticsProtocol,
} from '@omne-harness/session-diagnostics-protocol'

type Operation = SessionDiagnosticsProtocol['operations']['read-session-diagnostics']
type ValueOf<C> = C extends Codec<infer T> ? T : never
type Body = ValueOf<Operation['body']>
type Page = ValueOf<Operation['outcomes']['succeeded']>

test('the contract is session-diagnostics major 1 with one operation', () => {
  expectTypeOf(sessionDiagnosticsProtocol.name).toEqualTypeOf<'session-diagnostics'>()
  expectTypeOf(sessionDiagnosticsProtocol.major).toEqualTypeOf<1>()
  expectTypeOf<
    keyof SessionDiagnosticsProtocol['operations']
  >().toEqualTypeOf<'read-session-diagnostics'>()
  expectTypeOf<keyof SessionDiagnosticsProtocol['observations']>().toEqualTypeOf<never>()
})

test('the body is a first page or a continuation, split by the cursor', () => {
  expectTypeOf<Body>().toEqualTypeOf<
    | {
        readonly tenant: TenantId
        readonly session: string
        readonly cursor: null
        readonly run: string | null
        readonly pageBytes: string
      }
    | { readonly tenant: TenantId; readonly session: string; readonly cursor: string }
  >()
})

test('the page carries runs, next, exhausted, scannedThrough, basis and gaps', () => {
  expectTypeOf<keyof Page>().toEqualTypeOf<
    'runs' | 'next' | 'exhausted' | 'scannedThrough' | 'basis' | 'gaps'
  >()
  expectTypeOf<Page['basis']>().toEqualTypeOf<{ readonly upper: string }>()
  expectTypeOf<Page['gaps'][number]['source']>().toEqualTypeOf<
    'session' | 'agent' | 'model' | 'tool'
  >()
})

test('each model call says, for each block, which form of it the model read', () => {
  type Read = Page['runs'][number]['modelCalls'][number]['reads'][number]
  expectTypeOf<Read>().toEqualTypeOf<{
    readonly message: string
    readonly block: string
    readonly read: 'original' | 'fitted' | 'derived' | 'transcript'
  }>()
})

test('an invalid result has an empty body', () => {
  expectTypeOf<ValueOf<Operation['outcomes']['invalid']>>().toExtend<
    Readonly<Record<string, never>>
  >()
})
