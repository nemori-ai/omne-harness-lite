import { expectTypeOf } from 'vitest'
import type {
  SessionDriverStartup,
  SessionDriverControl,
  SessionDriverPolicy,
} from '../src/index.ts'
import { SessionDriverStartupService, SESSION_DRIVER_STARTUP } from '../src/cordis.ts'

expectTypeOf<SessionDriverStartupService>().toExtend<SessionDriverStartup>()
expectTypeOf<typeof SESSION_DRIVER_STARTUP>().toEqualTypeOf<'sessionDriverStartup'>()
expectTypeOf<Parameters<SessionDriverStartup['start']>>().toEqualTypeOf<
  [SessionDriverPolicy, AbortSignal]
>()
expectTypeOf<ReturnType<SessionDriverStartup['start']>>().toEqualTypeOf<
  Promise<SessionDriverControl>
>()
declare const policy: SessionDriverPolicy
// @ts-expect-error Process paths are not driver plugin policy.
policy.home
// @ts-expect-error A startup signal is a live method argument, never serialized configuration.
policy.signal
declare const startup: SessionDriverStartup
// @ts-expect-error Controls cannot create ordinary request identity or issue authority.
startup.permit
