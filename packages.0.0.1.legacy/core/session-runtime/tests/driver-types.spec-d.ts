import { expectTypeOf } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionDriverControl, SessionDriverCloseResult } from '../src/index.ts'
import { SessionDriverControlService, SESSION_DRIVER_CONTROL } from '../src/cordis.ts'

expectTypeOf<keyof SessionDriverControl>().toEqualTypeOf<'requestStop' | 'close'>()
expectTypeOf<SessionDriverControl['requestStop']>().toEqualTypeOf<() => void>()
expectTypeOf<SessionDriverControl['close']>().toEqualTypeOf<
  () => Promise<SessionDriverCloseResult>
>()
expectTypeOf<SessionDriverControlService>().toExtend<SessionDriverControl>()
expectTypeOf<typeof SESSION_DRIVER_CONTROL>().toEqualTypeOf<'sessionDriverControl'>()
expectTypeOf<Context['sessionDriverControl']>().toEqualTypeOf<SessionDriverControlService>()

declare const control: SessionDriverControl
// @ts-expect-error Driver withdrawal cannot cancel a model call.
control.interrupt
// @ts-expect-error Driver withdrawal cannot cancel a tool execution.
control.cancel
// @ts-expect-error A retained close cannot report successful closure.
const falseClose: Extract<SessionDriverCloseResult, { closed: true }> = { pending: true, held: 1 }
void falseClose
