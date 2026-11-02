import type { Context } from '@deepseek-ai/cordis'
import { expectTypeOf } from 'vitest'
import type { IdentityClock } from '@omne-harness/identity'
import { IdentityClockService, identityClockKey } from '@omne-harness/identity/cordis'

expectTypeOf<IdentityClockService['now']>().toEqualTypeOf<IdentityClock['now']>()

declare const ctx: Context
expectTypeOf(ctx[identityClockKey]).toEqualTypeOf<IdentityClockService>()
// @ts-expect-error a reading stays asynchronous
const wrongNow: IdentityClockService['now'] = () => ({ kind: 'unavailable', diagnostic: 'x' })
// @ts-expect-error the definition needs a concrete provider
new IdentityClockService(ctx)
void wrongNow
