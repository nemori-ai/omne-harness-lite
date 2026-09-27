import { expectTypeOf } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import {
  checkAppendInput,
  openJsonlSessionLog,
  type JsonlSessionLog,
  type AppendCondition,
  type SessionLog,
  type SessionRef,
} from '../src/index.ts'
import '../src/plugin.ts'

expectTypeOf(openJsonlSessionLog).returns.toEqualTypeOf<Promise<JsonlSessionLog>>()
expectTypeOf(checkAppendInput).parameter(3).toEqualTypeOf<unknown>()
expectTypeOf<AppendCondition>().toEqualTypeOf<
  | { readonly kind: 'unconditional' }
  | {
      readonly kind: 'tailEquals'
      readonly tail: import('@omne-harness-lite/content-blocks').JsonNumber
    }
>()
declare const service: SessionLog
declare const context: Context
declare const session: SessionRef
expectTypeOf(context.get('sessionLog')).toEqualTypeOf<SessionLog | undefined>()
// @ts-expect-error close belongs to the owner closure, not the three-operation service.
service.close()
// @ts-expect-error condition is mandatory; there is no three-argument compatibility path.
service.append(session, [], { kind: 'unfenced' })
// @ts-expect-error a caller must supply a trusted physical process lifecycle port.
openJsonlSessionLog({ dir: '/missing-ownership' })
