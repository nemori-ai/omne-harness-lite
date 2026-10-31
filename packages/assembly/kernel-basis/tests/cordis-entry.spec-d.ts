import type { Context } from '@deepseek-ai/cordis'
import {
  definePlugin,
  registerInCallerFiber,
  type Admission,
} from '@omne-harness/kernel-basis/cordis'
import type { Outcome } from '@omne-harness/operation-result'

definePlugin({
  name: 'legal',
  Config: {
    '~standard': {
      version: 1 as const,
      vendor: 'example',
      validate: (_value: unknown) => ({ value: 1 }),
    },
  },
  apply(_ctx: Context, config: number) {
    void config
  },
})

definePlugin({
  name: 'mismatch',
  Config: {
    '~standard': {
      version: 1 as const,
      vendor: 'example',
      // @ts-expect-error A numeric schema cannot pair with an apply that takes string.
      validate: (_value: unknown) => ({ value: 1 }),
    },
  },
  apply(_ctx: Context, _config: string) {
    void _config
  },
})

definePlugin({
  name: 'extra',
  Config: {
    '~standard': {
      version: 1 as const,
      vendor: 'example',
      validate: (_value: unknown) => ({ value: 1 }),
    },
  },
  apply(_ctx: Context, config: number) {
    void config
  },
  // @ts-expect-error provide is not a field of the plugin object.
  provide: 'clock',
})

// registerInCallerFiber: two generics, success type from Entry['registration'], sync callbacks.
type Entry = { readonly registration: { readonly token: string }; readonly key: string }
type Failure = { readonly kind: 'conflict' }
declare const ctx: Context
declare const entry: Entry

const entered: Admission<Entry, Failure> = { kind: 'entered', entry }
const recognised: Admission<Entry, Failure> = { kind: 'recognised', registration: { token: 't' } }
const refused: Admission<Entry, Failure> = { kind: 'refused', failure: { kind: 'conflict' } }
void [entered, recognised, refused]

const outcome: Outcome<{ readonly token: string }, Failure> = registerInCallerFiber<Entry, Failure>(
  ctx,
  _drop => entered,
  (_entry: Entry) => undefined,
)
void outcome

// @ts-expect-error The success type is Entry['registration'], not the entry itself.
const wrongSuccess: Outcome<Entry, Failure> = registerInCallerFiber<Entry, Failure>(
  ctx,
  () => entered,
  () => undefined,
)
void wrongSuccess

registerInCallerFiber<Entry, Failure>(
  ctx,
  // @ts-expect-error A refused admission carries the Failure type, not another shape.
  () => ({ kind: 'refused', failure: { kind: 'denied' } }),
  () => undefined,
)

registerInCallerFiber<Entry, Failure>(
  ctx,
  () => entered,
  // @ts-expect-error Withdrawal receives the Entry, not the registration.
  (_registration: { readonly token: string; readonly extra: number }) => undefined,
)

// @ts-expect-error An Entry without `registration` is not admitted.
registerInCallerFiber<{ readonly key: string }, Failure>(
  ctx,
  () => ({ kind: 'refused', failure: { kind: 'conflict' } }),
  () => undefined,
)
