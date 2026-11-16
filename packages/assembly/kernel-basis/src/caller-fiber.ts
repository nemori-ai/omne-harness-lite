import type { Context } from '@deepseek-ai/cordis'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'

export type Admission<Entry extends { readonly registration: unknown }, Failure> =
  | Readonly<{ kind: 'entered'; entry: Entry }>
  | Readonly<{ kind: 'recognised'; registration: Entry['registration'] }>
  | Readonly<{ kind: 'refused'; failure: Failure }>

export function registerInCallerFiber<Entry extends { readonly registration: unknown }, Failure>(
  ctx: Context,
  admit: (dropEffect: () => void) => Admission<Entry, Failure>,
  withdrawal: (entry: Entry) => void,
): Outcome<Entry['registration'], Failure> {
  const call: {
    admission?: Admission<Entry, Failure>
    remove?: () => unknown
    dropRequested: boolean
    dropped: boolean
  } = { dropRequested: false, dropped: false }
  const dropEffect = (): void => {
    if (call.dropped) return
    if (call.remove === undefined) {
      call.dropRequested = true
      return
    }
    call.dropped = true
    call.remove()
  }
  call.remove = ctx.effect(() => {
    const admission = admit(dropEffect)
    call.admission = admission
    if (admission.kind !== 'entered') return () => undefined
    const { entry } = admission
    return () => {
      withdrawal(entry)
    }
  }, 'registerInCallerFiber')
  const { admission } = call
  if (admission === undefined) {
    call.remove()
    throw new Error('registerInCallerFiber: the registration effect did not run synchronously')
  }
  if (call.dropRequested) dropEffect()
  switch (admission.kind) {
    case 'entered':
      return succeed(admission.entry.registration)
    case 'recognised':
      dropEffect()
      return succeed(admission.registration)
    case 'refused':
      dropEffect()
      return fail(admission.failure)
    default: {
      const unreachable: never = admission
      return unreachable
    }
  }
}
