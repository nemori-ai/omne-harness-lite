// The frame kinds of session observation and of `observe-session` are the same set, so the
// field-by-field writing in `frameOf` covers every kind and sends no kind outside the contract.
import { expectTypeOf, it } from 'vitest'
import type { FrameOf } from '@omne-harness/access-cordis-contract'
import type {
  SessionObservationEnd,
  SessionObservationFrame,
} from '@omne-harness/session-observation'
import type { SessionProtocol } from '@omne-harness/session-protocol'

type ObserveSession = SessionProtocol['observations']['observe-session']

it('the frame kinds are the same set', () => {
  expectTypeOf<SessionObservationFrame['kind']>().toEqualTypeOf<FrameOf<ObserveSession>['kind']>()
})

it('the end reasons of session observation are the reasons of the contract', () => {
  expectTypeOf<SessionObservationEnd>().toEqualTypeOf<
    ObserveSession['ends'][number] | 'denied' | 'unavailable'
  >()
})
